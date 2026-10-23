# WEB 2 continuation — 2026-10-16

The interrupted local SEO/integration phase is complete. This session continued
the existing working tree; it did not reset, reinstall, or recreate the project.

## State found on entry

The active application is the root `server.js`, HTML pages, `script.js`, and
`lib/`. The archived applications remain separate. Git showed 73 modified
tracked paths outside `node_modules`, plus untracked hardening, operations,
and SEO additions. Tracked dependency deletions in the archived frontend also
predated this session and were left intact.

The existing changes included:

- Root server/configuration and `lib/`: strict origins and HTTPS, explicit
  proxy trust, payload/route validation, session versions and revocation,
  phone-bound recovery grants, atomic OTP attempt limits, bounded login and
  checkout budgets, public response allowlists, private static paths, safe
  URLs, and database protection for the final active SUPER_ADMIN.
- `script.js`, `style.css`, `css/`, and `js/`: search debouncing, simpler card
  effects, reduced motion, image dimensions/loading, account/admin fixes,
  CSRF handling, and desktop/mobile layout work.
- `scripts/backup.cjs`, `scripts/restore.cjs`, `scripts/monitor.cjs`, and
  `deploy/`: verified SQLite snapshots, offline restore, readiness/health,
  safe request logging, shutdown, PM2/Nginx/compression examples, and rollout
  instructions.
- `lib/seo.cjs`, `catalog.html`, `404.html`, public HTML/server hooks,
  `img/social/`, and `tests/seo.test.cjs`: the most recent, partially
  integrated work on server-rendered discovery and metadata.
- Existing tests covered accounts, user/admin authorization and UI,
  recovery/CAPTCHA/SMS, commerce transactions, catalog/cache migrations,
  browser layouts, operations, archived input boundaries, and security
  regressions. There were 26 test files.

Before editing, `node scripts/check.cjs` passed. The full existing suite
reported 164/175 passing. All security suites passed. The 11 reported failures
included cascading SEO failures, two incomplete cart DOM fixtures, and a
Chromium evaluation timeout. No active-source syntax errors or merge conflict
markers were found. Chromium subsequently passed both alone and in the full
suite; its timeout was not addressed by removing assertions or increasing
timeouts.

## Incomplete work completed

1. Removed the obsolete robots/sitemap handlers from `lib/commerce.cjs`.
   They intercepted requests before `lib/seo.cjs`, omitting catalog/category
   URLs and the new robots rules.
2. Fixed dynamic HTML substitutions to use replacer functions. Escaping markup
   alone did not prevent JavaScript replacement tokens (`$&`, dollar/backtick,
   and dollar/apostrophe) in product/category text from expanding template
   fragments and corrupting HTML/JSON-LD. An adversarial HTTP regression first
   reproduced this defect and then passed with the fix. Existing escaping,
   JSON-LD encoding, and exact CSP hashes remain enforced.
3. Made the generated login-modal link and failed-image fallback resolve from
   the site root on nested category pages. Product-card links were already
   correct and were retained.
4. Reused one Persian number formatter per SEO installer instead of creating
   a formatter for every rendered number.
5. Updated incomplete DOM fixtures and SEO assertions: inspect the actual
   `loading` attribute, permit an absent brand without fabricating one, parse
   sitemap XML, and explicitly request ETag revalidation.
6. Extended jsdom and real Chromium coverage for category/catalog routes,
   preserved server content, root-relative account/product/media paths,
   desktop/mobile overflow, and literal hostile product text. Browser timeout
   diagnostics now identify the evaluated expression.
7. Repaired the product-verification CLI's old relative-link expectations.
   Running it exposed another unfinished interaction: repeated catalog/settings
   downloads exhausted the application's 300 API requests/minute budget.
   The read-only verifier now shares only anonymous public catalog/settings
   GET snapshots within one run. Product endpoints, page requests, and session
   checks still reach the server; private/cookie-bearing requests and failed
   responses are not reused. Server request limits were unchanged.
8. Updated README instructions for the current routes, operations tools,
   implemented password recovery, and available browser tests.

## Files edited in this session

| File | Change |
| --- | --- |
| `lib/commerce.cjs` | Remove duplicate discovery routes |
| `lib/seo.cjs` | Literal HTML substitutions; reuse number formatter |
| `script.js` | Root-relative image fallback and login-modal link |
| `scripts/verify-products.cjs` | Current link contract; reuse public read snapshots |
| `tests/cart.test.cjs` | Complete DOM fixtures |
| `tests/seo.test.cjs` | Fix assertions and extend adversarial/enhancement coverage |
| `tests/admin-browser.test.cjs` | Catalog/category browser coverage and timeout diagnostics |
| `README.md` | Current run, SEO, recovery, testing, and operations instructions |
| `docs/security-hardening.md` | Record completion after the historical inspection |
| `docs/continuation.md` | This handoff |

Browser tests refreshed `.runtime/visual-*.png` and
`.runtime/admin-users-*.png`, including new category screenshots at 1440px and
390px. The product CLI wrote `var/product-detail-verification.json`.

## Verification

| Check | Final result |
| --- | --- |
| `node scripts/check.cjs` | Pass: active/archived JavaScript syntax, HTML IDs, script duplication, CSP compatibility, and local references |
| `node --test tests/cart.test.cjs tests/seo.test.cjs` | 25/25 pass |
| `node --test tests/admin-browser.test.cjs` | Pass in real Chromium |
| `npm test` | 175/175 pass; no failures, skips, cancellations, or TODOs |
| Product CLI against a disposable server/database | 69/69 products pass with fresh and stale caches; zero failures; normal throttles enabled |
| `node --check scripts/verify-products.cjs` after its final update | Pass |
| `npm audit --json` in the active root app | Zero advisories across production and development dependencies |
| Conflict-marker and Git whitespace checks | Pass with Windows CRLF recognized |

The full suite includes HTTP security, concurrent checkout/stock handling,
idempotency, recovery races, access controls, persistence, temporary database
backup/restore, and Chromium checks at 1440px/390px. Security improvements were
preserved. Test servers used disposable databases; this session did not change
the project's `.env`, active SQLite database, or live deployment.

## Remaining work outside this completed phase

- Apply and verify the deployment plan on the actual VPS: HTTPS/domain,
  Nginx/PM2 configuration, loopback binding, firewall/SSH rules, private-page
  caching, scheduled backup/rotation, and offsite recovery. The dated findings
  in `deploy/live-audit-2026-10-15.md` are historical observations, not a current
  live audit. No deployment was performed in this session.
- Configure and verify production Turnstile and real SMS credentials, and
  implement a real payment provider before accepting real payments. Existing
  production fail-closed checks remain in place.
- Complete staging load tests and manual accessibility/device/browser checks.
  Automated Chromium layout tests do not establish production capacity or
  coverage of other browser engines.

Deployment details remain in `deploy/production-rollout.md` and
`deploy/operations.md`. No local source task remains open for the interrupted
SEO/integration phase.

## Phase 17 completed — 2026-10-19

Performance work is complete locally. The full measured report and exact changed-file manifest are in `docs/phase17-performance.md`; raw before/after and timed memory results are in `docs/benchmarks/phase17-*.json`.

The active app remains root `server.js` / SQLite WAL with FULL durability and one PM2 fork. Security, CSRF, rate limits, required revisions, audit records, persistence safety and bcrypt cost were retained. Changes include bounded SQL list pages and summaries, indexed detail/checkout reads, one-pass analytics, async image validation, bounded/version-invalidated public HTML caching, asset fingerprints, frontend request coalescing/cancellation, cart/search work reduction, bounded grids and paged admin lists. CORS exposes the pagination headers to the explicitly allowed development frontend.

Final `npm test`: 198/198 pass with real Chromium desktop/mobile, no failures/skips. `npm run check`, asset fingerprint verification, report-output guard checks and legacy revision checks passed. Full before/after benchmarks use synthetic temporary data and normal protections. The 20-round timed memory run showed 0.18 MiB retained heap delta and roughly 79 MiB RSS. No production data or `.env` was changed.

No npm install is required. Build content references after future JS/CSS edits with `npm run build:assets`. Deployment requires restarting the existing single PM2 app; updated Nginx examples require the upstream and request-limit HTTP-context files, `nginx -t`, and an explicit Nginx reload. The optional static cache includes an edge request budget for cache hits. VPS Nginx/TLS/cache behavior and longer staging traffic remain unverified; no production deployment occurred. Keep existing unrelated working-tree changes intact.
**Phase 18 completed locally — 2026-10-19**

The current SQLite/WAL/FULL v16 store remains authoritative. Its implementation moved to `storage/sqlite/adapter.cjs` with a compatibility export from `lib/database.cjs`. Runtime driver/configuration, typed repository contracts, named domain query modules, bounded pages, notification/audit repositories and safe storage errors now form the boundary; SQL no longer appears in active controllers/services. Existing auth, CSRF, rate limits, revisions, backup behavior and transactions remain.

Offline normalized SQLite schema v1, explicit checksum migrations, a read-only legacy JSON source, conflict/reference validation, staged exclusive imports, verification and portable rehearsal export were added. **This rehearsal format is intentionally not a runtime driver.** Live security-state conversion and the PostgreSQL async adapter/pool are future work and block production cutover. Do not point `DATABASE_PATH` or `SQLITE_PATH` at a rehearsal file. Current JSON is only a seed and is not a complete live-data export.

See `docs/phase18-migration-readiness.md` and `docs/phase18-validation.json` for the current audit, tests, exact file manifest, actual benchmark artifacts and unexecuted migration checklist. Tests and benchmarks use temporary synthetic data. The original `data.json` hash is unchanged; no live SQLite data, real `.env`, PM2 process or Nginx configuration was modified. No npm install is required; backend deployment requires a single-process restart.

## Phase 18 resumption audit — 2026-10-20

The previous session stopped after writing its final Phase 18 handoff and
validation record. All 69 hashed files matched that record on entry; its final
test log recorded 218/218 passing. No truncated source edits or syntax errors
were found. Existing changes and archived dependency deletions were preserved.

Further review reproduced three offline import validation gaps: impossible
calendar dates were silently normalized into different indexed dates, malformed
administrator email values passed dry-run before failing during insertion, and
replay keys for anonymous orders passed dry-run before failing the owner FK.
`storage/migration/validate.cjs` now rejects those cases before target creation.
Anonymous historical orders without replay keys remain supported.

`tests/migration-validation.test.cjs` adds four regressions covering those
failures, leap years, timezone offsets, private field-only reports and unchanged
sources/absent targets in both dry-run and apply mode. Three regressions failed
before the fix; all 24 dedicated migration/storage tests pass afterward. The
shipped seed dry-run still passes with its same three historical warnings.

The initial full run passed 217/218; Chromium's GPU subprocess crashed under
the execution sandbox before page assertions. The identical browser test passed
outside that sandbox with all desktop/mobile assertions retained. The final full
run passed 222/222, with no failures, skips, cancellations or TODOs. All eight
protected seed/environment/database files retained their original hashes and
modification times. Results and current source checksums are recorded under
`resumptionAudit` in `docs/phase18-validation.json`. No production data,
environment, deployment or infrastructure
configuration was changed. No package installation is required. Restart the
single PM2 app when deploying the accumulated backend changes; no restart was
performed here. PostgreSQL/runtime cutover and production infrastructure work
remain the separately documented future work.

## Phase 19 final continuation — 2026-10-21

The interrupted work was the final security review, not a new performance or
storage phase. Before this resumption, the shared recent-administrator-login
policy, asynchronous administrator credential/session rechecks and transactional
customer 2FA rechecks were already implemented in `lib/admin-security.cjs`,
`lib/commerce.cjs`, `lib/management.cjs`, `lib/user-management.cjs` and
`lib/account.cjs`. Those implementations were preserved without further edits.
The isolated race tests, registered-route/CSRF matrix, route inventory, README
links and initial security report were also saved. The bounded dependency audit
had completed with zero advisories. Its report status was still pending.

The previous full log recorded 241/243 passing: Chromium's GPU subprocess
crashed at startup, and the intro test's fixed wall-clock wait expired before
its nested removal timer ran. `tests/admin.test.cjs` now advances the reveal
and removal timers explicitly, verifies page unlocking, flushes asynchronous
welcome work and always closes its windows. Existing skip, reduced-motion and
authentication assertions remain. Application animation timing did not change.

The focused intro and unchanged standalone Chromium tests passed. The first
resumed full suite passed 242/243, with only the sandbox Chromium startup crash
remaining. The identical final suite passed **243/243** outside the execution
sandbox, including desktop/mobile Chromium, all security races and route/CSRF
checks, checkout concurrency, persistence, backup/restore, performance and
migration regressions. There were no failures, skips, cancellations or TODOs.
`node scripts/check.cjs` and whitespace checks also passed.

Only the intro test, `docs/phase19-security.md` and this handoff were edited
during the final resumption; browser tests refreshed `.runtime/` screenshots.
All eight protected seed, environment and database/WAL/SHM files retain their
original hashes and modification times. Final logs, exact source hashes and
comparisons are recorded in `.runtime/phase19-final-validation.json`; the
passing full log is `.runtime/phase19-final-tests-unrestricted.log`. The
inherited implementation and inventory are described in
[phase19-security.md](phase19-security.md) and
[phase19-route-inventory.md](phase19-route-inventory.md).

No local Phase 19 task remains unfinished. No npm install/ci or browser asset
rebuild is required. Deploying the accumulated backend fixes requires a restart
of the existing single PM2 app; no process or infrastructure was changed here.
Production rollout, provider credentials/payment integration, staging/manual
checks and the future PostgreSQL/runtime cutover remain the separately
documented future work.

## Phase 22 — secure domain/HTTPS architecture (2026-10-22)

HTTPS READINESS: **NOT READY**. The complete conditional Ubuntu A-H runbook is
[deploy/phase22-https.md](../deploy/phase22-https.md). No real domain/VPS identity
was confirmed; no DNS, SSH, firewall, certificate, PM2, remote service or reboot
action was performed. The old external audit remains a historical observation.
The unchanged local `.env` fails production transport/provider requirements and
administrator password validation. The existing `PAYMENTS_UNAVAILABLE` release
blocker remains enforced. Do not bypass these gates to deploy TLS or code.

The target remains one PM2 fork named web2, **127.0.0.1:3000**, behind local
Nginx HTTPS. Production startup now rejects non-loopback HOST values, including
explicit public IPs/hostnames. The final Nginx template uses YOUR_DOMAIN /
www.YOUR_DOMAIN, with canonical apex redirects, ACME-only port-80 exception,
private-file/dotfile guards, localhost upstream, sanitized forwarding headers,
bounded bodies/timeouts, existing edge budgets and safe logs. Existing WEB 2
bare-IP HTTP proxies must become canonical redirects at cutover. The old bare-IP
example is marked historical; unrelated virtual hosts are preserved.

Express still owns application security headers and secure __Host- cookies.
HSTS is deliberately opt-in (`HSTS_MAX_AGE=0` by default); begin with 300 seconds
only after trusted HTTPS, flows and renewal work. No includeSubDomains/preload
is emitted. `scripts/https-preflight.cjs` checks offline transport/origin/CORS
configuration and optionally consumes PM2 JSON through stdin without exposing
environment values, rejecting duplicate processes, stale transport overrides
and the wrong release path. It is not a DNS/TLS or overall release readiness
check. Anonymous smoke now checks Permissions-Policy and Nginx version disclosure;
`--require-hsts` verifies the later HSTS phase instead of requiring it on day one.

Phase 22 source files changed:

- `.env.example`, `README.md`, `server.js`, `lib/runtime-config.cjs`.
- `scripts/https-preflight.cjs` (new), `scripts/production-smoke.cjs`,
  `scripts/release-check.cjs`.
- `deploy/nginx.conf.example`, `deploy/nginx-sensitive-locations.conf.example`,
  `deploy/nginx-http-acme.conf.example` (new),
  `deploy/nginx-http-ip.conf.example` (historical-use comment).
- `deploy/phase22-https.md` (new), `deploy/phase21-production.md`, this handoff.
- `tests/https-deployment.test.cjs` (new), `tests/helpers/security-server.cjs`,
  `tests/security-boundaries.test.cjs`, `tests/security-route-matrix.test.cjs`.

Validation:

- Focused HTTPS, production tools, startup and release tests: **27/27 passed**.
- `npm run check:production`: syntax, references, page IDs and CSP checks passed.
- First active production suite: 287/288; the sole failure was Chromium's GPU
  sandbox startup. The identical full suite rerun with approved execution outside
  the sandbox passed **288/288**, no failures/skips/cancellations/TODOs, including
  actual desktop/mobile Chromium and all registered-route/CSRF/security races.
- All **34 Bash command blocks** in the guide parsed with Bash `-n`; local
  guide links passed. Source whitespace and final artifact checks were recorded
  in `.runtime/phase22-validation.json`.
- The before/after SHA-256 hashes for `.env`, `data.json`, `var/web2.sqlite`, WAL
  and SHM are unchanged. Browser tests refreshed only normal `.runtime/` PNG
  artifacts; all test databases and credentials were synthetic/disposable.
- The read-only production release check still returns NO-GO with asset hashes,
  secret scanning and package-lock consistency passing. It prints names/codes,
  never secret values. No dependency or browser-asset changes were needed.

Logs: `.runtime/phase22-production-tests.log` (sandbox failure),
`.runtime/phase22-production-tests-unrestricted.log` (passing full run).
`.runtime/phase22-guide-check.cjs` / `.runtime/phase22-guide.sh` are disposable
local validation artifacts, excluded from releases.

There is no Nginx binary in this Windows workspace. The examples have not passed
a live `nginx -t`; VPS/SSH/UFW/package/DNS/TLS/renewal checks, external 80/443/3000
checks, live HTTPS admin/customer flows and eventual reboot survival remain
mandatory. Do not describe isolated local tests as a successful public deployment.
