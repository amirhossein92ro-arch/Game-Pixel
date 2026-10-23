# WEB 2 Ubuntu rollout

Use [Phase 21 production deployment](phase21-production.md) for the current exact
procedure. It supersedes the historical target/update commands below. The real
production gate is NOT READY; do not bypass payment/configuration failures.

This repository is currently observed at `109.122.247.237`. Before applying
anything, confirm the server IP and identify the active application directory.
The live service must stay available while changes are made.

## Read-only audit on the VPS

Run through an existing SSH session. Do not print `.env`, PM2 environment
variables, cookies, request bodies, or raw access logs in a shared terminal.

```sh
lsb_release -ds
sudo nginx -v
sudo nginx -t
sudo ss -lntp
sudo ufw status numbered
sudo sshd -T | grep -Ei '^(port|passwordauthentication|permitrootlogin|pubkeyauthentication|permitemptypasswords) '
pm2 status
systemctl is-enabled "pm2-$(id -un)" || true
stat -c '%a %U:%G %n' . .env var var/logs 2>/dev/null
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

Read the active Nginx site and PM2 `cwd` without printing secrets. Confirm
the SSH port and a working alternate SSH session before changing UFW or sshd.
Keep that session open through the rollout.

## Staged proxy change

1. Back up the active Nginx site and PM2 configuration outside the web root.
   Preserve the current `.env` and SQLite database. Check that the deployed
   code passes `npm run check` and `npm test` before restarting PM2.
2. Put `nginx-rate-limits.conf.example` in `/etc/nginx/conf.d/web2-rate-limits.conf`
   and `nginx-upstream.conf.example` in `/etc/nginx/conf.d/web2-upstream.conf`, then `nginx-proxy.conf.example` in `/etc/nginx/snippets/web2-proxy.conf`.
   Put `nginx-compression.conf.example` in `/etc/nginx/conf.d/web2-compression.conf`
   to compress HTML, CSS, JavaScript, JSON, and SVG responses.
   For a bare IP, use `nginx-http-ip.conf.example`; for an established domain
   and valid certificate, use `nginx.conf.example`. Replace placeholders.
3. Check `HOST=127.0.0.1`, `PORT=3000`, `NODE_ENV=production`, and an
   `APP_ORIGIN` matching the real browser origin. `TRUST_PROXY=loopback`
   trusts only the local Nginx hop. Never set `TRUST_PROXY=true` or use a
   wildcard. Keep `.env` owner-readable only (`chmod 600 .env`).
4. Run `sudo nginx -t`. Reload only after it passes. Verify the public Nginx
   path and `curl http://127.0.0.1:3000/` locally before closing public port
   3000. Use `pm2 restart deploy/ecosystem.config.cjs --env production`
   from the app directory, then `pm2 status` and `pm2 save`.
5. Verify the current SSH rule with `sudo ufw status numbered` and the actual
   `sshd -T` port before firewall changes. Retain that SSH port plus 80/tcp
   and, when HTTPS is ready, 443/tcp. Remove public 3000/tcp only after the
   reverse proxy is working. Recheck access from a separate SSH session.
6. Check `pm2 startup` output for the dedicated app user and ensure its
   systemd unit is enabled. Review Nginx and PM2 log rotation. The sample
   `logrotate.conf.example` rotates application logs without query strings.

## HTTPS and verification

Do not use the HTTPS template or HSTS before DNS points to this VPS and a
trusted certificate is installed. Certbot must pass issuance, `nginx -t`,
`certbot renew --dry-run`, and browser certificate checks before enabling the
HTTP redirect. The app requires an HTTPS `APP_ORIGIN` in production; if there
is no domain yet, keep the existing HTTP service running until a compatible
transition is designed and tested. Do not silently switch it to development
mode or disable secure-cookie checks.

After each reload/restart, check the homepage, API, static assets, login,
registration, profile, admin login/panel, and cart/checkout. Confirm security
headers, no-store on private pages, Secure/HttpOnly/SameSite cookies under
HTTPS, and 404/403 for `.env`, `server.js`, and backup paths. From outside
the VPS, port 3000 must fail; from inside, `127.0.0.1:3000` must succeed.
Check Nginx access/error logs and PM2 status for errors without copying
secrets into a report.
