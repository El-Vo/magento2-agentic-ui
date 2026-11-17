#!/usr/bin/env bash
# MariaDB lokal verwalten: projekt-lokales Datenverzeichnis unter .local/mysql,
# eigener Socket/Pid, laeuft als aktueller Benutzer (kein Systemdienst, kein Docker).
#
# Aufruf: db.sh up|down|status|fg   (fg = Vordergrund, fuer Prozessmanager)
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

init_db() {
  if [ ! -d "$DB_DATA/mysql" ]; then
    log "Initialisiere MariaDB-Datenverzeichnis in $DB_DATA"
    mkdir -p "$DB_DATA"
    "$MARIADB_INSTALL_DB_BIN" \
      --datadir="$DB_DATA" \
      --auth-root-authentication-method=normal \
      --skip-test-db >/dev/null
  fi
}

mariadbd_args() {
  printf '%s\n' \
    --datadir="$DB_DATA" \
    --socket="$DB_SOCKET" \
    --pid-file="$DB_PID" \
    --log-error="$LOG_DIR/mariadb.log" \
    --bind-address="$DB_HOST" \
    --port="$DB_PORT" \
    --skip-name-resolve
}

create_app_db() {
  "$MARIADB_BIN" --socket="$DB_SOCKET" -u root <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
}

cmd_up() {
  if "$MARIADB_ADMIN_BIN" --socket="$DB_SOCKET" -u root ping >/dev/null 2>&1; then
    ok "MariaDB laeuft bereits auf $DB_HOST:$DB_PORT"
  else
    init_db
    mapfile -t args < <(mariadbd_args)
    nohup "$MARIADBD_BIN" "${args[@]}" >/dev/null 2>&1 &
    echo $! > "$DB_PID"
    wait_for 60 "$MARIADB_ADMIN_BIN" --socket="$DB_SOCKET" -u root ping \
      || die "MariaDB startet nicht – siehe $LOG_DIR/mariadb.log"
    ok "MariaDB laeuft auf $DB_HOST:$DB_PORT (Socket: $DB_SOCKET)"
  fi
  create_app_db
  ok "Datenbank '$DB_NAME' und Benutzer '$DB_USER' bereit"
}

cmd_down() {
  if "$MARIADB_ADMIN_BIN" --socket="$DB_SOCKET" -u root ping >/dev/null 2>&1; then
    log "Stoppe MariaDB"
    "$MARIADB_ADMIN_BIN" --socket="$DB_SOCKET" -u root shutdown || true
    wait_for 30 test ! -S "$DB_SOCKET" || true
  fi
  rm -f "$DB_PID" "$DB_SOCKET"
  ok "MariaDB gestoppt"
}

cmd_status() {
  if "$MARIADB_ADMIN_BIN" --socket="$DB_SOCKET" -u root ping >/dev/null 2>&1; then
    ok "MariaDB: laeuft ($DB_HOST:$DB_PORT, Socket $DB_SOCKET)"
  else
    warn "MariaDB: gestoppt"
    return 1
  fi
}

cmd_fg() {
  init_db
  mapfile -t args < <(mariadbd_args)
  exec "$MARIADBD_BIN" "${args[@]}"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  fg) cmd_fg ;;
  *) echo "Aufruf: $0 up|down|status|fg" >&2; exit 2 ;;
esac
