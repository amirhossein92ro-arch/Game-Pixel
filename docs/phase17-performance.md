# Phase 17 performance work — 2026-10-19

All measurements use disposable SQLite databases and loopback servers. Production data, `.env`, and the running deployment were not modified. The active app was already SQLite with WAL and FULL synchronous durability; `data.json` is a startup seed. No storage migration or dependency installation was introduced.

## Method and baseline

Environment: Windows, Node v24.21.0, 4 available CPU threads, approximately 8 GiB system RAM. These are local burst measurements, not a VPS capacity guarantee. The baseline was collected before application edits: three trials for the core workload and one additional trial for analytics and 5/10/25/50-concurrent stages. After measurements repeat the same workload three times. The extra memory mode spaces requests over 20 seconds.

Fixtures are entirely synthetic: the catalog profile has 69 products, 20 accounts, and 100 orders; growth has 400 products, 250 accounts, and 1,500 orders. Login uses real cost-12 bcrypt. Normal origin, CAPTCHA test adapter, CSRF, authorization, rate limits, request budgets, and SQLite durability stay enabled. Checkout measurements use quotes and deliberately invalid checkout submissions against temporary data. Successful concurrent stock reservation, idempotency, and rollback are covered by the HTTP regression suite.

The benchmark records latency through body download, average/p50/p95/p99, requests per second, errors, process CPU milliseconds, heap/RSS/external memory, 10 ms resolution event-loop delay, startup time, and synchronous filesystem/preparation counts. Instrumentation is a test-child preload with IPC; no production metrics endpoint exists. Small endpoint sample counts, especially three password logins and analytics reads per trial, make their upper percentiles descriptive rather than SLA estimates. The client and server share this machine. Nginx/TLS are outside the local measurements.

Raw JSON under `docs/benchmarks/` records every measurement. Core before/after tables use the median of three trials. Analytics and load-stage baselines use the one extended baseline trial. Public HTML and compatibility list responses now cap rows at 100, so the growth comparison includes a smaller initial response as well as faster processing. A paged public API returns a maximum of 100 rows; the browser fetches remaining public summaries for its existing local search/cart behavior.

## Bottlenecks and backend changes

- Public rendering performed synchronous realpath/stat checks repeatedly for product images. It now uses asynchronous checks, shares only in-flight checks, and retains realpath containment checks. Startup template, fingerprint, migration, and atomic backup I/O remain synchronous deliberately; none are request hot paths.
- Public HTML caches hold at most 32 entries / 8 MiB / 30 seconds. Store revision and SQLite data_version are checked before use. Committed app writes and writes from another connection invalidate content; rolled-back writes do not contaminate pages. CSP hashes are reapplied per response. Authentication and private responses are not cached.
- Product details and checkout use indexed record lookups instead of decoding/scanning the complete catalog. Only prepared statements are reused (at most 64 cached list statements per connection); product values, sessions, permissions, and prices are read from SQLite.
- Product/order pages apply SQL filters, sorting, LIMIT/OFFSET before payload decoding. Product page summaries omit descriptions/features/guarantees. Order summaries omit delivery addresses, notes, and line-item objects; details remain available through ownership/permission-checked detail endpoints. User pages select principal IDs before loading their summaries and use indexed per-owner order totals. User list queries avoid selecting password hashes, and API response allowlists remain enforced.
- List APIs for products, orders, users, audit, sessions, admins, posts, comments, discounts, messages, tickets, notification recipients, and notifications enforce maximum page size 100. Compatibility array routes return at most 100 rows and advertise total/next links; explicit page queries return envelopes. CORS exposes only the pagination count/link headers needed by the allowed separate development frontend. Existing small catalog clients keep their array contract.
- Added indexes cover order owners/dates, product visibility, session principal/expiry, ticket messages, and recent actor/target audit lookups. Search returns bounded SQL projections. Persian name sorting is preserved; a deterministic Unicode lowercase function preserves non-ASCII case matching.
- Analytics originally rebuilt an Intl date formatter and rescanned orders for every day and metric. Growth statistics/analytics blocked the loop for seconds and created a large temporary native-memory/RSS spike. The implementation now shares one formatter per request, memoizes date conversion within that request, and aggregates in one pass.
- Rate-limit maps remain capped at 10,000 keys with unchanged budgets. Expired entries are swept at most once per second of request activity, avoiding a complete map sweep on every saturated request. High-cardinality route keys are hashed. Existing idempotency/session/recovery cleanup remains intact. Audit and financial history are retained.

## Frontend, assets and memory findings

- Cart normalization now uses maps and a running total instead of repeated prefix sums and nested product scans. Overflow, quantity caps, duplicate IDs, stock limits, and cart preservation are regression-tested.
- Local search reuses normalized text in a WeakMap and splits query words once. Debounce remains 160 ms locally and 250–300 ms for admin network searches.
- Public catalog and session initialization run concurrently. Product loads coalesce. Concurrent ordinary session refreshes coalesce; login/logout force a fresh security check and retain stale-result guards.
- Product/order/support/global searches cancel replaceable requests and reject stale completions. AbortError is preserved. Admin order filters avoid downloading dashboard statistics again. Users, support, discounts, messages, and recipients load bounded pages; recipient selection has debounced search. Product editing retrieves full details when requested, preserving fields omitted by list summaries.
- Product grids render at most 100 cards with paging. Existing cart rows preserve focus during quantity updates. Image dimensions, aspect ratios and below-the-fold lazy loading are retained; detail images use eager/high priority loading. Existing mobile/reduced-motion styling is retained; offscreen painting is deferred and animations pause in hidden tabs.
- Removed the always-on dashboard MutationObserver by rendering discount delete controls directly. The welcome overlay removes its key listener and releases retained nodes when dismissed. Existing profile in-flight request maps clear settled entries. No persistent unbounded heap growth was established in the measured request windows; the analytics allocation spike was the significant memory issue.
- Optional PDF libraries were already absent from page downloads and invoice printing already has a lightweight fallback. No image quality was reduced and no asset framework was added.

## Cache, compression and deployment

`npm run build:assets` writes content fingerprints into local JS/CSS references. In production, only a fingerprint that matches the startup file hash receives `public, max-age=31536000, immutable`. Unversioned/mismatched assets revalidate; HTML stays no-cache and private responses stay no-store. ETag/Last-Modified behavior is retained. Protected admin scripts require authentication and remain no-store. Deploy JS/CSS/HTML together and restart the app so templates and hashes agree.

Compression remains in Nginx using the existing HTML/CSS/JS/JSON/XML/SVG gzip configuration; Node does not add a second compression layer. JPEG/PNG/WebP/AVIF are excluded. The optional static cache has an 8 MiB key zone and 64 MiB disk cap, caches only verified immutable public asset responses, and bypasses cookies/Set-Cookie. A shared edge request budget also counts cache hits; authentication and principal limits remain enforced in Node. It proxies through Node's allowlists and realpath checks. HTML/API/auth/admin scripts are excluded. Harmless static cache locations disable access logging; audit/security logging is unchanged.

Install `deploy/nginx-upstream.conf.example` in the HTTP context before the updated proxy snippet: it uses 16 idle upstream connections, 1,000 requests per connection, and a four-second upstream idle timeout below Node's existing five seconds. Client keep-alive remains 30 seconds, Node request/header timeouts remain 30/15 seconds, and Node max requests/socket remains 1,000. Nginx's body ceiling now matches the 1 MiB JSON ceiling; forms remain 256 KiB and input images retain their existing limits.

The Nginx examples were reviewed against the official [upstream](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive), [proxy cache](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache), and [gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html) documentation. Nginx is not installed in this Windows workspace. Actual `nginx -t`, proxy cache/gzip headers, HTTPS and VPS resource behavior must be checked on the VPS before reloading its configuration. No live infrastructure changes were made.

PM2 remains one fork/one instance with the existing 512 MiB restart ceiling and restart backoff. A restart threshold must not substitute for investigating growth. No cluster mode or database migration is appropriate on the current evidence. Keep enough VPS headroom for the OS, Nginx, PM2, SQLite and bcrypt; the benchmark machine's 8 GiB is not evidence of VPS RAM.

No npm install is required. Deployment requires `npm run build:assets`, application restart (`pm2 restart web2 --update-env` under the existing owner), and `nginx -t` followed by Nginx reload only if installing the changed examples. Preserve the existing single-instance rollout and backup procedure.

## Reproduction and remaining limits

```powershell
npm run check
npm test
npm run benchmark -- --output .runtime/performance.json --runs 3
npm run benchmark -- --mode memory --profile growth --runs 1 --output .runtime/memory.json
npm run build:assets
```

The tooling cannot accept a production URL or database. It creates and cleans its own temporary databases, stops on any unexpected HTTP error, checks SQLite quick/foreign-key integrity and nonnegative stock, caps observed test RSS at 384 MiB and post-warmup heap retention at 8 MiB, and cleans up its child processes. Normal rate limits make these short bursts; they are not a sustained thousands-of-requests-per-second promise. `/health` only returns status, and `/ready` performs one small database read.

SQLite still runs synchronous queries and serialized durable writes in one application process. Analytics still reads all relevant history once, substring searches still scan candidate rows, name sorting collects names/IDs for Persian collation, and deep OFFSET pages grow more expensive. Public browser search still loads all catalog summaries in pages; it is suitable for the current modest catalog, with remote catalog search/paging a future step for much larger catalogs. Audit/notification/financial history needs operational disk monitoring and an explicit archival policy, rather than silent deletion. Large custom inline images can inflate compatibility catalog responses; current shipped product media should remain optimized file URLs. Chromium regression runs block external font/icon CDNs for determinism; their loading latency is outside these results. The short memory tests cannot rule out multi-day/provider-specific leaks or establish field LCP/CLS/INP. Recheck real-device performance and longer traffic in isolated VPS staging before changing architecture.

## Files changed in Phase 17

- Backend: `server.js`, `lib/database.cjs`, `lib/commerce.cjs`, `lib/account.cjs`, `lib/analytics.cjs`, `lib/management.cjs`, `lib/user-management.cjs`, `lib/request-security.cjs`, `lib/auth-recovery.cjs`, `lib/seo.cjs`, new `lib/listing.cjs`, new `lib/asset-cache.cjs`.
- Frontend: `script.js`, `style.css`, `js/session.js`, `js/profile.js`, `js/intro.js`, `js/admin.js`, `js/admin-actions.js`, `js/admin-console.js`, `js/admin-support.js`, `js/admin-users.js`; content fingerprint references in `index.html`, `catalog.html`, `product.html`, `404.html`, `cart.html`, `checkout.html`, `profile.html`, `admin.html`, `admin-login.html`.
- Tooling: `package.json`, new `scripts/benchmark.cjs`, new `scripts/version-assets.cjs`.
- Deployment: `deploy/nginx-proxy.conf.example`, `deploy/nginx-rate-limits.conf.example`, `deploy/nginx.conf.example`, `deploy/nginx-http-ip.conf.example`, new `deploy/nginx-upstream.conf.example`, new `deploy/nginx-static-cache.conf.example`, new `deploy/nginx-static-locations.conf.example`, `deploy/production-rollout.md`, `deploy/operations.md`.
- Tests: new `tests/performance.test.cjs`; `tests/commerce.test.cjs`, `tests/products.test.cjs`, `tests/seo.test.cjs`, `tests/admin.test.cjs`, `tests/account-ui.test.cjs`, `tests/admin-security.test.cjs`, `tests/dev-admin.test.cjs`, `tests/user-management.test.cjs`, `tests/admin-browser.test.cjs`, `tests/operations.test.cjs`, `tests/security-boundaries.test.cjs`, `tests/security-regressions.test.cjs`, `tests/shopping-ux.test.cjs`. Fixtures now supply required Phase 16 revisions, use Node cancellation primitives with Node fetch, wait for on-demand product details, test safe failures using valid JSON null instead of bypassing database constraints, and read shipping details through the detail endpoint. Assertions and protections were retained.
- Documentation/artifacts: `README.md`, `docs/continuation.md`, this report, and `docs/benchmarks/phase17-*.json`. Browser regression checks refresh the existing `.runtime` screenshots.
## Measured results

Core endpoint p95 latency in milliseconds (median of three trials):

| Endpoint | Catalog before | Catalog after | Growth before | Growth after |
| --- | ---: | ---: | ---: | ---: |
| Health | 15.65 | 11.87 | 9.28 | 12.70 |
| Homepage | 286.67 | 19.72 | 1169.94 | 18.65 |
| Catalog HTML | 219.37 | 20.87 | 1233.70 | 19.44 |
| Product list | 31.92 | 33.48 | 137.29 | 41.43 |
| Product detail API | 16.48 | 9.42 | 48.53 | 8.75 |
| Stylesheet | 15.99 | 14.53 | 12.87 | 13.13 |
| Login (bcrypt 12) | 409.67 | 376.23 | 353.27 | 353.29 |
| 20-line checkout quote | 20.09 | 16.62 | 37.84 | 16.43 |
| Checkout validation | 9.41 | 9.41 | 8.28 | 9.56 |
| Admin products (20) | 16.59 | 14.05 | 33.65 | 18.45 |
| Admin orders (20) | 17.94 | 15.53 | 126.05 | 35.56 |
| Admin users (20) | 19.72 | 17.53 | 131.62 | 23.24 |
| Mixed read traffic | 189.26 | 24.28 | 640.98 | 47.30 |

Analytics p95 (extended single baseline versus median of three after trials), milliseconds:

| Profile / endpoint | Before | After |
| --- | ---: | ---: |
| catalog / adminStats | 545.87 | 7.45 |
| catalog / adminAnalytics | 610.93 | 6.82 |
| growth / adminStats | 10606.99 | 45.00 |
| growth / adminAnalytics | 9033.94 | 67.93 |

Growth burst stages, 50 measured requests at each concurrency level, with expected response status checked for every request:

| Concurrency | Before req/s | After req/s | Before avg / p95 / p99 ms | After avg / p95 / p99 ms | Before / after CPU ms | Before / after RSS MiB | Errors before / after |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| 5 | 20.20 | 495.37 | 233.75 / 340.71 / 358.78 | 9.60 / 17.39 / 19.29 | 2219.00 / 78.00 | 230.23 / 127.39 | 0 / 0 |
| 10 | 20.67 | 457.13 | 435.84 / 600.51 / 819.66 | 19.62 / 33.99 / 34.22 | 2125.00 / 94.00 | 222.99 / 128.32 | 0 / 0 |
| 25 | 21.03 | 504.35 | 923.10 / 1247.43 / 2223.54 | 38.31 / 54.26 / 67.28 | 2155.00 / 78.00 | 212.47 / 129.42 | 0 / 0 |
| 50 | 21.23 | 474.59 | 1220.46 / 2223.29 / 2351.38 | 51.97 / 96.89 / 101.08 | 2282.00 / 78.00 | 211.84 / 135.50 | 0 / 0 |

Startup and cart timings:

| Profile | Before startup ms | After startup ms | Before cart p95 ms | After cart p95 ms |
| --- | ---: | ---: | ---: | ---: |
| catalog | 1399.78 | 1319.97 | 48.16 | 2.27 |
| growth | 1270.46 | 1409.64 | 29.15 | 2.95 |

Growth process peak observed RSS: 1166.09 MiB in the extended baseline, versus 135.50 MiB after (median peak over three trials). This includes the baseline analytics allocation spike and is not a claim of an ongoing leak. Growth load-50 event-loop p95: 2225.08 ms before versus 69.80 ms after; histogram resolution is 10 ms. Synchronous filesystem calls in that stage: 13736 before versus 0 after.

The timed growth memory run completed 20 spaced rounds / 160 repeated catalog requests, in addition to warmup/authentication. Post-GC heap moved from 10.63 to 10.81 MiB (retained delta 0.18 MiB). RSS ranged 78.81–79.82 MiB; external memory ranged 2.92–2.92 MiB. No safety stop fired.

All six final full-workload trials and the timed memory run completed: 0 unexpected HTTP errors, SQLite quick_check/foreign-key checks passed, no negative stock, and no child crash. Security, checkout concurrency and persistence correctness are additionally checked by npm test. Core product-list p95 for the unchanged 69-product response stayed approximately stable; the growth list is faster and has a bounded 100-row initial response. Login hash cost was not reduced. Startup has small trial-to-trial variation and remains approximately 1.2–1.4 seconds.

## Final verification

- `npm test`: **198/198 pass**, zero failures, skips, cancellations or TODOs; final run 182,325.6215 ms. This includes real Chromium at desktop/mobile sizes, accounts/authentication, permissions, CSRF, notifications, backups/restores, checkout concurrency, idempotency, stock integrity, and restart persistence.
- `node scripts/check.cjs`: pass. Git whitespace check: pass with Windows line endings recognized.
- All 77 generated local asset references match their content fingerprints.
- The report-target guard rejects an output outside the permitted report directories before any workload starts. Legacy records without a revision read as revision 0 and safely advance to revision 1 on mutation.
- Six final benchmark trials and the 20-round memory run completed; all unexpected-error counts are zero and all SQLite integrity/foreign-key/stock checks pass. Raw results are retained in `docs/benchmarks/`.
- Windows sandboxed Chromium initially failed while opening its GPU cache. The final full suite ran with the approved normal process permissions and passed. Browser assertions, security flags, and command timeouts were retained; test diagnostics now include browser stderr. Node fetch fixtures use Node cancellation primitives to exercise cancellation reliably.
- No production deployment, data modification, Nginx reload, dependency installation, or OS networking changes were performed. Nginx runtime validation remains a deployment step.