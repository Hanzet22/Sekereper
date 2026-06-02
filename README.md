# HANZET-SCRAPER v2.0
> Universal Polyglot Scraper — Full Stack Architecture (By Claude)
> Author: Farhan (海鹏 鸟神 / Hanzet22)

---

## 🏗️ Architecture

```
index.html (Universal Orchestrator)
├── HYBRID IN-BROWSER
│   ├── HTML5 + CSS3
│   ├── TypeScript (Babel inline transpile)
│   ├── React 18 (CDN) — Stats Panel
│   ├── Vue 3 (CDN) — Batch Manager
│   ├── MathML (native HTML5)
│   ├── KaTeX (CDN) — fast math
│   ├── MathJax (CDN) — full LaTeX
│   └── XML/XHTML data layer (JS parsed)
│
├── BACKEND (fetch → localhost:3131)
│   ├── Node.js + Express
│   ├── Layer 1: Custom Token Bucket Middleware
│   ├── Cheerio (static scrape)
│   ├── Playwright Chromium (dynamic scrape)
│   └── Tor SOCKS5 (socks5h://127.0.0.1:9050)
│
├── JVM BACKEND (fetch → localhost:8080)
│   ├── Java + Javalin HTTP server
│   ├── Layer 2: Bucket4j Token Bucket
│   ├── Per-user quota + API key limits
│   └── Auto-block after 50 violations
│
└── GITHUB MODULES (dynamic script load)
    ├── Hopper v2.1.1 (proxy hop)
    └── Heap Guard v1.1 (memory guard)
```

---

## 🛡️ Double Rate Limiting

| Layer | Technology | Scope | Limit |
|-------|-----------|-------|-------|
| 1 | Node.js Token Bucket | Per IP + Per Endpoint | 10 req/min (/scrape) |
| 2 | Bucket4j (Java) | Per User + API Key | 15 req/min + burst |

---

## 🚀 Setup

### 1. Node.js Backend
```bash
cd hanzet-scraper
npm install express cors cheerio axios playwright socks-proxy-agent
npx playwright install chromium
node server.js
# → http://localhost:3131
```

### 2. JVM Backend (Bucket4j)
```bash
cd hanzet-scraper/jvm
gradle run
# → http://localhost:8080
```

### 3. Tor (optional)
```bash
# Linux
sudo apt install tor && sudo service tor start

# Mac
brew install tor && brew services start tor

# Manual
tor &
```

### 4. Frontend
```bash
# Langsung buka index.html di browser
# atau serve via:
npx serve .
# → http://localhost:3000
```

---

## 📦 GitHub Modules (Hanzet22/PCAPDROID-JS-FEATURE)

| Module | File | Version |
|--------|------|---------|
| Hopper | Tes-hopper.js | v2.1.1 (fixed) |
| Heap Guard | Heap-Memory-Guard.js | v1.1 (fixed) |

Load via dashboard → Module Registry → LOAD button

---

## 🔌 Future Modules (GitHub → fetch)

| Language | Runtime | Deploy |
|----------|---------|--------|
| PHP | Apache/Nginx | GitHub Actions |
| C# | .NET | GitHub Actions |
| Ruby / JRuby | Ruby/JVM | GitHub Actions |
| Lua | Lua runtime | GitHub Actions |
| Swift | Linux Swift | GitHub Actions |
| Scala | JVM | GitHub Actions |
| Groovy | JVM | GitHub Actions |
| Clojure | JVM / ClojureScript | GitHub Actions |
| Jython | JVM | GitHub Actions |

---

## 📡 API Endpoints

### Node.js (3131)
- `POST /scrape` — `{ url, mode: 'static'|'dynamic', tor: bool }`
- `POST /scrape/batch` — `{ urls: [...], mode, tor }` (max 10)
- `GET /health`
- `GET /admin/stats`
- `POST /admin/block` — `{ ip }`
- `POST /admin/unblock` — `{ ip }`

### JVM Bucket4j (8080)
- `POST /ratelimit/check` — `{ userKey, apiKey, endpoint }`
- `GET /ratelimit/stats`
- `POST /ratelimit/block` — `{ ip, minutes }`
- `POST /ratelimit/unblock` — `{ ip }`
- `GET /health`
