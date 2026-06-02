// ╔══════════════════════════════════════════════════════════╗
// ║  HANZET-SCRAPER — Bucket4j JVM Rate Limiter  v1.0      ║
// ║  Java + Bucket4j Library                               ║
// ║  Layer 2 of 2 — per-user quota & API key limits        ║
// ║  Author: Farhan (海鹏 鸟神 / Hanzet22)                   ║
// ╚══════════════════════════════════════════════════════════╝
//
// Dependencies (pom.xml / build.gradle):
//   io.github.bucket4j:bucket4j-core:8.7.0
//   io.javalin:javalin:6.1.3          ← lightweight HTTP server
//   org.slf4j:slf4j-simple:2.0.9
//
// Compile & Run:
//   gradle run   atau   mvn spring-boot:run
//   Server jalan di http://localhost:8080
//
// Compatible dengan: Scala, Groovy, Clojure, JRuby, Jython
// (semua JVM language bisa import class ini langsung)

package com.hanzet.scraper;

import io.github.bucket4j.*;
import io.javalin.Javalin;
import io.javalin.http.Context;
import com.google.gson.Gson;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class Bucket4jRateLimiter {

    // ─── GSON ────────────────────────────────────────────────
    private static final Gson gson = new Gson();

    // ─── BUCKET STORE — per userKey (IP atau API key) ────────
    // ConcurrentHashMap biar thread-safe
    private static final Map<String, Bucket> userBuckets   = new ConcurrentHashMap<>();
    private static final Map<String, Bucket> apiBuckets    = new ConcurrentHashMap<>();
    private static final Map<String, Long>   blockList     = new ConcurrentHashMap<>();
    private static final Map<String, Stats>  statsMap      = new ConcurrentHashMap<>();

    // ─── BANDWIDTH CONFIGS ───────────────────────────────────
    // Token Bucket: kapasitas + refill rate

    /** Default per-user: 100 req per menit */
    static Bandwidth defaultUserLimit() {
        return Bandwidth.builder()
            .capacity(100)
            .refillGreedy(100, Duration.ofMinutes(1))
            .build();
    }

    /** Scrape endpoint: 15 req per menit */
    static Bandwidth scrapeLimit() {
        return Bandwidth.builder()
            .capacity(15)
            .refillGreedy(15, Duration.ofMinutes(1))
            .build();
    }

    /** Batch endpoint: 5 req per menit */
    static Bandwidth batchLimit() {
        return Bandwidth.builder()
            .capacity(5)
            .refillGreedy(5, Duration.ofMinutes(1))
            .build();
    }

    /** API Key premium: 500 req per menit */
    static Bandwidth premiumApiLimit() {
        return Bandwidth.builder()
            .capacity(500)
            .refillGreedy(500, Duration.ofMinutes(1))
            .build();
    }

    /** Burst protection: max 20 req per 5 detik */
    static Bandwidth burstLimit() {
        return Bandwidth.builder()
            .capacity(20)
            .refillGreedy(20, Duration.ofSeconds(5))
            .build();
    }

    // ─── GET OR CREATE BUCKET ────────────────────────────────
    static Bucket getUserBucket(String userKey, String endpoint) {
        String bucketKey = userKey + ":" + endpoint;
        return userBuckets.computeIfAbsent(bucketKey, k -> {
            Bandwidth limit = switch (endpoint) {
                case "/scrape"       -> scrapeLimit();
                case "/scrape/batch" -> batchLimit();
                default              -> defaultUserLimit();
            };
            // Double bandwidth: normal limit + burst protection
            return Bucket.builder()
                .addLimit(limit)
                .addLimit(burstLimit())
                .build();
        });
    }

    static Bucket getApiBucket(String apiKey) {
        return apiBuckets.computeIfAbsent(apiKey, k ->
            Bucket.builder()
                .addLimit(premiumApiLimit())
                .addLimit(burstLimit())
                .build()
        );
    }

    // ─── STATS TRACKER ──────────────────────────────────────
    static class Stats {
        long totalHits   = 0;
        long blocked     = 0;
        long lastHit     = System.currentTimeMillis();

        void hit(boolean allowed) {
            totalHits++;
            lastHit = System.currentTimeMillis();
            if (!allowed) blocked++;
        }

        String blockRate() {
            if (totalHits == 0) return "0%";
            return String.format("%.1f%%", (blocked * 100.0 / totalHits));
        }
    }

    // ─── CHECK RATE LIMIT ────────────────────────────────────
    static record RateLimitResult(
        boolean allowed,
        long remainingTokens,
        long nanosToWait,
        String reason
    ) {}

    static RateLimitResult checkLimit(String userKey, String apiKey, String endpoint) {
        // API key check (premium path)
        if (apiKey != null && !apiKey.isBlank()) {
            Bucket bucket    = getApiBucket(apiKey);
            ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
            String statsKey  = "apikey:" + apiKey;
            statsMap.computeIfAbsent(statsKey, k -> new Stats()).hit(probe.isConsumed());

            if (!probe.isConsumed()) {
                return new RateLimitResult(false, probe.getRemainingTokens(),
                    probe.getNanosToWaitForRefill(), "API key quota exceeded");
            }
            return new RateLimitResult(true, probe.getRemainingTokens(), 0, "ok");
        }

        // User/IP check
        if (blockList.containsKey(userKey)) {
            long unblockAt = blockList.get(userKey);
            if (System.currentTimeMillis() < unblockAt) {
                return new RateLimitResult(false, 0,
                    (unblockAt - System.currentTimeMillis()) * 1_000_000L,
                    "IP temporarily blocked");
            } else {
                blockList.remove(userKey); // auto-unblock
            }
        }

        Bucket bucket         = getUserBucket(userKey, endpoint);
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        String statsKey        = userKey + ":" + endpoint;
        Stats stats            = statsMap.computeIfAbsent(statsKey, k -> new Stats());
        stats.hit(probe.isConsumed());

        // Auto-block kalau blocked > 50x dalam satu session
        if (!probe.isConsumed() && stats.blocked > 50) {
            long blockDuration = 5 * 60 * 1000L; // 5 menit
            blockList.put(userKey, System.currentTimeMillis() + blockDuration);
            System.out.printf("[BUCKET4J] AUTO-BLOCK %s — blocked %d times%n",
                userKey, stats.blocked);
        }

        if (!probe.isConsumed()) {
            return new RateLimitResult(false, probe.getRemainingTokens(),
                probe.getNanosToWaitForRefill(), "Rate limit exceeded");
        }

        return new RateLimitResult(true, probe.getRemainingTokens(), 0, "ok");
    }

    // ─── JAVALIN HTTP SERVER ─────────────────────────────────
    public static void main(String[] args) {
        var app = Javalin.create(config -> {
            config.bundledPlugins.enableCors(cors ->
                cors.addRule(rule -> rule.anyHost())
            );
        }).start(8080);

        System.out.println("[BUCKET4J] JVM Rate Limiter v1.0 running at :8080");

        // ── Health check
        app.get("/health", ctx -> ctx.json(Map.of(
            "status",  "ok",
            "layer",   "bucket4j-jvm",
            "version", "1.0"
        )));

        // ── Main rate limit check endpoint
        // Dipanggil dari Node.js middleware sebelum forward ke scraper
        app.post("/ratelimit/check", ctx -> {
            var body     = gson.fromJson(ctx.body(), Map.class);
            String user  = (String) body.getOrDefault("userKey",  "unknown");
            String api   = (String) body.getOrDefault("apiKey",   "");
            String ep    = (String) body.getOrDefault("endpoint", "/scrape");

            RateLimitResult result = checkLimit(user, api, ep);

            ctx.header("X-Bucket4j-Remaining", String.valueOf(result.remainingTokens()));

            if (!result.allowed()) {
                long retryMs = result.nanosToWait() / 1_000_000;
                ctx.header("Retry-After", String.valueOf(retryMs / 1000));
                ctx.status(429).json(Map.of(
                    "allowed",     false,
                    "reason",      result.reason(),
                    "retryAfterMs",retryMs,
                    "remaining",   result.remainingTokens()
                ));
                return;
            }

            ctx.json(Map.of(
                "allowed",   true,
                "remaining", result.remainingTokens(),
                "reason",    "ok"
            ));
        });

        // ── Stats endpoint
        app.get("/ratelimit/stats", ctx -> {
            var out = new ConcurrentHashMap<String, Object>();
            statsMap.forEach((k, v) -> out.put(k, Map.of(
                "totalHits", v.totalHits,
                "blocked",   v.blocked,
                "blockRate", v.blockRate(),
                "lastHit",   v.lastHit
            )));
            ctx.json(out);
        });

        // ── Manual block/unblock
        app.post("/ratelimit/block", ctx -> {
            var body    = gson.fromJson(ctx.body(), Map.class);
            String ip   = (String) body.get("ip");
            long  mins  = ((Number) body.getOrDefault("minutes", 30)).longValue();
            blockList.put(ip, System.currentTimeMillis() + mins * 60 * 1000);
            System.out.printf("[BUCKET4J] MANUAL BLOCK %s for %d mins%n", ip, mins);
            ctx.json(Map.of("blocked", ip, "minutes", mins));
        });

        app.post("/ratelimit/unblock", ctx -> {
            var body  = gson.fromJson(ctx.body(), Map.class);
            String ip = (String) body.get("ip");
            blockList.remove(ip);
            System.out.printf("[BUCKET4J] UNBLOCK %s%n", ip);
            ctx.json(Map.of("unblocked", ip));
        });

        // ── Reset bucket
        app.post("/ratelimit/reset", ctx -> {
            var body    = gson.fromJson(ctx.body(), Map.class);
            String key  = (String) body.get("key");
            userBuckets.remove(key);
            apiBuckets.remove(key);
            statsMap.remove(key);
            ctx.json(Map.of("reset", key));
        });
    }
}
