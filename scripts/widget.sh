#!/usr/bin/env bash
# Chat-Widget (Vite Dev-Server) im Hintergrund verwalten – kein Docker.
# Lauft auf 127.0.0.1:$WIDGET_PORT (0.0.0.0 via vite --host, damit forwarded Ports greifen),
# pid unter .local/widget.pid, Log unter .local/logs/widget.log.
#
# Aufruf: widget.sh up|down|status
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

WIDGET_PID_FILE="$LOCAL_DIR/widget.pid"
VITE_BIN="$FRONTEND_DIR/node_modules/.bin/vite"

widget_ok() { curl -sf "http://127.0.0.1:$WIDGET_PORT/" >/dev/null 2>&1; }

cmd_up() {
  if widget_ok; then
    ok "Widget laeuft bereits auf http://localhost:$WIDGET_PORT"
    return 0
  fi
  [ -d "$FRONTEND_DIR/node_modules" ] || { log "npm install im frontend"; (cd "$FRONTEND_DIR" && npm install --no-audit --no-fund); }
  [ -x "$VITE_BIN" ] || die "Vite nicht gefunden ($VITE_BIN) – bitte 'cd frontend && npm install' ausfuehren"
  log "Starte Vite Dev-Server auf Port $WIDGET_PORT (Proxy /api -> Agent auf :$AGENT_PORT)"
  cd "$FRONTEND_DIR"
  nohup "$VITE_BIN" --host --port "$WIDGET_PORT" --strictPort \
    >"$LOG_DIR/widget.log" 2>&1 < /dev/null &
  echo $! > "$WIDGET_PID_FILE"
  wait_for 60 curl -sf "http://127.0.0.1:$WIDGET_PORT/" \
    || die "Widget startet nicht – siehe $LOG_DIR/widget.log"
  ok "Widget laeuft auf http://localhost:$WIDGET_PORT"
}

cmd_down() {
  if [ -f "$WIDGET_PID_FILE" ] && pid_alive "$WIDGET_PID_FILE"; then
    log "Stoppe Widget (pid $(cat "$WIDGET_PID_FILE"))"
    kill "$(cat "$WIDGET_PID_FILE")" 2>/dev/null || true
    wait_for 30 sh -c "! kill -0 $(cat "$WIDGET_PID_FILE") 2>/dev/null" || true
  fi
  rm -f "$WIDGET_PID_FILE"
  ok "Widget gestoppt"
}

cmd_status() {
  if widget_ok; then
    ok "Widget: laeuft (http://localhost:$WIDGET_PORT)"
  else
    warn "Widget: gestoppt"
    return 1
  fi
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  *) echo "Aufruf: $0 up|down|status" >&2; exit 2 ;;
esac
