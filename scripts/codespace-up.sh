#!/usr/bin/env bash
# Idempotentes Hochfahren des kompletten Projekts – kein Docker:
#   .env anlegen (Mock-Modus ohne MISTRAL_API_KEY), Toolchain + Elasticsearch + Magento 2
#   installieren (falls noch nicht geschehen), dann alle Dienste starten:
#   MariaDB, Elasticsearch, Magento (php -S, installiert/seeded beim ersten Lauf),
#   Agent (uvicorn) und Chat-Widget (Vite).
#
# Wird vom Devcontainer-Lebenszyklus genutzt (postCreateCommand/postStartCommand,
# siehe devcontainer/devcontainer.json), laesst sich aber auch manuell aufrufen: make codespace
# Aufruf: codespace-up.sh
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

log "codespace-up: pruefe .env"
[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; ok ".env aus .env.example angelegt"; }
[ -f "$AGENT_DIR/.env" ] || { cp "$AGENT_DIR/.env.example" "$AGENT_DIR/.env"; ok "agent/.env aus agent/.env.example angelegt"; }

if [ ! -f "$LOCAL_DIR/toolchain.env" ] || [ ! -x "$ES_HOME/bin/elasticsearch" ] || [ ! -x "$MAGENTO_DIR/bin/magento" ]; then
  log "Toolchain unvollstaendig – komplettes Setup (apt, Elasticsearch, Magento 2, composer; dauert einige Minuten)"
  bash "$ROOT/scripts/setup-local.sh" --all
else
  ok "Toolchain bereits vorhanden (.local/toolchain.env, Elasticsearch, Magento)"
fi

[ -d "$FRONTEND_DIR/node_modules" ] || { log "npm install im frontend"; (cd "$FRONTEND_DIR" && npm install --no-audit --no-fund); }

log "Starte Dienste (jeweils idempotent)"
bash "$ROOT/scripts/db.sh" up
bash "$ROOT/scripts/search.sh" up
bash "$ROOT/scripts/magento.sh" up
bash "$ROOT/scripts/agent.sh" up
bash "$ROOT/scripts/widget.sh" up

echo ""
ok "Projekt ist bereit:"
echo "  Chat-Widget:  http://localhost:$WIDGET_PORT   (Port forwarded im Codespace)"
echo "  Agent-API:    http://localhost:$AGENT_PORT/health"
echo "  Magento-Shop: http://localhost:$MAGENTO_PORT   (Admin: http://localhost:$MAGENTO_PORT/${MAGENTO_BACKEND_FRONTNAME:-admin}, admin/${MAGENTO_ADMIN_PASSWORD:-admin123})"
echo "  Elasticsearch: http://localhost:$ES_PORT   MariaDB: $DB_HOST:$DB_PORT (Socket $DB_SOCKET)"
echo "  Status jederzeit: make ps   Stop: make demo-stop"
[ -z "${MISTRAL_API_KEY:-}" ] && warn "MISTRAL_API_KEY ist leer – der Agent laeuft im Mock-Modus (regelbasiert, ohne LLM-Kosten). Key in .env eintragen fuer echtes LLM."
