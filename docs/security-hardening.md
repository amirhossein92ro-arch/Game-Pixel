# Security threat map

Active deployment: server.js and lib/*.cjs; SQLite and private configuration are outside the public asset routes. Legacy backend directories are separate services, not active application routes.

| Surface | Finding | Severity | Mitigation |
|---|---|---|---|
| Origin | Request Host could authorize an unconfigured Origin | High | Explicit configured allowlist only |
| Recovery | Async hashing could race token expiry/attempt limits; older grants survived resend | High | Atomic expiry/attempt checks and grant invalidation |
| Input | Privileged unknown fields silently ignored; nested shapes unbounded | Medium | Reject protected fields, validate shapes and limits |
| Throttling | Missing broad admin limits; unbounded recovery maps | Medium | Bounded category limits and account lockouts |
| Dependency | proxy-addr IPv4-mapped IPv6 trust bypass advisory | Critical | Pin patched 2.0.8 |
| Deployment | Default public bind and ambiguous proxy trust | Medium | Loopback default and explicit proxy configuration |

Existing protections to preserve: bcrypt, random hashed server sessions, CSRF, namespace authorization, ownership checks, atomic checkout totals/stock/idempotency, safe public user management records, restrictive static routes and CSP.

Verification: regression suite plus targeted adversarial HTTP tests; production HTTPS/provider configuration remains a deployment responsibility.

## 2026-10-10 inspection, before implementation

Inspected the active root server, every library, API/ownership guards, SQLite schema and queries, public HTML/JavaScript sinks, the three archived applications, package manifests/locks, scripts, configuration examples and existing tests. Existing uncommitted changes are preserved. Environment values, live account records and log contents are not included in this report.

| Boundary | Remaining finding | Severity | Planned fix |
|---|---|---|---|
| Recovery/account identity | A recovery grant issued for the old phone survives a phone change | High | Bind grants to current phone and invalidate grants when identity changes |
| Session revocation | Existing principal sessionVersion fields are incremented but not checked by sessions | Medium | Snapshot and compare versions in the existing session table; recheck async commits |
| Input/admin content | Several mutation routes lack explicit field allowlists and strict type/length validation | Medium | Method-aware allowlists, nested validation, canonical paths and query limits |
| OTP | Incorrect OTP attempts consume the budget only after asynchronous comparison | Medium | Atomically reserve attempts before comparison and recheck expiry/identity |
| Login/resource use | Login and identity/password verification can schedule excessive expensive hashing | Medium | Bounded per-IP limits before parsing/hashing and bounded active sessions |
| Public configuration | Development/proxy/HTTP instructions disagree with enforced production HTTPS | Medium | Fail-closed production origin validation, loopback proxy example and deployment templates |
| Archived Mongo API | Query operator/regex injection, weak quantity checks and nontransactional checkout | High if exposed | Explicit scalar/schema validation and transactional checkout; keep archived production block |
| Audit | Recovery and customer security events are missing from the audit trail | Low | Safe metadata-only security events, with no credentials or grants |
| Frontend | CSRF fetch wrapper loses method/headers from Request objects; discount editor submits an internal id | Medium/functional | Preserve Request inputs and submit endpoint-specific fields |

Confirmed existing safeguards: server-side admin namespace authorization, ADMIN/SUPER_ADMIN hierarchy and last active SUPER_ADMIN checks, private ownership on orders/tickets/addresses/notifications, bcrypt, random hashed cookies with HttpOnly/SameSite, protected /admin, allowlisted static directories, escaping of user text, parameterized SQL, and transactional root checkout with idempotency and server prices.

Baseline: 118/121 tests passed; failures are the account registration UI, a test expecting Host-based origin trust, and a test expecting insecure production HTTP. Project syntax/HTML/CSP checks pass. All five npm audit results report zero advisories. The latter two tests will be replaced with assertions of the enforced secure behavior, not accommodated by weakening security.

## 2026-10-16 continuation completed

The inspection and baseline above are historical. On resuming, identity-bound
recovery grants, session-version checks, atomic OTP attempt reservation, strict
input fields, login/checkout budgets, private asset guards, and final
SUPER_ADMIN constraints were already implemented. They were preserved and their
security regressions pass.

The unfinished SEO integration was completed: duplicate discovery routes were
removed, dynamic template substitutions now keep replacement tokens literal,
and nested-page account/image paths were corrected. The product verifier now
reuses public read snapshots without relaxing server throttles. Its adversarial
tests also preserve HTML escaping and CSP restrictions.

Final validation: 175/175 tests pass, including real desktop/mobile Chromium;
syntax/static checks pass; all 69 products pass the standalone verifier with
fresh/stale caches; the active application's npm audit reports zero advisories.
No live environment or business database was changed. The exact files, initial
failures, and remaining deployment work are recorded in
[continuation.md](continuation.md).

## 2026-10-21 Phase 19 continuation

The later interrupted security review is recorded separately in
[phase19-security.md](phase19-security.md), with the generated
[registered route inventory](phase19-route-inventory.md). Earlier completed
security, performance, storage and deployment-tooling changes were preserved.
