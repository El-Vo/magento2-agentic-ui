#!/usr/bin/env bash
# e2e-Tests mit Cypress gegen das gebaute Widget (vite preview auf :4173).
# Default: Agent-API wird in den Specs per cy.intercept gemockt (kein Magento noetig).
# Live-Modus gegen echten Agent + Magento: scripts/e2e.sh --live  (Agent auf :8000 muss laufen)
#
# Aufruf: e2e.sh [--live] [--browser <browser>]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

LIVE=0
BROWSER=""
for arg in "$@"; do
  case "$arg" in
    --live) LIVE=1 ;;
    --browser) BROWSER="electron" ;; # Platzhalter-Logik unten ueberschreibt
    *) ;;
  esac
done
# zweites Argument nach --browser
if [[ "${1:-}" == "--browser" ]]; then BROWSER="${2:-electron}"; fi
if [[ "${1:-}" == "--live" && "${2:-}" == "--browser" ]]; then BROWSER="${3:-electron}"; fi

cd "$FRONTEND_DIR"

if [ ! -d node_modules ]; then
  log "npm install im frontend"
  npm install
fi

log "Baue Widget (tsc + vite build)"
npm run build

log "Starte vite preview auf http://127.0.0.1:4173"
npx vite preview --host 127.0.0.1 --port 4173 --strictPort >"$LOG_DIR/e2e-preview.log" 2>&1 &
PREVIEW_PID=$!
trap 'kill $PREVIEW_PID 2>/dev/null || true' EXIT

wait_for 30 curl -sf http://127.0.0.1:4173/ >/dev/null || die "vite preview startet nicht – siehe $LOG_DIR/e2e-preview.log"

ENV_ARGS=()
if [ "$LIVE" = "1" ]; then
  ENV_ARGS+=(--env E2E_MOCK_API=false AGENT_URL=http://127.0.0.1:"${AGENT_PORT:-8000}")
  log "LIVE-Modus: E2E_MOCK_API=false (Agent auf http://127.0.0.1:${AGENT_PORT:-8000})"
else
  log "Mock-Modus: Agent-API wird per cy.intercept simuliert"
fi

BROWSER_ARGS=()
if [ -n "$BROWSER" ]; then BROWSER_ARGS+=(--browser "$BROWSER"); fi

log "Cypress run"
npx cypress run "${BROWSER_ARGS[@]}" "${ENV_ARGS[@]}"
ok "e2e-Suite bestanden"
