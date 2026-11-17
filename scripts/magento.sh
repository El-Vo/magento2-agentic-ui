#!/usr/bin/env bash
# Magento 2 lokal betreiben (kein Docker): php -S Built-in-Server mit Router auf
# 127.0.0.1:8080, dazu MariaDB + Elasticsearch als lokale Prozesse (db.sh/search.sh).
#
# Aufruf: magento.sh up|down|status|fg|install|seed|reindex
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

MAGENTO_BACKEND_FRONTNAME="${MAGENTO_BACKEND_FRONTNAME:-admin}"
MAGENTO_ADMIN_PASSWORD="${MAGENTO_ADMIN_PASSWORD:-admin123}"

is_installed() { [ -f "$MAGENTO_DIR/app/etc/env.php" ]; }

magento_cli() { (cd "$MAGENTO_DIR" && "$PHP_BIN" bin/magento "$@"); }

graphql_ok() {
  curl -sf -G "http://127.0.0.1:$MAGENTO_PORT/graphql" --data-urlencode "query={storeConfig{store_code}}" >/dev/null 2>&1
}

ensure_deps() {
  "$ROOT/scripts/db.sh" up
  "$ROOT/scripts/search.sh" up
}

cmd_install() {
  [ -x "$MAGENTO_DIR/bin/magento" ] || die "Magento nicht gefunden in $MAGENTO_DIR – bitte 'make setup' ausfuehren"
  if is_installed; then
    ok "Magento bereits installiert (app/etc/env.php vorhanden)"
  else
    ensure_deps
    local db_host="$DB_HOST"
    [ "$DB_PORT" != "3306" ] && db_host="$DB_HOST:$DB_PORT"
    log "Magento setup:install (DB $db_host/$DB_NAME, Suche $ES_HOST:$ES_PORT, Basis-URL $MAGENTO_BASE_URL)"
    (cd "$MAGENTO_DIR" && "$PHP_BIN" bin/magento setup:install \
      --base-url="$MAGENTO_BASE_URL" \
      --db-host="$db_host" --db-name="$DB_NAME" --db-user="$DB_USER" --db-password="$DB_PASSWORD" \
      --admin-firstname=Admin --admin-lastname=User --admin-email=admin@example.com \
      --admin-user=admin --admin-password="$MAGENTO_ADMIN_PASSWORD" \
      --backend-frontname="$MAGENTO_BACKEND_FRONTNAME" \
      --language=de_DE --currency=EUR --timezone=Europe/Berlin \
      --use-rewrites=1 --use-secure=0 --use-secure-admin=0 \
      --search-engine=elasticsearch7 --elasticsearch-host="$ES_HOST" --elasticsearch-port="$ES_PORT")
    magento_cli deploy:mode:set developer
    magento_cli cache:flush
  fi
  magento_cli indexer:reindex
  magento_cli cache:flush
  if [ "${INSTALL_SAMPLE_DATA:-1}" = "1" ]; then
    cmd_seed
  fi
  ok "Magento installiert, indiziert und Demo-Daten geseeded"
}

cmd_seed() {
  is_installed || die "erst 'magento.sh install' ausfuehren"
  log "Seede Demo-Daten (Kategorien, Produkte, CMS-Seite)"
  (cd "$MAGENTO_DIR" && "$PHP_BIN" "$ROOT/scripts/seed-demo-data.php")
  magento_cli indexer:reindex
  magento_cli cache:flush
}

start_cron() {
  if pid_alive "$CRON_PID"; then return 0; fi
  log "Starte Magento-Cron-Schleife (alle 60s, pid in $CRON_PID)"
  nohup bash -c "while true; do '$PHP_BIN' '$MAGENTO_DIR/bin/magento' cron:run >/dev/null 2>&1; sleep 60; done" \
    >/dev/null 2>&1 &
  echo $! > "$CRON_PID"
}

cmd_up() {
  if graphql_ok; then
    ok "Magento laeuft bereits auf $MAGENTO_BASE_URL"
  else
    cmd_install
    log "Starte php -S auf 127.0.0.1:$MAGENTO_PORT (Document-Root: $MAGENTO_DIR/pub)"
    PHP_CLI_SERVER_WORKERS=4 nohup "$PHP_BIN" -S "127.0.0.1:$MAGENTO_PORT" \
      -t "$MAGENTO_DIR/pub" "$ROOT/scripts/php-router.php" >"$LOG_DIR/magento.log" 2>&1 &
    echo $! > "$MAGENTO_PID"
    wait_for 120 curl -sf -G "http://127.0.0.1:$MAGENTO_PORT/graphql" --data-urlencode "query={storeConfig{store_code}}" \
      || die "Magento startet nicht – siehe $LOG_DIR/magento.log"
    ok "Magento laeuft auf $MAGENTO_BASE_URL (Admin: $MAGENTO_BASE_URL/$MAGENTO_BACKEND_FRONTNAME, admin/$MAGENTO_ADMIN_PASSWORD)"
  fi
  start_cron
}

cmd_down() {
  if pid_alive "$MAGENTO_PID"; then
    log "Stoppe Magento (pid $(cat "$MAGENTO_PID"))"
    kill "$(cat "$MAGENTO_PID")" 2>/dev/null || true
    wait_for 30 sh -c "! kill -0 $(cat "$MAGENTO_PID") 2>/dev/null" || true
  fi
  rm -f "$MAGENTO_PID"
  if pid_alive "$CRON_PID"; then
    kill "$(cat "$CRON_PID")" 2>/dev/null || true
  fi
  rm -f "$CRON_PID"
  ok "Magento gestoppt"
}

cmd_status() {
  if graphql_ok; then
    ok "Magento: laeuft ($MAGENTO_BASE_URL/graphql)"
  else
    warn "Magento: gestoppt"
    return 1
  fi
}

cmd_fg() {
  cmd_install
  exec env PHP_CLI_SERVER_WORKERS=4 "$PHP_BIN" -S "127.0.0.1:$MAGENTO_PORT" -t "$MAGENTO_DIR/pub" "$ROOT/scripts/php-router.php"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  fg) cmd_fg ;;
  install) cmd_install ;;
  seed) cmd_seed ;;
  reindex) magento_cli indexer:reindex ;;
  *) echo "Aufruf: $0 up|down|status|fg|install|seed|reindex" >&2; exit 2 ;;
esac
