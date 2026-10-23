# External deployment audit — 2026-10-15

Target observed from the existing project context: `109.122.247.237`.
These checks were made from outside the VPS. They do not establish its
internal Nginx, PM2, UFW, or filesystem state.

| Check | Observed result |
| --- | --- |
| HTTP :80 | 200 through Nginx, `Server: nginx/1.28.3 (Ubuntu)` |
| HTTPS :443 | Connection failed |
| Node :3000 | Public HTTP 200; directly reachable |
| `/.env`, `/server.js`, `/.backup-final/admin.html` through :80 | 404 |
| `/api/products` through :80 | JSON 200, `Cache-Control: no-store` |
| `/profile.html` through :80 | 200, `Cache-Control: public, max-age=0` |
| `/admin.html` through :80 | Anonymous 200 |
| SSH | TCP reachable, but noninteractive key login for root, ubuntu, deploy denied |

The live HTML and CSP differ from the current repository. In particular, the
live `script-src` permits cdnjs and its `/admin.html` is public. A verified
deployment of the current app is required before claiming the phase-4 code
protections are live.

The following remain **unverified** until VPS access is available: exact
Ubuntu release, active Nginx configuration, Node bind address, PM2 process
and startup unit, `.env` values and permissions, UFW rules, SSH port/auth
method, certificate/DNS ownership, local `127.0.0.1:3000`, `nginx -t`, and
live authenticated browser flows. No live configuration was changed during
this external audit.
