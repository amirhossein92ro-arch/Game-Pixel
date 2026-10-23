#!/usr/bin/env bash
# Linux VPS entry point. Windows/local development uses node scripts/monitor.cjs.
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$#" -ne 0 ]]; then
    printf '%s\n' 'WEB 2 health-check requires Linux and no arguments.' >&2
    exit 2
fi
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null || { printf '%s\n' 'Node is unavailable.' >&2; exit 2; }
export MONITOR_PM2_REQUIRED="${MONITOR_PM2_REQUIRED:-1}"
export MONITOR_NGINX_SERVICE="${MONITOR_NGINX_SERVICE:-1}"
export MONITOR_BACKUP_REQUIRED="${MONITOR_BACKUP_REQUIRED:-1}"
export MONITOR_RUNTIME_REQUIRED="${MONITOR_RUNTIME_REQUIRED:-1}"
exec node "$task_root/scripts/monitor.cjs"
