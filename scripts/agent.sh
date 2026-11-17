#!/usr/bin/env bash
# Agent (FastAPI) lokal verwalten – kein Docker: eigenes venv unter .local/venv,
# uvicorn auf 127.0.0.1:8000. Umgebungsvariablen kommen aus der Projekt-.env.
#
# Aufruf: agent.sh up|down|status|dev|test
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

VENV="$LOCAL_DIR/venv"
PY="$VENV/bin/python"

ensure_venv() {
  if [ ! -x "$PY" ]; then
    log "Erzeuge venv in $VENV und installiere agent[dev]"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q --upgrade pip
    "$VENV/bin/pip" install -q -e "$AGENT_DIR[dev]"
  fi
}

agent_ok() { curl -sf "http://127.0.0.1:$AGENT_PORT/health" >/dev/null 2>&1; }

cmd_up() {
  if agent_ok; then
    ok "Agent laeuft bereits auf http://127.0.0.1:$AGENT_PORT"
    return 0
  fi
  ensure_venv
  log "Starte Agent (uvicorn auf 127.0.0.1:$AGENT_PORT, MAGENTO_BASE_URL=$MAGENTO_BASE_URL)"
  cd "$AGENT_DIR"
  nohup "$VENV/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$AGENT_PORT" \
    >"$LOG_DIR/agent.log" 2>&1 < /dev/null &
  echo $! > "$AGENT_PID"
  wait_for 60 curl -sf "http://127.0.0.1:$AGENT_PORT/health" \
    || die "Agent startet nicht – siehe $LOG_DIR/agent.log"
  ok "Agent laeuft auf http://127.0.0.1:$AGENT_PORT/health"
}

cmd_down() {
  if pid_alive "$AGENT_PID"; then
    log "Stoppe Agent (pid $(cat "$AGENT_PID"))"
    kill "$(cat "$AGENT_PID")" 2>/dev/null || true
    wait_for 30 sh -c "! kill -0 $(cat "$AGENT_PID") 2>/dev/null" || true
  fi
  rm -f "$AGENT_PID"
  ok "Agent gestoppt"
}

cmd_status() {
  if agent_ok; then
    ok "Agent: laeuft (http://127.0.0.1:$AGENT_PORT/health)"
  else
    warn "Agent: gestoppt"
    return 1
  fi
}

cmd_dev() {
  ensure_venv
  cd "$AGENT_DIR"
  exec "$VENV/bin/uvicorn" app.main:app --reload --host 127.0.0.1 --port "$AGENT_PORT"
}

cmd_test() {
  ensure_venv
  cd "$AGENT_DIR"
  exec "$PY" -m pytest -q
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  dev) cmd_dev ;;
  test) cmd_test ;;
  *) echo "Aufruf: $0 up|down|status|dev|test" >&2; exit 2 ;;
esac
