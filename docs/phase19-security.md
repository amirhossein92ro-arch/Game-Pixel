# Phase 19 security continuation — 2026-10-21

This resumes the interrupted local security review. The active application is
the root `server.js` and its existing SQLite storage boundary. No application,
database, dependency tree or earlier phase was recreated.

## State recovered before edits

The SEO integration, Phase 17 performance work and Phase 18 migration-readiness
work were already complete. The last completed full-suite log recorded 222/222
passing, including real Chromium. Their implementations, tests and handoffs
remain intact.

Comparing the working tree with `.runtime/phase19-source-baseline.json` showed
exactly five changed application files from the interrupted security review:

| Already changed file | Implemented behavior on entry |
| --- | --- |
| `lib/admin-security.cjs` | Shared policy for sensitive routes requiring a recent administrator login, including legacy user PUT/DELETE. |
| `lib/commerce.cjs` | Enforce the 15-minute login requirement and share its check with asynchronous sensitive handlers. |
| `lib/management.cjs` | Recheck recent authentication after administrator password hashing, before committing account creation. |
| `lib/user-management.cjs` | Recheck administrator session, version, permissions and recent login before user mutations and after password hashing. |
| `lib/account.cjs` | Commit 2FA changes only while the customer session and verified password remain current; keep factor changes and notifications transactional. |

The interrupted session had also added `scripts/security-routes.cjs`,
`tests/security-phase19.test.cjs`, `tests/security-route-matrix.test.cjs` and
`tests/helpers/security-server.cjs`. The helper launches servers with synthetic
seeds and disposable databases, disables real `.env` loading, and uses a
process-local password gate rather than an HTTP testing endpoint. Its guarded
Windows cleanup retry was already present and was preserved.

The saved red-test log reproduced stale sensitive administrator actions,
revoked sessions completing 2FA work and an old-password recovery-code race.
The later race log passed 5/5. The latest matrix log passed 20/21: its remaining
assertion expected `/js//session.js` to be rejected, although Express normalizes
the mount separator before applying the exact asset allowlist. A correction
was saved after that log but had no subsequent verification. No final Phase 19
full-suite result or completed report existed.

All eight protected seed, environment and database/WAL/SHM files matched the
saved baseline before testing. Existing archived dependency deletions and all
unrelated working-tree changes were retained.

## Work completed during this continuation

- Validated the saved fixes and corrected matrix: the initial resumed targeted
  run passed 21/21 without changing those five application files.
- Extended the normalized asset checks to GET and HEAD, literal and encoded
  administrator script names, the login redirect, `no-store`, exact public
  script contents and rejection of an unlisted script. Raw HTTP requests have
  a bounded timeout and retain the original request path.
- Completed the route inventory's rate-limit descriptions, including existing
  credential/profile limits, sensitive route limits and persistent privileged
  and password-reset budgets. The document distinguishes the one-minute user
  management limits from the 15-minute persistent limits. Both namespace and
  route guards can consume the same privileged budget; runtime throttles were
  preserved.
- Generated [the registered route inventory](phase19-route-inventory.md) from
  the actual Express registration tree using an isolated store. It records 129
  routes: 58 administrator APIs, 31 customer APIs, one pending-login 2FA API,
  one protected administrator document and 38 public routes. All 54 registered
  authenticated mutations are exercised with missing and invalid CSRF tokens.
  Ten registered sensitive administrator mutations require recent login.
- Added this report and continuation links so the next session can distinguish
  the completed local work from production and migration work still pending.

## Validation

| Check | Result |
| --- | --- |
| Initial resumed security suites | 21/21 pass; no failures, skips or cancellations. |
| Extended route-security matrix | 15/15 pass; GET/HEAD asset guards retained. |
| Project syntax, HTML IDs, CSP and local references | Pass: `node scripts/check.cjs`. |
| Updated script/test syntax | Pass. |
| Generated route inventory | 129 routes; no unclassified public API or administrator permission. |
| Focused intro regression after the timer fix | 1/1 pass; automatic reveal, removal, skip, reduced motion and authenticated welcome retained. |
| Unchanged standalone Chromium test | 1/1 pass; desktop/mobile checks retained. |
| Full regression suite | Final run: 243/243 pass, zero failures, skips, cancellations or TODOs, including Chromium. The first resumed full run passed 242/243; its only failure was Chromium GPU startup under the execution sandbox. |
| Current root dependency audit | Saved bounded audit completed with zero advisories in production and development dependencies; manifests and lockfiles unchanged since that audit. |
| Protected file hashes and modification times | All eight protected files retain their original SHA-256 hashes and modification times. |

Commands and logs for this continuation are under
`.runtime/resume-security-{targeted,matrix,full}.log`. The entry snapshot is
`.runtime/resume-security-baseline.json`; the generated JSON inventory is
`.runtime/resume-security-routes.json`. Test databases and destructive fixtures
are temporary. No real production data is used for destructive tests.

## Final resumption audit — 2026-10-21

The next connection interruption occurred after the extended matrix, route
inventory, README links and report above had been saved. The completed
`.runtime/resume-security-full.log` recorded 241/243 passing. Its two failures
were a Chromium GPU-process startup crash and the intro test's wall-clock
wait. The saved bounded root dependency audit had already completed with zero
advisories; its pending status above had not yet been updated.

The entry comparison confirmed that all five security implementation files
were unchanged from the previous continuation. All eight protected seed,
environment and SQLite/WAL/SHM files still matched their saved hashes and
modification times. Existing performance, migration, backup, deployment and
unrelated working-tree changes were retained.

`tests/admin.test.cjs` now advances Node's mocked timers separately for the
intro's automatic reveal and nested overlay removal. It also checks that the
page unlocks, keeps the existing skip/reduced-motion/authenticated-welcome
assertions, and closes test windows even when an assertion fails. The welcome
check flushes promise work with `setImmediate`; no real animation timing or
application code changed. The focused intro regression passed. The identical
Chromium test also passed with all desktop/mobile assertions retained and no
browser flag or timeout changes.

The first resumed full run passed 242/243. Its only failure was the same
Chromium GPU/cache startup crash under the execution sandbox; the corrected
intro test and every other regression passed. The identical suite then passed
243/243 outside that execution sandbox with the same browser flags, timeouts
and assertions. No test was skipped or removed. Static project checks passed.

Only `tests/admin.test.cjs`, this report and `docs/continuation.md` were edited
in this final resumption. No application implementation, dependency manifest,
lockfile, deployment file or storage schema changed. The entry/final source
comparisons preserve all existing work, and all eight protected files retain
their original hashes and modification times.

The final passing log is `.runtime/phase19-final-tests-unrestricted.log`;
the sandbox run is `.runtime/phase19-final-tests.log` and the static-check log
is `.runtime/phase19-final-check.log`. The current entry snapshot is
`.runtime/phase19-final-entry.json`; final results, source hashes and protected
file comparisons are saved in `.runtime/phase19-final-validation.json`.
Browser tests refresh the existing `.runtime/` screenshots using disposable
data. No local Phase 19 work remains unfinished.

## Deployment and remaining scope

No dependency manifest or lockfile was changed in this continuation. No
`npm install` or `npm ci` is required for the current working installation.
No browser application assets changed, so no new asset fingerprints are needed.
Deploying the accumulated backend security fixes requires restarting the
existing single PM2 process. No PM2 or Nginx operation was performed here.

The separately documented VPS/TLS/firewall rollout, real Turnstile/SMS and
payment-provider verification, staging load/accessibility testing, and future
PostgreSQL/runtime migration remain outside this completed local review.
The active SQLite format remains authoritative; the Phase 18 rehearsal format
must not be selected as a runtime database. See
[production rollout](../deploy/production-rollout.md),
[operations](../deploy/operations.md) and
[migration readiness](phase18-migration-readiness.md).
