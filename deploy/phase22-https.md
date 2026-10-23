# Phase 22: domain, HTTPS and private Node deployment

HTTPS READINESS: **NOT READY** (2026-10-22).

This is a prepared runbook, not a record of a live deployment. No DNS, VPS,
firewall, service, SSH, certificate or reboot action was executed. The real domain,
VPS IP, Ubuntu release, SSH listener, live environment and Nginx configuration
remain unverified. The 2026-10-15 audit is historical: it reported public Node
3000 and unavailable HTTPS; it is not evidence of today's state.

**Stop here for the current release:** real payments are unimplemented and the
existing production gate returns `PAYMENTS_UNAVAILABLE`. Do not bypass this or
any failing production/security test. The commands below are conditional commands
for a future deployment after that gate is resolved. Keep the healthy existing
service running while resolving blockers. Phase 21 release, backup, schema,
rollback and process ownership requirements continue to apply.

## Application audit and configuration

| Item | Actual active application / target |
| --- | --- |
| Entrypoint | Root `server.js`, Node >=24.15.0 <25; archived backends are not deployed |
| Process | Existing single PM2 fork `web2`; no duplicate start or cluster change |
| Upstream | `HOST=127.0.0.1`, `PORT=3000`; production startup rejects public bind addresses |
| Origin | `APP_ORIGIN=https://YOUR_DOMAIN`, exact canonical apex; no path, HTTP, localhost or IP:3000 |
| Proxy trust | `TRUST_PROXY=loopback`; address trust, never `true`, `1`, wildcard or arbitrary chains |
| Health | `/health` is liveness; `/ready` checks SQLite; both 200 JSON `{"status":"ok"}` and no-store |
| Browser API | Relative `/api/...`; `js/api-config.js` changes ports only for loopback Live Server development |
| CORS | Explicit exact origins, credentials allowed; production rejects HTTP origins. Leave `ALLOWED_ORIGINS` empty for this same-origin deployment; the canonical `APP_ORIGIN` is already allowed |
| Cookies | Production `__Host-` opaque sessions; Secure, HttpOnly, SameSite=Strict, Path=/, no Domain; customer 5 hours, admin 8 hours. CSRF/authorization/revocation remain enforced |
| Headers | Express owns CSP, nosniff, DENY framing / CSP frame-ancestors, Referrer-Policy, Permissions-Policy and optional HSTS. Nginx passes these through without duplicate add_header / hide_header directives |
| Public files | Express allowlists root JS/CSS, `/js`, `/css`, `/img`, and renders pages. Some admin scripts require an admin session. Never use the repository as an Nginx root/alias or bypass these guards |
| Uploads | No multipart/file upload endpoint; JSON is limited to 1 MiB and form bodies to 256 KiB. Nginx 1m matches the JSON ceiling |
| WebSockets | None found in the active application. HTTP/1.1 with an empty Connection header; no Upgrade map or WebSocket proxy is needed |
| Timeouts | Nginx connect 5s, send/read 30s; client body/header 15s, send 30s. Node request 30s, headers 15s, keepalive 5s; upstream pool retires at 4s |
| Mixed content | No hardcoded HTTP fetch/asset URLs found in active frontend HTML/JS/CSS. Server loopback/development URLs and the sitemap XML namespace are intentional |
| HSTS | `HSTS_MAX_AGE=0` during rollout; only after stable HTTPS and renewal, use `300` initially. No includeSubDomains and no preload. Maximum accepted value is 31536000 |

Target: Internet :443 -> Nginx -> **127.0.0.1:3000** -> Node / PM2. Port 80
serves only the ACME directory and permanent redirects after TLS activation.
Before first certificate issuance, the bootstrap virtual host serves ACME and
returns 503 for normal traffic; it does not expose an HTTP login.

Nginx replaces client-supplied X-Forwarded-For with `$remote_addr` and sets
X-Forwarded-Proto from `$scheme`, so Express recognizes HTTPS and uses the actual
client IP for rate limits. Do not use `$proxy_add_x_forwarded_for`, a broad
`set_real_ip_from`, or a CDN without separately reviewing the trust boundary.
[Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/).

All commands in A-H are **Ubuntu Bash/Linux**, including explicitly labeled
external checks. Run blocks individually in an interactive Bash session as the
existing PM2 owner, with sudo available. Never paste the whole runbook at once.
`set -e` does not replace inspecting results. Stop on DNS mismatch, invalid Nginx,
failed health/readiness, uncertain SSH allowances, failed certificate issuance,
origin/PM2 mismatch or failed production/security tests. No forced continuation.

## A. DNS changes to perform manually

Replace **YOUR_DOMAIN** with the user's actual apex domain everywhere in templates
and **VPS_PUBLIC_IP** with the verified VPS public IPv4 address. No real domain
has been selected or invented.

| Type | Name | Value |
| --- | --- | --- |
| A | YOUR_DOMAIN | VPS_PUBLIC_IP |
| A | www.YOUR_DOMAIN | VPS_PUBLIC_IP |
| Alternative to the www A | CNAME www.YOUR_DOMAIN | YOUR_DOMAIN |

Use one www option, not both. Only publish AAAA if IPv6 reaches this same VPS
with working Nginx and firewall rules. Correct stale AAAA records manually before
issuance. A restrictive CAA policy must permit `letsencrypt.org`. Both names must
be under your control and pass all checks if both are included in the certificate.
This plan assumes direct DNS to Nginx, without a CDN or other proxy.

From a **separate Linux machine outside the VPS**, set the real values and compare
every A/AAAA answer with the intended server. CNAME lines are not IP answers.
Check authoritative answers too if recursive resolvers disagree. These commands
do not change DNS and do not themselves prove global propagation:

```bash
set -euo pipefail
DOMAIN='YOUR_DOMAIN'
VPS_PUBLIC_IP='VPS_PUBLIC_IP'
for resolver in 1.1.1.1 8.8.8.8; do
  for name in "$DOMAIN" "www.$DOMAIN"; do
    dig "@$resolver" +short A "$name"
    dig "@$resolver" +short AAAA "$name"
    dig "@$resolver" +short CAA "$name"
  done
done
dig +short NS "$DOMAIN"
```

**Gate:** any wrong/missing A, unintended AAAA, restrictive CAA, or uncertain
ownership is a blocker. Do not request a certificate or activate the new origin.

## B. VPS prechecks

Keep a second authenticated SSH session open throughout firewall work. Do not
edit sshd, disable SSH, change password authentication/root policy, or reboot.
Confirm every SSH listener, the established connection's server port and the
provider firewall. Socket-activated SSH may differ from `sshd -T`.

```bash
bash
set -euo pipefail
umask 077
read -r -p 'Actual canonical apex domain, without scheme: ' DOMAIN
read -r -p 'Verified VPS public IPv4: ' VPS_PUBLIC_IP
test "$DOMAIN" != YOUR_DOMAIN
test "$VPS_PUBLIC_IP" != VPS_PUBLIC_IP
. /etc/os-release
case "$ID:$VERSION_CODENAME" in
  ubuntu:jammy|ubuntu:noble|ubuntu:resolute) ;;
  *) printf '%s\n' 'STOP: verify packages/support for this Ubuntu release first.'; exit 1 ;;
esac
id -un
node --version
pm2 --version
pm2 status
sudo nginx -t
sudo ss -ltnp
sudo sshd -T | awk '$1 == "port" {print}'
if systemctl cat ssh.socket >/dev/null 2>&1; then systemctl show ssh.socket -p Listen; fi
test -n "${SSH_CONNECTION:-}"
read -r SSH_CLIENT_IP SSH_CLIENT_PORT SSH_SERVER_IP SSH_SESSION_PORT <<< "$SSH_CONNECTION"
printf 'Established SSH server port: %s\n' "$SSH_SESSION_PORT"
sudo ufw app list
sudo ufw status verbose
sudo ufw show added
sudo nginx -T 2>/dev/null | awk '/^# configuration file / {print}'
```

Inspect Nginx configuration privately using sudoedit. Identify the site's actual
file, enabled symlink, server_name conflicts, all includes, certificate lineage,
existing headers and any real-IP directives. Retain other virtual hosts, default
site policy, compression, working cache, ACME and TLS directives. Do not enable
the optional static cache during this phase or place backups under a web root.

Discover the single online app and real private environment path without printing
its environment. Missing/duplicate/offline web2 is a blocker, not permission to
start a second process. Use Phase 21 separately for code release transitions.

```bash
APP_DIR="$(pm2 jlist | node -e 'const fs=require("node:fs");const rows=JSON.parse(fs.readFileSync(0,"utf8")).filter(r=>r.name==="web2");if(rows.length!==1||rows[0].pm2_env?.status!=="online")process.exit(1);process.stdout.write(rows[0].pm2_env.pm_cwd);')"
APP_DIR="$(realpath -- "$APP_DIR")"
cd "$APP_DIR"
ENV_FILE="$(realpath -- "$APP_DIR/.env")"
test -r "$ENV_FILE"
test -w "$ENV_FILE"
stat -c '%a %U:%G %n' "$ENV_FILE"
curl -fsS --max-time 5 http://127.0.0.1:3000/health
curl -fsS --max-time 5 http://127.0.0.1:3000/ready
sudo ss -ltnp '( sport = :3000 )'
```

Require **127.0.0.1:3000 owned by the intended Node process**, with no public IPv4
or IPv6 listener on 3000. If it is public, stop deployment and first arrange a
controlled correction of the existing service to localhost, with health and
rollback checks. Do not rely solely on firewall rules. Local curl proves local
health, not public reachability. The rollback baseline must itself have private
Node, a working origin, known PM2 settings and successful production tests.

Create a root-private timestamped recovery directory before any production edits.
It is outside the repository and all public roots; it is not a public/project
backup. Keep this directory and its timestamp available in the second SSH session.
No Let's Encrypt keys are copied into the project or release archives.

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/root/web2-phase22-$STAMP"
sudo test ! -e "$BACKUP"
sudo install -d -m 0700 "$BACKUP"
sudo cp -a -- /etc/nginx "$BACKUP/nginx"
sudo cp -p -- "$ENV_FILE" "$BACKUP/app.env"
sudo chmod 0600 "$BACKUP/app.env"
sudo cp -a -- /etc/ufw "$BACKUP/ufw"
sudo cp -p -- /etc/default/ufw "$BACKUP/ufw-defaults"
```

Prepare a private candidate env next to the real env, without changing the running
process. Edit only transport values below; preserve every secret/provider/storage
value. Do not use `cat .env`, shell `source .env`, `pm2 env`, raw `pm2 jlist` or
`printenv` in a report. The candidate and backup may contain secrets; keep them in
the host's private recovery process, outside release/public archives.

```bash
NEXT_ENV="$(mktemp --tmpdir="$(dirname -- "$ENV_FILE")" .web2-phase22-env.XXXXXXXX)"
cp -p -- "$ENV_FILE" "$NEXT_ENV"
chmod 0600 "$NEXT_ENV"
editor "$NEXT_ENV"
```

Set these **non-secret settings**, inserting the real domain:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://YOUR_DOMAIN
TRUST_PROXY=loopback
ALLOWED_ORIGINS=
HSTS_MAX_AGE=0
```

```bash
node scripts/https-preflight.cjs --env-file "$NEXT_ENV" --domain "$DOMAIN"
node scripts/release-check.cjs --env-file "$NEXT_ENV"
npm run check:production
npm run test:production
```

The offline HTTPS check validates transport and origin only; it is not DNS/TLS or
overall release readiness. The full release check currently fails on payments.
**Stop on that failure.** Resolve provider/security/release blockers before C-F.
Do not upload/deploy this source to bypass Phase 21's existing release gates.

## C. Nginx configuration

For a future passing release, operational order is **A, B, E (allow ingress safely),
C, D, F, G**. If UFW is already active, allow HTTP/HTTPS safely in E before trying
the ACME canary. No existing service configuration is overwritten automatically.

These are the exact configuration sources; replace every YOUR_DOMAIN token:

- [Final HTTP + apex HTTPS + www HTTPS site](nginx.conf.example).
- [ACME-only HTTP bootstrap, before certificates exist](nginx-http-acme.conf.example).
- [Local upstream, HTTP context](nginx-upstream.conf.example).
- [Rate limits and log format, HTTP context](nginx-rate-limits.conf.example).
- [Proxy headers, HTTP/1.1 and timeouts, location context](nginx-proxy.conf.example).
- [Private paths, extensions and dotfiles, server context](nginx-sensitive-locations.conf.example).

The final config permanently redirects normal HTTP and www HTTPS to
`https://YOUR_DOMAIN$request_uri`, preserving the path/query. Sensitive paths
return 404, including on redirect hosts. Only `^~ /.well-known/acme-challenge/`
escapes the dotfile rule, with a dedicated system webroot. Other `.well-known`
paths remain blocked. The TLS key stays under `/etc/letsencrypt/live/...`.
`server_tokens off` is in each server context; stock Nginx may still say `Server:
nginx`, without its version. It does not need a third-party header module.
[Nginx directive reference](https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens).

Stage and review the files. This does not change active Nginx. The offline domain
check in B must have passed before interpolating DOMAIN into sed commands.

```bash
STAGE="$(mktemp -d -t web2-phase22.XXXXXXXX)"
sed "s/YOUR_DOMAIN/$DOMAIN/g" deploy/nginx.conf.example > "$STAGE/final.conf"
sed "s/YOUR_DOMAIN/$DOMAIN/g" deploy/nginx-http-acme.conf.example > "$STAGE/bootstrap.conf"
cp deploy/nginx-upstream.conf.example "$STAGE/upstream.conf"
cp deploy/nginx-rate-limits.conf.example "$STAGE/rate-limits.conf"
cp deploy/nginx-proxy.conf.example "$STAGE/proxy.conf"
cp deploy/nginx-sensitive-locations.conf.example "$STAGE/sensitive.conf"
sudo install -d -m 0755 /var/lib/letsencrypt/.well-known/acme-challenge
sudo install -d -m 0755 /etc/nginx/snippets
```

For each include, install only if the destination does not exist. When it exists,
merge the reviewed staged change privately with sudoedit and retain working rules;
do not duplicate zones, log formats, upstreams or directives. The function below
opens existing files for that manual merge, and never replaces them itself.

```bash
install_or_review() {
  local source_file="$1" target_file="$2"
  if sudo test -L "$target_file"; then
    printf '%s\n' 'STOP: review the existing include symlink and its destination first.'
    return 1
  fi
  if sudo test -e "$target_file"; then
    printf 'Merge reviewed changes from %s into %s privately.\n' "$source_file" "$target_file"
    sudoedit "$target_file"
  else
    sudo install -m 0644 -- "$source_file" "$target_file"
  fi
}
install_or_review "$STAGE/upstream.conf" /etc/nginx/conf.d/web2-upstream.conf
install_or_review "$STAGE/rate-limits.conf" /etc/nginx/conf.d/web2-rate-limits.conf
install_or_review "$STAGE/proxy.conf" /etc/nginx/snippets/web2-proxy.conf
install_or_review "$STAGE/sensitive.conf" /etc/nginx/snippets/web2-sensitive-locations.conf
read -r -p 'Reviewed absolute WEB 2 site config path under /etc/nginx/: ' NGINX_SITE
NGINX_SITE="$(sudo realpath -m -- "$NGINX_SITE")"
[[ "$NGINX_SITE" == /etc/nginx/* ]]
test "$NGINX_SITE" != /etc/nginx/nginx.conf
```

If valid TLS already exists, keep it and merge the final config directly after
checking both names and actual certificate paths in D. Otherwise merge the
bootstrap virtual host while preserving any other existing virtual hosts:

```bash
install_or_review "$STAGE/bootstrap.conf" "$NGINX_SITE"
if [[ "$NGINX_SITE" == /etc/nginx/sites-available/* ]]; then
  NGINX_LINK="/etc/nginx/sites-enabled/$(basename -- "$NGINX_SITE")"
  if sudo test -L "$NGINX_LINK"; then
    test "$(sudo readlink -f -- "$NGINX_LINK")" = "$NGINX_SITE"
  else
    sudo test ! -e "$NGINX_LINK"
    sudo ln -s -- "$NGINX_SITE" "$NGINX_LINK"
  fi
fi
sudo nginx -t && sudo systemctl reload nginx
```

Treat duplicate-server-name warnings as a blocker even if `nginx -t` exits zero.
Before **every** reload, run `nginx -t` and reload only on success. Do not restart
Nginx to push through an invalid config. If there is no working Node health,
no trusted SSH allowance or a DNS mismatch, do not reach this step.

At final HTTPS cutover, retire any **WEB 2** bare-IP HTTP proxy left from the
historical `nginx-http-ip.conf.example`. Merge its verified IP into the final
HTTP server_name list, or change that existing WEB 2 IP virtual host's normal
location to `return 308 https://YOUR_DOMAIN$request_uri;` with the real fixed
domain. Do not keep an alternate HTTP application proxy. Preserve unrelated
sites; do not replace the machine's global default-server policy blindly.

Create a harmless ACME routing canary (not a credential):

```bash
ACME_CANARY="web2-phase22-$STAMP"
printf '%s\n' "$ACME_CANARY" | sudo tee "/var/lib/letsencrypt/.well-known/acme-challenge/$ACME_CANARY" >/dev/null
sudo chmod 0644 "/var/lib/letsencrypt/.well-known/acme-challenge/$ACME_CANARY"
```

From the external Linux machine, set the printed timestamp's canary name and
require a 200 with exactly that content, for both names and every published IP
family. A local request or an unrelated default site's 200 is insufficient:

```bash
set -euo pipefail
ACME_CANARY='web2-phase22-REPLACE_WITH_TIMESTAMP'
for name in "$DOMAIN" "www.$DOMAIN"; do
  curl -4fsS --max-time 10 "http://$name/.well-known/acme-challenge/$ACME_CANARY" | grep -Fx "$ACME_CANARY"
done
# If AAAA is published, repeat the loop with curl -6.
```

## D. Certbot / HTTPS

Ubuntu package metadata currently lists `certbot` and `python3-certbot-nginx` for
22.04, 24.04 and 26.04 LTS; the Nginx plugin is in Universe. The actual VPS release
and configured package candidates must still be checked. Do not mix apt and Snap
Certbot installations or change repositories blindly.
[Ubuntu package catalogue](https://packages.ubuntu.com/python3-certbot),
[Ubuntu 26.04 Nginx plugin](https://packages.ubuntu.com/resolute/python3-certbot-nginx).

```bash
command -v certbot || true
if command -v snap >/dev/null; then snap list certbot || true; fi
sudo apt update
apt-cache policy certbot python3-certbot-nginx
sudo apt-get --simulate install certbot python3-certbot-nginx
```

Stop on a Snap conflict, missing candidates, unsupported release or unexpected
package/config replacement. For the verified apt route, install interactively,
retaining reviewed local Nginx files when prompted:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --version
sudo certbot plugins
sudo certbot certificates
sudo nginx -t
```

**Issuance gate:** externally verified DNS for both names, reachable HTTP 80 and
successful ACME canary, valid Nginx, healthy private Node, correct candidate origin,
known SSH allowance, passing production gate/tests, and no already adequate
certificate. Otherwise stop. No certificate command in this guide was executed.

The recommended bootstrap uses webroot to obtain only the certificate; installing
the reviewed final site stays a separate step. Certbot asks for the real contact
email and terms interactively; do not invent or expose an email/credential.

```bash
sudo nginx -t && sudo certbot certonly --webroot --webroot-path /var/lib/letsencrypt --cert-name "$DOMAIN" -d "$DOMAIN" -d "www.$DOMAIN"
```

The requested Nginx-plugin alternative, **instead of** that command, is below.
It edits Nginx, so use only after reviewing the site and backup; compare changes
privately afterwards. Do not run both or force renewal. Literal placeholder form:

```bash
sudo nginx -t && sudo certbot --nginx --no-redirect --cert-name YOUR_DOMAIN -d YOUR_DOMAIN -d www.YOUR_DOMAIN
```

If issuance fails, stop; preserve the working config and inspect Certbot errors
privately. Do not enable a site pointing at nonexistent certificates, disable
TLS verification, force reissue, or delete valid certificates. Certbot's documented
Nginx/webroot options and renewal behavior are in the
[Certbot user guide](https://eff-certbot.readthedocs.io/en/stable/using.html).

After success, verify the reported lineage and paths. If it is suffixed `-0001`,
edit both HTTPS servers in the staged file to use the actual paths. Do not copy
or loosen the permissions of the key. Check names/dates without reading key data:

```bash
sudo certbot certificates
sudo openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" -noout -dates -ext subjectAltName
sudo stat -Lc '%a %U:%G %n' "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
install_or_review "$STAGE/final.conf" "$NGINX_SITE"
sudo nginx -t && sudo systemctl reload nginx
```

Use actual lineage paths in the two inspection commands if different. When
merging, **replace the bootstrap server for these same names**; do not append a
duplicate HTTP block. Leave other domains alone. Verify trusted TLS and redirects
before switching APP_ORIGIN. No Nginx HSTS directive is added.

For webroot renewals, Nginx needs a validated reload after the certificate changes.
Preserve an existing working deploy hook. If none does this, create this staged
hook and install it only at a new unused path (an existing file requires review):

```bash
cat > "$STAGE/web2-nginx-reload" <<'SH'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
SH
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo test ! -e /etc/letsencrypt/renewal-hooks/deploy/web2-nginx-reload
sudo test ! -L /etc/letsencrypt/renewal-hooks/deploy/web2-nginx-reload
sudo install -m 0755 "$STAGE/web2-nginx-reload" /etc/letsencrypt/renewal-hooks/deploy/web2-nginx-reload
systemctl is-enabled certbot.timer || true
systemctl is-active certbot.timer || true
systemctl list-timers --all '*certbot*'
```

For a verified apt installation with no alternate renewal scheduler, enable its
timer if it is not enabled; do not create duplicate cron jobs or Snap timers:

```bash
sudo systemctl enable --now certbot.timer
systemctl status certbot.timer --no-pager
systemctl list-timers --all certbot.timer
sudo certbot renew --cert-name "$DOMAIN" --dry-run
```

The dry run must pass. No `--force-renewal` is needed. Keep HTTP ACME reachable
for renewals. Certificates/keys stay system-managed, outside project backups.

## E. UFW, with SSH first

If SSH port/listeners or the active firewall manager cannot be confirmed, **stop
before enabling UFW**. Preserve all current SSH rules and provider permissions.
Do not install/enable a competing firewall over an unmanaged nftables/iptables
policy. Verify the `IPV6` setting in `/etc/default/ufw` privately if IPv6 exists;
do not claim IPv6 filtering when UFW's IPv6 support is disabled. Do not reset UFW.
[Ubuntu UFW profiles and commands](https://documentation.ubuntu.com/server/how-to/security/firewalls/index.html).

After comparing B's established port, `ss` listeners, sshd/socket configuration
and provider rules, explicitly enter the **VPS's actual listening SSH port**.
If multiple SSH ports exist, allow and preserve all of them before continuing.
If SSH uses 3000, 80 or 443, stop and resolve the architecture separately.

```bash
read -r -p 'Confirmed existing SSH listening port: ' SSH_PORT
[[ "$SSH_PORT" =~ ^[0-9]+$ ]]
(( SSH_PORT >= 1 && SSH_PORT <= 65535 ))
test "$SSH_PORT" = "$SSH_SESSION_PORT"
test "$SSH_PORT" != 3000
test "$SSH_PORT" != 80
test "$SSH_PORT" != 443
sudo ufw app list
sudo ufw allow "$SSH_PORT/tcp" comment 'Preserve existing SSH'
```

If the inspected OpenSSH profile exists and really matches port 22, the exact
equivalent **for SSH on 22 only** is `sudo ufw allow OpenSSH`. A custom SSH port
uses the explicit numeric rule above; do not assume the OpenSSH profile follows
sshd's custom port. Confirm profile contents before using them:

```bash
if sudo ufw app info 'Nginx Full'; then
  printf '%s\n' 'Confirm the listed profile ports before allowing it.'
else
  printf '%s\n' 'Profile unavailable; use the explicit HTTP/HTTPS rules below.'
fi
```

If that profile reports precisely TCP 80/443:

```bash
sudo ufw allow 'Nginx Full'
```

If it is absent, use these exact explicit rules instead:

```bash
sudo ufw allow 80/tcp comment 'HTTP ACME and redirect'
sudo ufw allow 443/tcp comment 'HTTPS'
```

Only after **all** SSH listeners and allowances are confirmed, including that
none uses 3000, place a Node deny before old broad/3000 allow rules. This does
not replace binding Node to localhost. Keep all SSH allowances intact:

```bash
sudo ufw insert 1 deny 3000/tcp comment 'WEB 2 Node stays private'
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw show added
sudo ufw status numbered
sudo ufw status verbose
```

Privately review the effective rules and both address families. Stop if an early
deny blocks SSH or an extra broad rule exposes another service. Do not delete
rules by a guessed number. A stale 3000 allow below the first deny is shadowed;
remove obsolete rules only in a separate reviewed cleanup. Verify provider
firewall ingress permits the actual SSH port and TCP 80/443, and excludes 3000.

Only when allowances are certain and a second SSH session is working, enable
interactively if UFW was inactive. Do not use `--force`:

```bash
sudo ufw enable
sudo ufw status verbose
```

Immediately establish a **new third SSH connection** using the existing public
SSH destination/port. Keep the previous sessions open until it works. If UFW was
already active, added rules take effect immediately; do not disable/re-enable it.
Never close SSH or modify SSH policy in this phase. Fail2ban is optional future
hardening only; it is not installed here.

## F. PM2 restart and origin switch

Only after trusted TLS for both names works, Node health is good and all gates
pass, activate the reviewed candidate environment. For a code release, first use
Phase 21's controlled compatible release procedure; a plain restart must not be
used to change release cwd/entrypoint. These commands are for the same existing
release and single existing `web2` process:

```bash
cd "$APP_DIR"
node scripts/https-preflight.cjs --env-file "$NEXT_ENV" --domain "$DOMAIN"
node scripts/release-check.cjs --env-file "$NEXT_ENV"
curl -fsSI --max-time 10 "https://$DOMAIN/"
cp -p -- "$NEXT_ENV" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
export NODE_ENV=production HOST=127.0.0.1 PORT=3000 TRUST_PROXY=loopback
export APP_ORIGIN="https://$DOMAIN" ALLOWED_ORIGINS='' HSTS_MAX_AGE=0
pm2 restart web2 --update-env
pm2 status
pm2 jlist | node scripts/https-preflight.cjs --env-file "$ENV_FILE" --domain "$DOMAIN" --pm2-stdin
curl -fsS --max-time 5 http://127.0.0.1:3000/health
curl -fsS --max-time 5 http://127.0.0.1:3000/ready
node scripts/production-smoke.cjs --base "https://$DOMAIN"
```

Explicit exports update stale PM2 transport overrides; other secrets remain
private and unchanged. The piped PM2 check reports names/codes only and refuses
duplicates, stale overrides or the wrong cwd/entrypoint. If it fails, stop and
roll back; do not repeatedly restart or start another app. One fork has a brief
restart interruption; do not describe this as zero downtime.

Save only after G passes:

```bash
pm2 save
```

## G. Verification

Run trusted HTTPS checks without `-k`. Health/ready must return HTTP 200 with
status ok. Normal HTTP and www must return 301/308 to the canonical HTTPS host,
preserving path/query. Do not follow redirects when checking their first hop:

```bash
curl -fsSI --max-time 10 "https://$DOMAIN/"
curl -fsS --max-time 10 "https://$DOMAIN/health"
curl -fsS --max-time 10 "https://$DOMAIN/ready"
curl -sSI --max-time 10 "http://$DOMAIN/products?q=phase22"
curl -sSI --max-time 10 "http://www.$DOMAIN/products?q=phase22"
curl -sSI --max-time 10 "https://www.$DOMAIN/products?q=phase22"
curl -sSI --max-time 10 "http://$VPS_PUBLIC_IP/"
node scripts/production-smoke.cjs --base http://127.0.0.1:3000
node scripts/production-smoke.cjs --base "https://$DOMAIN"
pm2 jlist | node scripts/https-preflight.cjs --env-file "$ENV_FILE" --domain "$DOMAIN" --pm2-stdin
sudo ss -ltnp '( sport = :3000 )'
```

The former WEB 2 IP entry must also redirect to the fixed canonical HTTPS domain;
a 200 from its old application proxy is a failed cutover. The IP itself does not
need a certificate, since browsers are redirected to the named HTTPS origin.

Inspect home HTTPS headers for CSP, nosniff, DENY framing, strict-origin referrer
policy and disabled camera/microphone/geolocation. No X-Powered-By or Nginx
version should be exposed. HSTS should be absent while HSTS_MAX_AGE=0. Nginx
redirect/error/denial responses are not Express pages; they do not duplicate
application headers. A code-only security smoke accepts HSTS being deferred;
`--require-hsts` explicitly tests it after activation.

Sensitive-file tests discard the body. Any 200, unexpected redirect, or other
status is a blocker. Never display discovered contents; restrict that route
immediately, validate Nginx, reload only on success, and retest privately.

```bash
for route in /.env /data.json /.git/config /backups/ /logs/ /package-lock.json /var/web2.sqlite /img/private.key; do
  code="$(curl -sS --max-time 10 --output /dev/null --write-out '%{http_code}' "https://$DOMAIN$route")"
  printf '%s %s\n' "$route" "$code"
  case "$code" in 403|404) ;; *) printf '%s\n' 'STOP: sensitive route exposure or unexpected response'; exit 1 ;; esac
done
```

From a **separate external Linux machine**, not the VPS, confirm direct TCP
reachability as well as HTTP/TLS. These nc commands require netcat on that
external machine. Repeat for the actual public IPv6 with `nc -6` if present:

```bash
set -euo pipefail
nc -4 -vz -w 5 "$VPS_PUBLIC_IP" 80
nc -4 -vz -w 5 "$VPS_PUBLIC_IP" 443
if nc -4 -vz -w 5 "$VPS_PUBLIC_IP" 3000; then
  printf '%s\n' 'STOP: Node port is reachable externally'; exit 1
fi
curl -fsSI --max-time 10 "https://$DOMAIN/"
curl -fsS --max-time 10 "https://$DOMAIN/health"
```

Expect 80/443 reachable and 3000 refused/filtered, while new SSH connections
still succeed. A failed 3000 check alone is not evidence if the whole server
or test network is unreachable. Check all published IPv4/IPv6 addresses.

Use dedicated test accounts in a browser on the real HTTPS origin. Complete real
Turnstile; do not enable mock CAPTCHA/SMS. Verify registration, login, session
after refresh, products, cart, checkout's invalid/empty request validation,
profile and logout. Verify admin login/session, CSRF protection, customer denial
on admin APIs, authorized admin access and logout. Inspect **attributes only**
for Secure/HttpOnly/SameSite=Strict/__Host-/Path=/, no Domain. No HTTP or mixed
content may appear in the browser network/console. Never weaken admin/CSRF
checks. Do not send real OTPs, consume stock, place paid orders, change roles or
delete production accounts merely for a smoke test. Use isolated security tests
for adversarial CSRF, IDOR, concurrency and rate-limit floods.

Review access/error logs and PM2 errors privately, without pasting raw requests,
queries, tokens, cookies or environment values. The provided web2_safe access
format omits query strings, credentials and bodies. Error logs can contain
request details; keep warn level and do not enable debug:

```bash
sudo less /var/log/nginx/web2-access.log
sudo less /var/log/nginx/web2-error.log
```

After TLS, redirects, cookies, flows and renewal dry-run are stable, **optionally**
enable the initial conservative HSTS policy. Keep a private copy before editing;
change HSTS_MAX_AGE only, validate, and update the existing process:

```bash
sudo cp -p -- "$ENV_FILE" "$BACKUP/app.pre-hsts.env"
sudo chmod 0600 "$BACKUP/app.pre-hsts.env"
editor "$ENV_FILE"
# Set HSTS_MAX_AGE=300, preserving all other values.
node scripts/https-preflight.cjs --env-file "$ENV_FILE" --domain "$DOMAIN"
export HSTS_MAX_AGE=300
pm2 restart web2 --update-env
pm2 status
pm2 jlist | node scripts/https-preflight.cjs --env-file "$ENV_FILE" --domain "$DOMAIN" --pm2-stdin
node scripts/production-smoke.cjs --base "https://$DOMAIN" --require-hsts
pm2 save
```

Require exactly `Strict-Transport-Security: max-age=300` initially. Increase only
after an observation period; do not add includeSubDomains or preload. Existing
cached HSTS lasts until its max-age expires, so retain valid HTTPS during rollback.

No reboot is performed. After an eventual planned VPS reboot, verify existing
boot integration and public service again; do not create duplicate PM2 units:

```bash
pm2 status
systemctl status "pm2-$(id -un)" --no-pager
systemctl status nginx --no-pager
systemctl status certbot.timer --no-pager
systemctl list-timers --all certbot.timer
sudo ufw status verbose
sudo ss -ltnp '( sport = :3000 )'
curl -fsSI --max-time 10 "https://$DOMAIN/"
curl -fsS --max-time 10 "https://$DOMAIN/health"
```

## H. Rollback

Use the same trusted PM2 owner and the actual timestamped backup. First stop
further deployment changes and keep SSH sessions open. The complete saved Nginx
tree restores prior site files, includes and enabled symlinks; this also removes
new active site/includes by moving the failed tree aside. Coordinate against
concurrent edits to other sites. No recursive deletion or certificate removal
is needed. These fixed /etc/nginx paths refer to the verified Ubuntu layout.

```bash
read -r -p 'Existing phase22 backup path /root/web2-phase22-TIMESTAMP: ' BACKUP
[[ "$BACKUP" =~ ^/root/web2-phase22-[0-9]{8}T[0-9]{6}Z$ ]]
sudo test -d "$BACKUP/nginx"
sudo test -f "$BACKUP/app.env"
ROLLBACK_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESTORE_TREE="/etc/nginx.phase22-restore-$ROLLBACK_STAMP"
FAILED_TREE="/etc/nginx.phase22-failed-$ROLLBACK_STAMP"
sudo test ! -e "$RESTORE_TREE"
sudo test ! -e "$FAILED_TREE"
sudo cp -a -- "$BACKUP/nginx" "$RESTORE_TREE"
sudo mv -- /etc/nginx "$FAILED_TREE"
sudo mv -- "$RESTORE_TREE" /etc/nginx
sudo nginx -t && sudo systemctl reload nginx
```

If validation fails, do not reload/restart. The running Nginx workers retain
their previously loaded configuration; inspect privately and correct the restore.
Leave `/etc/letsencrypt` and valid certificates intact. This rollback never
returns Node to a public binding or changes SSH rules/policy. UFW remains enabled
with its verified SSH allowance; do not blindly restore/flush firewall state.

Restore the prior private environment if it was changed. Reconfirm APP_DIR and
ENV_FILE from B when using a fresh shell; do not infer them from an untrusted path.
The rollback baseline must have production mode, localhost Node and known
transport settings as required in B. Read only non-secret transport fields into
shell variables; never source or print the full env:

```bash
cd "$APP_DIR"
sudo cp --preserve=mode,ownership,timestamps -- "$BACKUP/app.env" "$ENV_FILE"
APP_ORIGIN="$(node -e 'const fs=require("node:fs"),{parseEnv}=require("node:util");process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8")).APP_ORIGIN||"");' "$ENV_FILE")"
ALLOWED_ORIGINS="$(node -e 'const fs=require("node:fs"),{parseEnv}=require("node:util");process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8")).ALLOWED_ORIGINS||"");' "$ENV_FILE")"
HSTS_MAX_AGE="$(node -e 'const fs=require("node:fs"),{parseEnv}=require("node:util");process.stdout.write(parseEnv(fs.readFileSync(process.argv[1],"utf8")).HSTS_MAX_AGE||"0");' "$ENV_FILE")"
export NODE_ENV=production HOST=127.0.0.1 PORT=3000 TRUST_PROXY=loopback
export APP_ORIGIN ALLOWED_ORIGINS HSTS_MAX_AGE
pm2 restart web2 --update-env
pm2 status
curl -fsS --max-time 5 http://127.0.0.1:3000/health
curl -fsS --max-time 5 http://127.0.0.1:3000/ready
node scripts/production-smoke.cjs --base "$APP_ORIGIN"
pm2 save
```

Run the previous origin's public checks again before saving if any step is
uncertain. This is a transport/environment rollback, not a database restore.
For code rollback, use Phase 21's verified compatible previous release procedure;
do not alter PM2 cwd, SQLite schema, live WAL files, storage paths or data here.
Keep root-private configuration/env recovery material until the deployment is
accepted, then retain/remove it through the host's restricted recovery policy.

## Remaining blockers and local validation

- No real domain or current VPS identity/access was supplied for this phase.
- DNS A/AAAA/CAA, ACME reachability, Ubuntu packages, active Nginx, `nginx -t`,
  certificate lineage/issuance/renewal, UFW/SSH and reboot persistence need VPS
  and independent external verification. This Windows workspace has no Nginx
  executable; the Nginx examples have not passed a live `nginx -t` here.
- Local production configuration and provider readiness must pass the existing
  release gate. The unchanged local `.env` fails production transport/provider
  requirements and the administrator password policy; payments remain
  unimplemented. No fail-open workaround was added.
- Live HTTPS cookies, admin/customer flows, logs and external port isolation
  remain untested. Successful isolated tests do not establish live readiness.

Local validation results are recorded in `docs/continuation.md` after testing.
