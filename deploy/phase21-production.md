# Phase 21: exact production deployment procedure

For domain/HTTPS provisioning use [Phase 22](phase22-https.md). It supersedes the
initial HSTS assumption below: HSTS is now explicitly deferred with
`HSTS_MAX_AGE=0`, then enabled conservatively only after TLS/renewal verification.
The default anonymous smoke permits deferred HSTS; add `--require-hsts` once
enabled. All existing release/payment gates remain in force.

RELEASE DEPLOYMENT STATUS: **NOT READY** (2026-10-22).

No VPS access, upload, DNS/firewall change, certificate issuance, service change,
reboot, or production restore was performed. The IP in the old audit is a
historical observation. Confirm the actual target and paths at the prompts below.

## Requirements and blockers

- Real payments are unimplemented. Production checkout fails closed with 503;
  `release-check.cjs` deliberately returns `PAYMENTS_UNAVAILABLE`. Environment
  variables cannot implement the adapter. Do not bypass this gate.
- The local `.env` is a development configuration, lacks production settings,
  and fails the administrator password policy. It was left untouched. The real
  VPS environment, providers, TLS, process owner, and boot units are unverified.
- The update helper requires separate code directories, equal supported SQLite
  schema versions, and existing shared state outside both releases. Both releases
  must reference the same private `.env` and database. If the current VPS keeps
  state inside its code directory, **stop and arrange a separately reviewed
  maintenance transition**. Do not move live WAL files, copy only the main SQLite
  file, overwrite `.env`, switch drivers, or fabricate a previous release.
- Production requires an already working HTTPS origin and trusted certificate.
  Without these, HTTPS/DNS/certificate provisioning remains outstanding. Keep the
  existing healthy service running; an HTTP IP check does not establish readiness.

Runtime: **Node >=24.15.0 <25**. Start: `npm start` (`node server.js`). Target:
**127.0.0.1:3000**, behind Nginx, one PM2 fork named **web2**. SIGINT/SIGTERM drain
HTTP and close SQLite within 10 seconds; PM2 allows 12 seconds. Use a controlled
restart, with a brief interruption, for this single-process architecture. See
[PM2 shutdown](https://pm2.keymetrics.io/docs/usage/signals-clean-restart/) and
[cluster reload behavior](https://pm2.io/docs/runtime/guide/load-balancing/).

## Environment variable names only

Required deployment configuration: `NODE_ENV`, `HOST`, `PORT`, `APP_ORIGIN`,
`TRUST_PROXY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BACKUP_DIR`, and either
`SQLITE_PATH` or `DATABASE_PATH`.

Provider requirements enforced by the production gate: `TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`, `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_API_URL` (generic SMS),
`SMS_TEMPLATE_ID` (Kavenegar). `ACCOUNT_TOTP_KEY` is also required by the release
gate for customer authenticator support; preserve an existing key across releases.

Optional: `STORAGE_DRIVER`, `ALLOWED_ORIGINS`, `ADMIN_TOTP_SECRET`, `STORE_TIMEZONE`,
`CAPTCHA_PROVIDER`, `SMS_SENDER`, `OTP_TTL_MINUTES`, `BACKUP_DAILY_DAYS`,
`BACKUP_WEEKLY_WEEKS`, `BACKUP_MIN_FREE_MB`, `BACKUP_MAX_SIZE_MB`,
`DISK_WARN_PERCENT`, `DISK_CRITICAL_PERCENT`, `NGINX_HEALTH_URL`, `OPS_ALERT_HOOK`.

Compatibility aliases: `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`, `SMS_TEMPLATE`.
The release gate expects canonical provider names. If both SQLite path names are
set, they must agree. `SEED_DATA_PATH` is an optional bootstrap override; do not
change it during a live update. Sessions use random 256-bit opaque tokens, stored
as hashes in SQLite: no session/cookie secret variable is required. Do not invent
`SESSION_SECRET` or `JWT_SECRET` for the active application. `DATABASE_URL`, SMTP,
and payment-provider variables cannot enable missing adapters. Validators report
names/codes only, without environment values.

## A. Local Windows PowerShell commands

Each native command is checked. No reset, upgrade, or `.env` edit is required.

```powershell
Set-Location 'H:\web 2'
$ErrorActionPreference = 'Stop'
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Syntax failed; stop.' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed; stop.' }
$ReleaseId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$Release = node scripts/package-release.cjs --output ".runtime/phase21-$ReleaseId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $Release.status -ne 'ok') { throw 'Packaging failed; stop.' }
node scripts/package-release.cjs --verify $Release.source
if ($LASTEXITCODE -ne 0) { throw 'Manifest failed; stop.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $Release.archive
$ReleaseId
```

The allowlist includes active code/assets, backup/migration tools, deploy examples,
and isolated active tests/fixtures needed before activation. Fixtures are private
over HTTP. The generated seed contains catalog products only, never local orders,
messages, accounts, or settings. It does not replace the production database.
Excluded: `.env`, `node_modules`, `.git`, `.runtime`, coverage, logs, backups,
editor metadata, root scratch scripts, and archived applications. Local scratch
files are preserved. The package includes file hashes and an archive SHA-256.

Only after blockers are resolved and the target is confirmed, transfer to a new
private incoming directory in the SSH user's home. No live code is replaced:

```powershell
$Vps = Read-Host 'Confirmed SSH destination (user@host)'
$SshPort = [int](Read-Host 'Confirmed SSH port')
if ($SshPort -lt 1 -or $SshPort -gt 65535) { throw 'Invalid SSH port.' }
$RemoteIncoming = "web2-incoming/$ReleaseId"
ssh -p $SshPort $Vps "install -d -m 0700 '$RemoteIncoming'"
if ($LASTEXITCODE -ne 0) { throw 'Incoming directory failed; stop.' }
scp -P $SshPort $Release.archive $Release.checksum "${Vps}:$RemoteIncoming/"
if ($LASTEXITCODE -ne 0) { throw 'Transfer failed; stop.' }
ssh -p $SshPort $Vps
```

None of these external commands was executed by the assistant.

## B. Linux commands after SSH into the VPS

Use Bash as the existing PM2 owner (switch to that user before invoking PM2 if
necessary). Keep a second working SSH session open. Run small sections, inspect
each result, and stop on failures. Never display `.env`, `pm2 env`, raw `jlist`,
cookie values, or request bodies in a shared report.

```bash
bash
set -euo pipefail
umask 077
id -un
node --version
npm --version
pm2 --version
pm2 status
sudo nginx -t
sudo ss -lntp
systemctl is-enabled nginx
systemctl is-enabled "pm2-$(id -un)"
sudo ufw status numbered
sudo nft list ruleset
sudo sshd -T | awk '$1 == "port" {print}'
```

Use the existing firewall tool if UFW/nft is absent; do not install, flush, enable,
or alter firewall rules during this audit. Check the VPS provider firewall too.
Public application ingress should be 80/443; Node 3000 must be loopback only.
Preserve the real SSH management port. Missing boot integration is addressed
below; verify whether the host already uses a differently named service first.

Discover the single healthy app without displaying its environment:

```bash
PREVIOUS="$(pm2 jlist | node -e 'const fs=require("node:fs");const rows=JSON.parse(fs.readFileSync(0,"utf8")).filter(r=>r.name==="web2");if(rows.length!==1||rows[0].pm2_env?.status!=="online")process.exit(1);process.stdout.write(rows[0].pm2_env.pm_cwd);')"
PREVIOUS="$(realpath -- "$PREVIOUS")"
ENV_FILE="$(realpath -- "$PREVIOUS/.env")"
SHARED="$(dirname -- "$ENV_FILE")"
LOCK="$SHARED/deploy.lock"
test -r "$ENV_FILE"
test ! -e "$LOCK"
stat -c '%a %U:%G %n' "$ENV_FILE" "$SHARED"
read -r -p 'Release ID printed on Windows: ' RELEASE_ID
[[ "$RELEASE_ID" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$ ]]
INCOMING="$HOME/web2-incoming/$RELEASE_ID"
cd "$INCOMING"
sha256sum -c web2-release.tgz.sha256
read -r -p 'Existing writable absolute release-parent directory: ' RELEASES
[[ "$RELEASES" = /* ]]
RELEASES="$(realpath -- "$RELEASES")"
test -d "$RELEASES"
test -w "$RELEASES"
CANDIDATE="$RELEASES/$RELEASE_ID"
test ! -e "$CANDIDATE"
mkdir -m 0700 -- "$CANDIDATE"
tar --extract --gzip --file "$INCOMING/web2-release.tgz" --directory "$CANDIDATE" --no-same-owner --no-same-permissions --keep-old-files
node "$CANDIDATE/scripts/package-release.cjs" --verify "$CANDIDATE"
ln -s -- "$ENV_FILE" "$CANDIDATE/.env"
cd "$CANDIDATE"
node scripts/deploy.cjs --candidate "$CANDIDATE" --previous "$PREVIOUS" --env-file "$ENV_FILE" --lock "$LOCK" --dry-run
node scripts/release-check.cjs --env-file "$ENV_FILE"
```

Dry-run checks separate physical release paths, equal code schema versions, shared
`.env` identity, existing nonempty SQLite storage/private backup directory, PM2
configuration, and state outside both releases, including resolved symlinks.
It does not install, migrate/open SQLite, call providers, restart, or write a
marker. Do not bypass failure if the old deployment is incompatible.

**The production gate currently fails on payments. Stop there.** The commands
below are for a future release passing that gate with the actual VPS environment.

```bash
install -d -m 0700 -- "$SHARED/logs" "$CANDIDATE/var"
ln -s -- "$SHARED/logs" "$CANDIDATE/var/logs"
RECORD="$SHARED/phase21-$RELEASE_ID.json"
node -e 'const fs=require("node:fs");const [previous,candidate,envFile,lock,file]=process.argv.slice(1);fs.writeFileSync(file,JSON.stringify({previous,candidate,envFile,lock}),{flag:"wx",mode:0o600});' "$PREVIOUS" "$CANDIDATE" "$ENV_FILE" "$LOCK" "$RECORD"
sudo -v
sudo -n nginx -t
node scripts/deploy.cjs --candidate "$CANDIDATE" --previous "$PREVIOUS" --env-file "$ENV_FILE" --lock "$LOCK" --apply
```

Apply obtains an exclusive lock and validates one online existing `web2` at the
previous path, including conflicting PM2 environment overrides. It then runs:

1. Nginx validation, production environment validation, previous local readiness.
2. `npm ci --ignore-scripts --include=dev --no-audit --no-fund` in the candidate.
3. `npm run check:production` and `npm run test:production`. All active suites
   use synthetic credentials/disposable databases; archived-app suites are excluded.
   Chromium is explicitly skipped if absent on Linux; it must pass on Windows.
4. `npm ci --ignore-scripts --omit=dev --no-audit --no-fund`, then load all runtime
   dependencies and built-in SQLite. The locked bcrypt package supplies prebuilt
   binaries; native/platform load failures stop activation. Do not blindly enable
   install scripts. No dependency upgrade is performed.
5. `node scripts/backup.cjs --no-retention`: a live-consistent verified SQLite
   snapshot, preserving all old snapshots. Integrity, foreign keys, and key tables
   are checked; deploy independently checks the file type, size, SHA-256, and
   database again. Backup failure stops activation. No `node_modules` or `.env`
   is included; retain secrets via the host's separate restricted recovery process.
6. A second `nginx -t`, then controlled `pm2 startOrRestart` of the candidate
   ecosystem, `--only web2 --env production --update-env`, to update its cwd and
   entrypoint. A plain same-directory restart would retain the old release path.
7. Local `/health` and storage `/ready`, exact process/path check, anonymous local
   and public HTTPS smoke, then `pm2 save` only on success.

Every pre-activation failure leaves the running process alone. Post-activation
failure attempts code rollback, local readiness, previous process verification,
and save; explicit errors distinguish rollback success/failure. Data is never
restored automatically. Keep the previous code and dependencies intact. No Git
infrastructure or PM2/global dependency upgrade is assumed. See
[npm ci lock behavior](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

## C. Verification commands

Linux, immediately after activation and again after normal traffic. Inspect logs
privately, without copying historical secrets into reports.

```bash
PUBLIC_ORIGIN="$(node -e 'const fs=require("node:fs"),{parseEnv}=require("node:util");process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8")).APP_ORIGIN);' "$ENV_FILE")"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/health
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ready
node "$CANDIDATE/scripts/production-smoke.cjs" --base http://127.0.0.1:3000
node "$CANDIDATE/scripts/production-smoke.cjs" --base "$PUBLIC_ORIGIN"
curl --fail --silent --show-error --head --max-time 10 "$PUBLIC_ORIGIN/"
curl --fail --silent --show-error --head --max-time 10 "${PUBLIC_ORIGIN/https:/http:}/"
curl --fail --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code} %{time_total}\n' http://127.0.0.1:3000/health
pm2 status
pm2 logs web2 --lines 100 --nostream
node --env-file="$ENV_FILE" "$CANDIDATE/scripts/monitor.cjs"
pm2 pid web2 | xargs -r ps -o pid,pcpu,pmem,rss,etime,comm -p
free -h
df -h
sudo ss -lntp
```

Expect health/ready status `ok`, HTTP 200, local health under two seconds, one
online fork, stable restart counts, no crash loop, and reasonable CPU/RSS. Check
startup, missing-config, storage, and unhandled-rejection errors. Investigate
sustained memory growth toward the existing 512 MiB restart limit; do not raise
limits to hide it. The monitor prints safe readiness/storage/disk/PM2 statistics.

The GET-only smoke covers home, products/search, anonymous session, cart/profile/
checkout pages, admin-login page, authorization denial, health/readiness, and
sensitive files. It checks CSP, nosniff, DENY framing, referrer policy, no
X-Powered-By, and HSTS when explicitly enabled. Sensitive paths must return 403/404, never 200 or a
generic successful redirect. `/ready` verifies storage, unlike liveness alone.

HTTPS must validate without `-k`. Check that HTTP gives 301/308 to the intended
HTTPS host, with valid certificate chain, hostname, and dates:

```bash
read -r -p 'Confirmed VPS public IP: ' SERVER_IP
curl --silent --show-error --head --max-time 10 "http://$SERVER_IP/"
DOMAIN="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$PUBLIC_ORIGIN")"
openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -verify_hostname "$DOMAIN" -verify_return_error </dev/null 2>/dev/null | openssl x509 -noout -dates
```

For a CDN/proxied hostname also verify actual Nginx from the VPS with
`curl --resolve "$DOMAIN:443:127.0.0.1"` against the same HTTPS URL and normal TLS
validation. Do not modify DNS. HTTP on the IP is a routing diagnostic, not HTTPS
readiness. Outside the VPS, Windows PowerShell firewall checks:

```powershell
$VpsAddress = Read-Host 'Confirmed VPS public IP'
Test-NetConnection -ComputerName $VpsAddress -Port 80 -InformationLevel Quiet
Test-NetConnection -ComputerName $VpsAddress -Port 443 -InformationLevel Quiet
Test-NetConnection -ComputerName $VpsAddress -Port 3000 -InformationLevel Quiet
```

Expect public 80/443 reachable and 3000 unreachable. Check IPv4 and IPv6 when both
exist. Preserve SSH. No firewall mutation commands are included.

### Authenticated smoke and cookies

In a browser over the real HTTPS origin, use existing dedicated test accounts.
Complete real Turnstile; never enable mock CAPTCHA/SMS in production. Check login,
session after refresh, cart, profile, logout, and invalid/empty checkout validation
without placing an order or consuming stock. Verify admin login/session with a
dedicated admin; a customer must get 403 on an admin API and no admin dashboard.
Do not change roles, delete accounts, send real OTPs, or make paid purchases for
smoke testing. IDOR, CSRF, rate-limit floods, server prices, and stock races run
only in the isolated regression suites, not against production users.

Inspect cookie attributes only: `__Host-`, Secure, HttpOnly, SameSite=Strict,
Path=/, no Domain, sensible Max-Age/Expires (customer 5 hours, admin 8 hours,
pending second factor 5 minutes). Sessions also enforce inactivity, expiry,
revocation, and CSRF. Local development retains HTTP support. Report any provider,
login, checkout, or cookie gap as a blocker, never as a successful live test.

### Nginx review and optional change

A code-only deployment keeps working Nginx unchanged; no reload is needed.
Privately review localhost upstream, no repository-root root/alias, sensitive-file
denial, existing headers, 1 MiB body limit, bounded client/connect/read/send
timeouts, rate limits, and `server_tokens off`. Preserve TLS/ACME/static-cache
rules. The examples contain these controls. Merge needed changes into the actual
site; do not replace a working site with a placeholder template.

Only for a reviewed Nginx change, preserve its config tree and stage the new include:

```bash
sudo test ! -e "$SHARED/nginx-pre-$RELEASE_ID"
sudo cp -a -- /etc/nginx "$SHARED/nginx-pre-$RELEASE_ID"
sudo test ! -e /etc/nginx/snippets/web2-sensitive-locations.phase21.conf
sudo install -m 0644 "$CANDIDATE/deploy/nginx-sensitive-locations.conf.example" /etc/nginx/snippets/web2-sensitive-locations.phase21.conf
read -r -p 'Verified absolute existing Nginx site configuration path: ' NGINX_SITE
[[ "$NGINX_SITE" = /etc/nginx/* ]]
sudoedit "$NGINX_SITE"
sudo nginx -t
sudo systemctl reload nginx
node "$CANDIDATE/scripts/production-smoke.cjs" --base "$PUBLIC_ORIGIN"
```

Include the staged sensitive-location file inside HTTPS before optional regex
static-cache locations. Review duplicate directives when merging other examples.
Reload only after validation succeeds; do not restart Nginx. See
[Nginx configuration reload](https://nginx.org/en/docs/control.html).

### PM2 commands and boot persistence

First start only after all release checks and only if no matching process exists:

```bash
pm2 jlist | node -e 'const fs=require("node:fs");const rows=JSON.parse(fs.readFileSync(0,"utf8"));if(rows.some(r=>r.name==="web2"||r.pm2_env?.pm_exec_path===process.argv[1]+"/server.js"))process.exit(1);' "$CANDIDATE"
pm2 start "$CANDIDATE/deploy/ecosystem.config.cjs" --only web2 --env production
```

Same-release controlled restart, inspection, save after health, and boot checks:

```bash
pm2 restart web2 --update-env
pm2 status
pm2 logs web2 --lines 100 --nostream
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ready
pm2 save
systemctl is-enabled "pm2-$(id -un)"
systemctl is-enabled nginx
```

Do not restart merely to inspect status. After first start, run the complete
local/public health checks before saving. If startup integration is missing, as
the existing PM2 owner run:

```bash
pm2 startup
```

Run **the exact command PM2 prints**, using its detected Node path, user, and
home. Do not invent the generated systemd command. Then:

```bash
pm2 save
systemctl is-enabled "pm2-$(id -un)"
systemctl status "pm2-$(id -un)" --no-pager
systemctl is-enabled nginx
```

Both relevant boot units must be enabled. Use the actual unit name if customized;
do not duplicate working integration. Report disabled Nginx and review service
policy before enabling it. See [PM2 startup](https://pm2.keymetrics.io/docs/usage/startup/).

After an operator-scheduled reboot, reconnect as the same owner and restore the
public-origin/path variables before these checks. **No reboot is executed here.**

```bash
pm2 status
systemctl status nginx --no-pager
systemctl status "pm2-$(id -un)" --no-pager
curl --fail --silent --show-error --head --max-time 5 http://127.0.0.1:3000/
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ready
curl --fail --silent --show-error --head --max-time 10 "$PUBLIC_ORIGIN/"
node "$CANDIDATE/scripts/production-smoke.cjs" --base "$PUBLIC_ORIGIN"
```

## D. Exact code rollback commands (Linux)

Retain both code directories, shared database/environment/logs, and the verified
snapshot. Apply attempts automatic code rollback after activation failure. For a
manual rollback use the private metadata record written before activation:

```bash
set -euo pipefail
read -r -p 'Absolute phase21 deployment record path: ' RECORD
[[ "$RECORD" = /* ]]
PREVIOUS="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).previous)' "$RECORD")"
CANDIDATE="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).candidate)' "$RECORD")"
ENV_FILE="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).envFile)' "$RECORD")"
LOCK="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).lock)' "$RECORD")"
test ! -e "$LOCK"
node "$CANDIDATE/scripts/deploy.cjs" --candidate "$PREVIOUS" --previous "$CANDIDATE" --env-file "$ENV_FILE" --lock "$LOCK" --dry-run
pm2 jlist | node -e 'const fs=require("node:fs"),path=require("node:path");const dirs=process.argv.slice(1);const rows=JSON.parse(fs.readFileSync(0,"utf8")).filter(r=>r.name==="web2"||dirs.some(d=>r.pm2_env?.pm_exec_path===path.join(d,"server.js")));if(rows.length!==1||rows[0].name!=="web2")process.exit(1);' "$PREVIOUS" "$CANDIDATE"
pm2 startOrRestart "$PREVIOUS/deploy/ecosystem.config.cjs" --only web2 --env production --update-env
for attempt in $(seq 1 20); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3000/ready >/dev/null; then break; fi
  sleep 0.5
done
PUBLIC_ORIGIN="$(node -e 'const fs=require("node:fs"),{parseEnv}=require("node:util");process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8")).APP_ORIGIN);' "$ENV_FILE")"
node "$CANDIDATE/scripts/production-smoke.cjs" --base http://127.0.0.1:3000
node "$CANDIDATE/scripts/production-smoke.cjs" --base "$PUBLIC_ORIGIN"
pm2 jlist | node -e 'const fs=require("node:fs"),path=require("node:path");const rows=JSON.parse(fs.readFileSync(0,"utf8")).filter(r=>r.name==="web2");if(rows.length!==1||rows[0].pm2_env?.status!=="online"||fs.realpathSync(rows[0].pm2_env.pm_cwd)!==fs.realpathSync(process.argv[1])||rows[0].pm2_env.pm_exec_path!==path.join(process.argv[1],"server.js"))process.exit(1);' "$PREVIOUS"
pm2 save
pm2 status
pm2 logs web2 --lines 100 --nostream
```

If already on the previous release, check health before restarting needlessly.
Never remove a held/stale lock without identifying its owner and proving no
deployment is running. Unequal schemas require a separate migration/rollback
plan. If an optional Nginx edit failed, review the saved config and restore only
the reviewed config, followed by `nginx -t` and reload. Never restore old business
data merely to undo code changes. No production-data restore command is included.
