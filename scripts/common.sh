#!/usr/bin/env bash
# Gemeinsame Helfer fuer alle lokalen Dev-Skripte (kein Docker involviert).
set -euo pipefail

# Codespace-Quirk: LD_LIBRARY_PATH kann auf eine kaputte libstdc++ einer VSCode-Extension
# zeigen – solche Eintraege entfernen, sonst laufen mariadbd/php/composer/apt nicht.
if [ -n "${LD_LIBRARY_PATH:-}" ]; then
  _cleaned_ldlp="$(printf '%s' "$LD_LIBRARY_PATH" | tr ':' '\n' | grep -v 'vscode-remote' | paste -sd: - || true)"
  if [ -n "$_cleaned_ldlp" ]; then export LD_LIBRARY_PATH="$_cleaned_ldlp"; else unset LD_LIBRARY_PATH; fi
  unset _cleaned_ldlp
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DIR="$ROOT/.local"
LOG_DIR="$LOCAL_DIR/logs"
mkdir -p "$LOG_DIR"

# Projekt-.env laden (falls vorhanden)
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

# Toolchain-Pfade, die scripts/setup-local.sh ermittelt und in .local/toolchain.env ablegt
if [ -f "$LOCAL_DIR/toolchain.env" ]; then
  # shellcheck disable=SC1091
  . "$LOCAL_DIR/toolchain.env"
fi

export PATH="$PATH:/usr/sbin:/sbin"

# --- Defaults (per .env ueberschreibbar) -------------------------------------
MAGENTO_VERSION="${MAGENTO_VERSION:-2.4.7-p10}"
MAGENTO_DIR="${MAGENTO_DIR:-$ROOT/magento2}"
MAGENTO_PORT="${MAGENTO_PORT:-8080}"
MAGENTO_BASE_URL="${MAGENTO_BASE_URL:-http://localhost:${MAGENTO_PORT}}"
MAGENTO_PUBLIC_URL="${MAGENTO_PUBLIC_URL:-$MAGENTO_BASE_URL}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-magento}"
DB_USER="${DB_USER:-magento}"
DB_PASSWORD="${DB_PASSWORD:-magento}"
DB_SOCKET="$LOCAL_DIR/mysql.sock"
DB_PID="$LOCAL_DIR/mariadb.pid"
DB_DATA="$LOCAL_DIR/mysql/data"

ES_VERSION="${ES_VERSION:-7.17.23}"
ES_HOST="${ES_HOST:-127.0.0.1}"
ES_PORT="${ES_PORT:-9200}"
ES_HOME="$LOCAL_DIR/elasticsearch-${ES_VERSION}"
ES_PID="$LOCAL_DIR/elasticsearch.pid"
ES_DATA="$LOCAL_DIR/es-data"

AGENT_PORT="${AGENT_PORT:-8000}"
WIDGET_PORT="${WIDGET_PORT:-5173}"
AGENT_DIR="$ROOT/agent"
FRONTEND_DIR="$ROOT/frontend"

MAGENTO_PID="$LOCAL_DIR/magento.pid"
CRON_PID="$LOCAL_DIR/magento-cron.pid"
AGENT_PID="$LOCAL_DIR/agent.pid"

INSTALL_SAMPLE_DATA="${INSTALL_SAMPLE_DATA:-1}"

PHP_BIN="${PHP_BIN:-php}"
COMPOSER_BIN="${COMPOSER_BIN:-composer}"
MARIADBD_BIN="${MARIADBD_BIN:-$(command -v mariadbd 2>/dev/null || echo /usr/sbin/mariadbd)}"
MARIADB_INSTALL_DB_BIN="${MARIADB_INSTALL_DB_BIN:-$(command -v mariadb-install-db 2>/dev/null || command -v mysql_install_db 2>/dev/null || echo /usr/bin/mariadb-install-db)}"
MARIADB_BIN="${MARIADB_BIN:-mariadb}"
MARIADB_ADMIN_BIN="${MARIADB_ADMIN_BIN:-mariadb-admin}"

# --- Helfer -------------------------------------------------------------------
log()  { printf '[....] %s\n' "$*"; }
ok()   { printf '[ok]   %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*" >&2; }
die()  { printf '[error] %s\n' "$*" >&2; exit 1; }

pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

wait_for() { # wait_for <sekunden> <kommando...>
  local timeout="$1"; shift
  local i
  for i in $(seq 1 "$timeout"); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
