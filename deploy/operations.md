# WEB 2 operations

## Recovery set

Preserve the active `DATABASE_PATH` SQLite database: it holds accounts, orders,
products, discounts, settings, tickets, sessions, audit records, and payment
references. `data.json` is the initial seed and ships with the code. Preserve
the deployed code/assets and the private `.env` separately. Never put `.env` in
the ordinary database backup folder. Store a separate restricted copy of it
through the host's secret backup process.

## Daily backup

For a pre-deploy snapshot preserving every existing backup, use
`node scripts/backup.cjs --no-retention`. Scheduled backups retain their existing
policy. See [Phase 21 deployment](phase21-production.md) for staged code updates.

`npm run backup` uses SQLite `VACUUM INTO`, so it captures a consistent snapshot
even while the app uses WAL. It verifies `PRAGMA integrity_check` and key tables
before reporting success. Backups go to `BACKUP_DIR` or `/var/backups/web2`
(Windows development default: `~/web2-backups`), with a randomized timestamped
name and owner-only permissions. The script refuses a directory inside the
application tree, checks free space before writing, verifies a staged snapshot,
then renames it into place. `BACKUP_MIN_FREE_MB` defaults to 512 and
`BACKUP_MAX_SIZE_MB` to 2048. Growth above three times the previous snapshot
emits a warning. Run as the application user. The script never copies logs,
caches, `node_modules`, or `.env`. SQLite session rows are inside the database
snapshot; protect the whole file as sensitive data.

Default retention keeps each day for 7 days and one backup per week for 4
weeks, with at least two snapshots. Set `BACKUP_DAILY_DAYS` and
`BACKUP_WEEKLY_WEEKS` to change this. Only files with this script's naming
format are eligible for pruning, and pruning starts after a verified new copy.
Copy verified snapshots to a separately secured offsite location; local disk
copies alone do not cover host failure.

On Ubuntu, verify the actual project path and service user. Create `var/logs`
and `/var/backups/web2` as that user with mode `0700`, then install
`web2-backup.service.example` and `web2-backup.timer.example` as systemd units
without the `.example` suffix. Check `systemctl list-timers web2-backup.timer`,
run the service once, and inspect its exit status. Do not enable the timer until
the first verified backup succeeds. Use the existing
`logrotate.conf.example` for app logs after replacing its sample path/user.
Ubuntu's Nginx logrotate configuration should also be verified on the VPS.
Do not use `pm2-logrotate` as well as this logrotate rule for the same files.

Example deployment after confirming that `/srv/web2`, `web2`, and the Node path
match the VPS:

```sh
sudo install -d -o web2 -g web2 -m 0700 /var/backups/web2 /srv/web2/var/logs
sudo install -m 0644 /srv/web2/deploy/web2-backup.service.example /etc/systemd/system/web2-backup.service
sudo install -m 0644 /srv/web2/deploy/web2-backup.timer.example /etc/systemd/system/web2-backup.timer
sudo install -m 0644 /srv/web2/deploy/logrotate.conf.example /etc/logrotate.d/web2
sudo systemctl daemon-reload
sudo systemctl start web2-backup.service
sudo systemctl status web2-backup.service --no-pager
sudo journalctl -u web2-backup.service -n 30 --no-pager
sudo systemctl enable --now web2-backup.timer
sudo systemctl list-timers web2-backup.timer
```

Before enabling the timer, verify its first output names an actual snapshot and
run `sudo -u web2 node /srv/web2/scripts/backup.cjs` only if another snapshot is
needed. Keep an offsite encrypted copy and separately preserve `.env` and the
`ACCOUNT_TOTP_KEY` through a restricted secret backup process.

## Restore

1. Choose a verified snapshot and confirm free space for two extra database
   copies. Tell operators to stop writes, then stop the PM2 app.
2. Run `npm run restore -- --backup /absolute/backup.sqlite --target
   /absolute/active.sqlite --offline-confirmed` as the app user. The script
   checks both databases, checkpoints the current WAL, creates and verifies a
   safety snapshot, stages the selected backup, and retains the previous
   database beside the target. It refuses to run without the offline flag.
3. Restart PM2. Confirm `/ready`, `/health`, `/`, `/api/products`, and the admin
   login page, then check PM2 status and recent error counts. Keep the safety
   copy until business data is checked. If restore validation fails, keep PM2
   stopped and restore from the safety copy.

Never run the restore command against a live writer. Test restores in a
disposable directory first; `tests/operations.test.cjs` does this automatically.
On the VPS, after confirming the active `DATABASE_PATH` and choosing a snapshot:

```sh
sudo -u web2 ls -lt /var/backups/web2/web2-*.sqlite | head
sudo -u web2 node -e "require('/srv/web2/scripts/backup.cjs').verify(process.argv[1])" /var/backups/web2/SELECTED.sqlite
sudo -u web2 pm2 stop web2
sudo -u web2 node /srv/web2/scripts/restore.cjs --backup /var/backups/web2/SELECTED.sqlite --target /srv/web2/var/web2.sqlite --offline-confirmed
sudo -u web2 pm2 start web2
curl -fsS http://127.0.0.1:3000/ready
curl -fsS https://YOUR_HOST/health
sudo -u web2 pm2 status
sudo -u web2 pm2 logs web2 --lines 50 --nostream
```

Replace `SELECTED.sqlite` and `YOUR_HOST`; use the actual database path and PM2
owner. The restore script leaves both a verified safety snapshot and the old
database next to the target. Inspect orders and accounts before removing either.

## Monitoring and capacity

`npm run monitor` checks local `/ready`, the database file, PM2 status when
installed, disk free space, and top-level backup/app log sizes. It exits nonzero
for failed readiness, missing storage, critical disk usage, under 512 MiB free,
or stopped/errored/duplicate PM2 processes. `node scripts/disk-check.cjs
/var/backups/web2` warns at 80% and fails at 90%; override with
`DISK_WARN_PERCENT` and `DISK_CRITICAL_PERCENT`. The optional absolute
`NGINX_HEALTH_URL` (for example the site's HTTPS `/health` URL) also tests the
public proxy; plain HTTP is accepted only on loopback. The optional absolute
`OPS_ALERT_HOOK` executable receives one fixed argument: `backup-failure`,
`health-failure`, `disk-critical`, or `repeated-crash`. It receives no secrets or
request data. Schedule the monitor externally and alert on its nonzero exit.

Run `pm2 status`, `pm2 logs web2 --lines 100`, `free -h`, `df -h`, `uptime`,
and `du -sh /var/backups/web2 /srv/web2/var/logs` during incidents. Check
`pm2 jlist` for restart count. Investigate repeated restarts before raising
restart limits. Use `pm2 start /srv/web2/deploy/ecosystem.config.cjs --env
production` only when no `web2` process exists; otherwise use `pm2 restart web2
--update-env`. Run `pm2 save` after verifying the single healthy process.

The app closes its HTTP listener and SQLite connection on SIGTERM/SIGINT. PM2
allows 12 seconds for graceful shutdown and applies restart backoff. Verify
`pm2 startup`, `pm2 save`, and the reboot unit on the VPS; repository files
alone cannot establish reboot startup.

## Phase 17 performance deployment

Keep one PM2 fork/instance and the current memory restart limit; investigate any rising heap/RSS instead of increasing the threshold. Generate asset versions with `npm run build:assets`, deploy JS/CSS and HTML together, then restart the application so templates and fingerprints match.

The updated proxy snippet requires `nginx-upstream.conf.example` in the HTTP context. The optional `nginx-static-cache.conf.example` also belongs in the HTTP context; create its cache directory with Nginx-worker ownership. Install `nginx-static-locations.conf.example` as the HTTPS-server include shown in `nginx.conf.example`. Preserve all existing origin, forwarding, rate-limit and private-path rules. Run `nginx -t` before reload; verify gzip, matching-fingerprint immutable assets, conditional 304s, and no-store on authenticated API/admin responses. Never enable a repository-root static alias or public API/HTML proxy cache.

The measured local baseline, results, safe benchmark commands and remaining scaling limits are in `docs/phase17-performance.md`. VPS staging verification is still required; these local tests did not inspect or reload the production proxy.
