**Phase 18 — migration readiness, 19 October 2026**

The running application already uses SQLite, not a JSON file as its authoritative store. `lib/database.cjs` was the SQLite implementation before this phase; it is now a compatibility entry point for `storage/sqlite/adapter.cjs`. `data.json` is a legacy/shipped seed and is not a current export of customers, authentication state or transactions. No production database or original JSON was migrated, replaced or edited during this work.

The live payload schema remains version 16. The new normalized schema is a separate **offline rehearsal format**, `web2-normalized/v1`, with its own migration history. It cannot be opened by the live adapter. Completing an adapter for that format and migrating all live security state are prerequisites for adopting it in production. Creating a rehearsal file does not enable a driver or change application configuration.

**Drivers and configuration**

| Configuration | Current behavior |
| --- | --- |
| `STORAGE_DRIVER=sqlite` | Supported live driver and safe default; preserves the already deployed architecture. |
| `SQLITE_PATH` | Optional live SQLite path. |
| `DATABASE_PATH` | Existing compatible alias; conflicting configured paths fail closed. |
| `SEED_DATA_PATH` | Existing seed input; never treated as the authoritative live database. |
| `STORAGE_DRIVER=json` | Reserved, unavailable at runtime. JSON remains a read-only offline source adapter. No new file writer or unsafe fallback is introduced. |
| `STORAGE_DRIVER=postgres` / `DATABASE_URL` | Future integration only. PostgreSQL selection fails before opening storage. No credentials or server are required now. A URL alone never selects a driver. |

No new environment variable is required for an existing installation using `DATABASE_PATH`. Set `STORAGE_DRIVER=sqlite` explicitly in deployment configuration when convenient. Keep secrets in private environment/service configuration. Changing `.env.example` does not change the real `.env`.

**Current persistent entities and relationships**

| Live entities | Relationships and preservation requirements |
| --- | --- |
| `users`, `accounts` | Legacy/public profile projection and authoritative customer credentials/contact identity share stable IDs. Password hashes live in `accounts.password_hash`; email/phone uniqueness is enforced. Addresses remain in the account payload today. |
| `admin_accounts` | May share an ID with a customer. Role, active state, TOTP requirement and session version control authorization. Permissions are the server-side role map, not browser data or a custom permission table. The last active Super Admin is protected. |
| `products` | Stable opaque/string IDs, integer price/stock, active/deleted state and optimistic revision. Referenced products are soft-deleted by the live adapter. |
| `orders`, `order_items` | Owner reference/snapshot is in the order payload; item rows reference their order. Item name, trusted unit price, quantity and line total are historical snapshots. Deleted customers can leave retained orders marked `userDeleted`. |
| `discounts` | Unique coupon code, usage count/limits, dates and revision. Orders preserve the applied code/value/amount; historical coupon removal must not erase order truth. |
| `idempotency` | Customer + key scope, purpose, request fingerprint, order link and expiry. Checkout replay uses these records inside the same transaction. |
| `notifications` | Customer FK, type, resource identifier, creation/read timestamps. Resource IDs are polymorphic; they are not all order IDs. |
| `tickets`, `ticket_messages` | Customer-owned ticket; child conversation messages. Status/author checks and ownership remain enforced. |
| `wishlist` | Customer + product identity, with bounded application-level retention. |
| `audit_logs` | Actor identity/username/role snapshots, action, target and scrubbed details. Actor snapshots survive deleted administrators; they must not cascade away. |
| `settings` | Site configuration, compatibility markers, sequence state, bootstrap-password configuration hash and TOTP replay markers. These are different kinds of state; arbitrary settings are not blindly copied into the rehearsal import. |
| `sessions`, `session_details` | Hashed bearer identity, CSRF, principal/kind/version, expiry and bounded device/activity metadata. These are persistent security state. |
| `account_factors`, `pending_auth` | Encrypted authenticator secrets/recovery hashes and pending login challenges. `ACCOUNT_TOTP_KEY` itself stays in the environment. |
| `password_reset_challenges`, `account_login_devices` | One-use recovery state, attempt/expiry limits and known-device metadata. |
| `login_failures`, `request_budgets` | Persistent login lockouts and principal request budgets. Existing expiry/cleanup and capacity bounds remain. |
| `messages`, `posts`, `comments` | Existing contact/content records. Comment post/parent identifiers are legacy optional links, not authorization identities. |
| `storage_meta`, SQLite sequences/migration markers | Cache revision, schema version and stable ID allocation state. Never replace IDs with array positions. |

Cart contents are browser state. There is no implemented real payment callback/event store: the existing test provider records payment information in orders and fails closed in production. This phase therefore does not invent payment-event or custom-permission tables.

**Repository and transaction boundary**

`storage/index.cjs` selects the runtime driver explicitly. Collections expose `findById`, bounded `findMany`, `count`, `create`, revision-aware `update`, `delete` and supported soft deletion. Notification reads require an owner and audit mutations are append-only. These are privileged internal APIs; existing service authorization, CSRF and validation must run before them.

SQL, SQL projections and search/pagination builders now live under `storage/sqlite/`, separated by domain. Routes/services no longer access a connection or construct SQL. Prepared statements always bind values; identifiers and sorting fragments come from fixed adapter code. Statement caches are bounded. `lib/database.cjs` and existing snapshot/collection methods remain compatibility paths for operational tools and current services.

The live unit of work retains `BEGIN IMMEDIATE`, nested savepoints, synchronous callbacks, WAL, foreign keys, `synchronous=FULL`, a 5-second busy timeout, optimistic revisions and safe busy errors. It rejects async callbacks/thenables. No asynchronous network work belongs inside a current transaction. PostgreSQL needs an explicit async service/unit-of-work transition, described in [storage/postgres/README.md](../storage/postgres/README.md); it is not a drop-in Promise hidden in the synchronous API.

| Operation | Atomic boundary that must be preserved |
| --- | --- |
| Registration/contact identity/password changes | Credential/profile uniqueness, linked administrator state where applicable, session invalidation and audit. |
| Checkout | Recheck session, reserve/replay scoped idempotency, select trusted products, validate stock, compute totals, decrement stock, create order/items, consume coupon, create notification and record result. Any failure rolls back. |
| Cancellation | Validate order revision/status/payment restrictions, restore stock once, update order, notify and audit together. |
| Role/permission/disable/delete operations | Recheck actor/session after hashing, preserve final Super Admin, synchronize linked identities, revoke sessions and audit. |
| Recovery/2FA | Consume challenge/recovery step exactly once with version checks, update credentials/factors and invalidate affected sessions. |
| Future verified payment callback | Verify provider outside the transaction, then atomically enforce unique provider transaction/event identity, recheck state and record the transition. No such provider is enabled today. |

For PostgreSQL checkout, lock product rows in sorted ID order, verify stock and conditionally decrement it, write order snapshots, conditionally consume the coupon and commit the idempotency result on one pooled transaction client. Failure must roll everything back. Keep JSON persistence/process assumptions out of that future adapter.

**Normalized rehearsal schema**

[001_normalized.sql](../storage/migrations/sqlite/001_normalized.sql) creates only justified entities: users and separate credentials; administrators; products; discounts; orders/items; notifications; audit; safe settings; content; addresses; wishlist; tickets/messages; scoped idempotency and a session design. Core query fields are columns with indexes. Extension payloads retain fields that are not yet normalized; order items and addresses are reconstructed from their own rows.

The schema uses stable text keys without allocating replacement identities. It enforces canonical email uniqueness, phone uniqueness/shape, coupon/order/payment-reference uniqueness, scoped idempotency, FK ownership, strict SQLite types, positive item quantities/prices, nonnegative stock/totals, status/boolean checks, one default address and final Super Admin preservation. It uses restrictive historical FKs rather than destructive order/audit cascades. Deleted historical owners retain their original identity snapshot and a nullable normalized owner link when the source explicitly marks deletion.

Amounts remain in the existing integer monetary unit. No currency conversion or recalculation changes a source order. Name/price/quantity/line-total snapshots do not join current product values. Known timestamps become UTC in indexed columns while the portable record retains its original representation. Missing timestamps remain `NULL`; an empty legacy string is retained in the payload and reported. Nonempty timestamps without a timezone, impossible calendar dates and rolled-over times fail validation rather than assuming or normalizing a different date.

`schema_migrations` records version, name, checksum and application time. Migration application is explicit, transactional and idempotent; checksum or unknown-version conflicts fail. Application startup never applies this rehearsal schema to a live v16 database. Both adapters reject the other's format before writing it.

**Offline commands — test data only**

Run with the project's supported Node version; no new package installation is needed. Use new file names each time. Initializing an empty schema and importing a fixture below demonstrate separate targets: the importer deliberately refuses an existing destination, including a preinitialized file.

```powershell
node scripts/storage-schema.cjs --target .runtime/schema-demo.sqlite --apply
node scripts/migrate-json-to-db.cjs --source tests/fixtures/migration-v1.json --target .runtime/import-demo.sqlite --dry-run
node scripts/migrate-json-to-db.cjs --source tests/fixtures/migration-v1.json --target .runtime/import-demo.sqlite --apply
node scripts/export-db.cjs --source .runtime/import-demo.sqlite --target .runtime/portable-demo.json
```

`node scripts/migrate-json-to-db.cjs --dry-run` reads the shipped legacy seed without writing a target. Dry-run reports record/child/credential counts, monetary totals, conflicts, missing references, warnings and exclusions. Problems identify collection/index/field positions rather than printing emails, phones, passwords, tokens or raw conflicting values. Reports are capped at 1,000 detailed issues/warnings while total counts remain accurate. Invalid UTF-8/JSON and sources above the 64 MiB offline limit fail safely.

Imports preserve original IDs, role values, bcrypt hash bytes, timestamps and order snapshots. Existing hashes are validated and copied, never rehashed. A profile without a hash remains a profile and is reported; it is not given a generated password. Plaintext passwords, duplicate identities/codes and unknown business collections block import. Malformed optional administrator email values are reported during dry-run. Unknown/missing products or notification owners block import. An explicitly deleted historical owner and an anonymous legacy order are retained and reported; an unresolved live owner is an error. Checkout replay keys require an order owned by the same existing customer, so anonymous historical orders cannot acquire a replay scope. Missing historical coupons retain the applied order snapshot and produce a warning.

Environment/CAPTCHA/SMTP/API secrets, active sessions, reset/pending-auth records and factors/device/lockout metadata are excluded from this JSON rehearsal path. Exact customer/admin password hashes are legitimate credential records and are stored separately from public payloads. The live security tables require their own reviewed migration before production adoption; ordinary JSON cannot substitute for a complete current SQLite snapshot.

Actual import builds a private staged database, imports within one transaction, verifies every record and counts, exact credential bytes, totals, snapshots and SQLite integrity/FKs, checks that the source SHA-256 still matches, closes/checkpoints the database and exclusively publishes it. It cannot overwrite an existing destination or use the configured live database path. Failures remove owned staging files/locks. Dry-run creates no directories, database or lock file. The source file is never rewritten.

The export helper supports the normalized rehearsal format only. It emits a private, exclusive portable JSON file containing credential hashes; treat it as a backup secret. It is **not** a live-v16 export, automatic downgrade, complete security-state export or replacement for verified database backups.

**Backups, health and deployment**

Existing SQLite backups still use `VACUUM INTO`, validation, private publication and retention; offline restore still preserves the previous target. Backup/monitor tooling now resolves the same storage configuration/path aliases as the app and fails closed for unsupported drivers. Do not copy an active SQLite main file while ignoring WAL. PostgreSQL backup integration requires verified `pg_dump`/restore support before enabling that driver; no PostgreSQL tools run now.

`/health` remains status-only and performs no storage scan. `/ready` uses the storage availability boundary and exposes only status. It never returns a database URL, host, user, schema or credentials. PM2 remains one fork process; no cluster-mode change accompanies this work.

For a normal deployment of this readiness code, preserve the existing database/seed paths, take a verified backup, validate configuration, deploy code, restart the single PM2 process and run readiness/security/commerce smoke checks. Do not point it at a normalized rehearsal file. No migration, environment switch, PM2 action, Nginx change or production infrastructure operation was executed here.

**Production migration checklist — prepared, NOT executed**

1. Choose maintenance/traffic handling, stop all writes and identify the authoritative live SQLite database. The shipped `data.json` is insufficient for current customer/transaction migration.
2. Create and restore-test a verified full database backup outside the application tree. Preserve the original JSON separately and retain the encryption/environment keys securely.
3. Complete the selected target runtime adapter and full live-data/security-state export/import. PostgreSQL also requires the async service transition, pooling, server choice and least-privilege credentials. The rehearsal-only adapter is not eligible for production selection.
4. Rehearse with a disposable copy and dry-run validation. Resolve duplicate identities, broken live references and ambiguous timestamps without silently merging accounts or deleting history.
5. Review and apply explicit versioned schema migrations to the new destination with a separate migration role. Prefer additive, backward-compatible changes; delay destructive changes.
6. Import the frozen authoritative dataset into a new destination. Never overwrite the only original source/backup or clear it after import.
7. Compare counts, IDs, credential bytes, roles, relationships, stock, coupon use, totals and historical item snapshots. Rehearse transaction failures and replay/concurrency behavior.
8. Rehearse target backup/restore. Plan active-session invalidation and 2FA/security-state continuity explicitly. Keep DB ports private and use certificate-verified TLS for remote PostgreSQL.
9. Only after a compatible runtime driver exists, change `STORAGE_DRIVER`/target configuration explicitly and restart the single process. No current flag enables the normalized rehearsal format.
10. Check `/health` and `/ready`, registration/login/session refresh, products/cart/checkout, permissions, admin, notifications/audit and backups against the new target.
11. Monitor latency, CPU/RAM, lock waits, constraint/storage failures and restarts before restoring full traffic. Keep original backups under the agreed retention policy.
12. Roll back code and recover data as separate operations. A code rollback must be compatible with applied schema changes. Never automatically drop tables/columns or promise a lossless DB-to-JSON downgrade.

**Validation and measured limits**

The dedicated fixtures cover credentials, administrators, products, discounts, historical orders/items, notifications, audit, settings, addresses, content, support, wishlist and idempotency. Tests exercise repository contracts, explicit driver/format selection, uniqueness/FKs/checks, bound dangerous input, rollback at stock/order/coupon steps, nested transactions, a two-process final-stock race, dry-run no-write behavior, import/export integrity, staging failure cleanup, secret exclusion and safe errors. Existing HTTP/security/persistence/backup and Chromium desktop/mobile regressions are retained. Final counts and source hashes are in [phase18-validation.json](phase18-validation.json).

The shipped seed dry-run found 69 products, one order and one item, with no blocking conflicts. It reported three historical warnings: empty `updatedAt`, anonymous owner and incomplete total components. Its SHA-256 remained `d3176765b297fbc35c6a4f4eb63fa2487f40693a83decbb048aef8e04d6e1d46`. These warnings were reported; no source data was changed or imported from that file.

The storage microbenchmark uses 400 synthetic products, 300 reads and 50 durable writes per implementation on this Windows development machine. It is not a VPS capacity estimate or a before/after production application benchmark. JSON measurements exercise offline seed tools; the app already uses indexed SQLite reads. See [phase18-storage.json](benchmarks/phase18-storage.json) for latency, throughput, CPU and memory samples.

| Test path | Read p95 | Durable write p95 |
| --- | ---: | ---: |
| Legacy JSON offline tools | 5.006 ms | 16.521 ms |
| Existing runtime SQLite repository | 0.036 ms | 5.142 ms |
| Normalized SQLite rehearsal | 0.071 ms | 5.151 ms |

All three datasets passed their integrity checks. Current SQLite remains appropriate for the measured workload, with serialized writes and synchronous query work as limits. Multi-host writes, sustained write contention or larger query workloads require evidence-led database/async design work. No database migration is justified automatically by these local timings.

The HTTP benchmark uses only isolated synthetic accounts/storage, with security/rate limits enabled and stages of 5/10/25/50 concurrent reads. Its final three-trial artifact is [phase18-http-final.json](benchmarks/phase18-http-final.json); the first single-trial artifact is retained separately. Sampling variability and the desktop filesystem affect these short runs. Treat them as regression observations, not a guaranteed production SLA.

No dependencies changed, so `npm install` is not required. A PM2 restart is required when deploying the changed backend; none was performed here. Frontend assets and Nginx configuration are unchanged in this phase.

**Final validation record**

The final full suite passed 218/218 tests with no failures, skips, cancellations or TODOs; an additional 20/20 migration run covered the final validator adjustment. Syntax/HTML checks passed. Three HTTP growth trials (400 products, 250 synthetic users, 1,500 synthetic orders) produced zero errors, zero negative stock and clean integrity/FK checks. Median p95 was 33.29 ms for the homepage, 48.82 ms for product listing and 24.18 ms for admin users. At 50 concurrent reads, median throughput was 415.99 requests/sec with 108.87 ms p95. Peak sampled Node RSS was 149.10 MiB; retained post-GC heap deltas were 8904, 33440, 15064 bytes across the short soaks.

Compared with the earlier Phase 17 three-trial growth artifact, some local latencies were higher (product listing p95 41.43 to 48.82 ms; 50-concurrent p95 96.89 to 108.87 ms), while analytics p95 fell from 67.93 to 44.71 ms. These short runs do not isolate code cost from machine/filesystem scheduling, and no universal performance improvement is claimed. No security or durability setting was relaxed.

The exact changed-file inventory and final source checksums are in phase18-validation.json. Production database files in var retained pre-phase modification times; all launched application/benchmark instances used isolated test databases. No live migration, driver switch, PM2 restart or deployment was performed.
