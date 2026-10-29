# Attributions and Third-Party Notices

## Project

- **HANZET-SCRAPER** — maintained in the [Hanzet22/Sekereper repository](https://github.com/Hanzet22/Sekereper).
- Project license: **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**. See [LICENSE](./LICENSE).
- The project license covers this project's own copyrightable material only; it does not replace or override third-party licenses.

## Error-page video assets

These externally hosted MP4s are displayed on the matching HTML error pages. The Catbox links are used for playback; the original-post links and titles below identify the source references provided for each video. Attribution does not itself grant a license or confirm permission to redistribute or embed third-party media. Rights remain with the respective creators or rights holders.

| HTTP status | Hosted video | Original source | Title / description |
|---|---|---|---|
| **404 — Page Not Found** | [Catbox MP4](https://files.catbox.moe/yfd0hd.mp4) | [ASML on X](https://x.com/ASMLcompany/status/2069359810638696769) | *Making advanced chips requires more than advanced lithography.* The animation highlights how metrology, inspection, and computational lithography work together in chip manufacturing. |
| **418 — I'm a Teapot** | [Catbox MP4](https://files.catbox.moe/06uaw4.mp4) | [FurryGintan on X](https://x.com/FurryGintan/status/2105046499369599098) | 🔵🐸 |
| **403 — Forbidden** | [Catbox MP4](https://files.catbox.moe/v2xl73.mp4) | [YouTube Shorts](https://youtube.com/shorts/qzXwpAejVSw?si=-O_XJOUgLIxtmDic) | *I Get Knocked Out! #simpsons #meme #bartsimpson #chairposting* |
| **429 — Too Many Requests** | [Catbox MP4](https://files.catbox.moe/9yah42.mp4) | [YouTube](https://youtu.be/ULMgiajXqtQ?si=E_O4VTg7va_a_1Ko) | *It's Not My Wallet, BRUH* — SpongeBob in The Hood #31, Hood VO Toons Parodies. |

The video player is rendered only for matching HTML error responses. API clients receiving JSON error responses do not receive the embedded player. The videos load from Catbox at request time and may fail if the host or source file becomes unavailable. Confirm applicable permissions and platform terms before production use.

## Runtime dependencies

The following are direct dependencies declared in `package.json`. Their upstream licenses are listed for attribution and compliance review; consult each package's own distributed license and notices for the exact terms applicable to the version installed.

| Dependency | Upstream project | License |
|---|---|---|
| Cheerio | [cheerio](https://github.com/cheeriojs/cheerio) | MIT |
| dotenv | [dotenv](https://github.com/motdotla/dotenv) | BSD-2-Clause |
| Express | [express](https://github.com/expressjs/express) | MIT |
| ipaddr.js | [ipaddr.js](https://github.com/whitequark/ipaddr.js) | MIT |
| Playwright | [playwright](https://github.com/microsoft/playwright) | Apache-2.0 |

These dependencies are separate projects and remain under their respective licenses. Their full license texts are normally distributed with the installed packages and/or available in their upstream repositories.

## Historical references (deprecated/)

The following libraries are referenced by the archived Java prototype in `deprecated/Bucket4jRateLimiter.java`. They are **not declared as dependencies of the current Node.js runtime**; this is attribution context only, not a statement that those artifacts are bundled or installed.

| Library | Upstream project | License (verify against exact historical version) |
|---|---|---|
| Bucket4j | [bucket4j](https://github.com/bucket4j/bucket4j) | Apache-2.0 |
| Javalin | [javalin](https://github.com/javalin/javalin) | Apache-2.0 |
| Gson | [gson](https://github.com/google/gson) | Apache-2.0 |

## Other tools

- **Node.js** is a required runtime (Node.js 20 or later); it is not vendored by this repository.
- **Playwright browser binaries** may have their own applicable notices and license terms. Review Playwright's official documentation and installed package notices when installing browsers.

## Contributor and provenance notes

This file records the direct dependency attributions known from the current `package.json`; it is not a complete software bill of materials (SBOM). Transitive dependencies may introduce additional copyright notices and licenses. Before redistributing a packaged build, generate and review a dependency license inventory for the exact lockfile/install tree, and preserve required notices.

If a contributor adds third-party code or assets, they should update this file and ensure that the material can lawfully be distributed under the applicable terms.
