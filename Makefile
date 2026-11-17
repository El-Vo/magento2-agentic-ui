.PHONY: help setup demo demo-stop ps codespace db search magento agent agent-dev agent-test widget widget-install widget-build e2e e2e-live cy-open clean purge

help: ## Uebersicht aller Targets
	@grep -hE '^[a-z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?##"} {printf "  %-16s %s\n", $$1, $$2}'

setup: ## Einmalig: Toolchain lokal installieren (PHP, Composer, MariaDB, Elasticsearch, Magento 2) – kein Docker
	bash scripts/setup-local.sh

demo: ## Alle Dienste lokal starten: MariaDB, Elasticsearch, Magento (php -S), Agent
	@[ -f .local/toolchain.env ] || $(MAKE) setup
	bash scripts/db.sh up
	bash scripts/search.sh up
	bash scripts/magento.sh up
	bash scripts/agent.sh up
	@echo ""
	@echo "Magento:  http://localhost:8080   (Admin: http://localhost:8080/admin, admin/admin123)"
	@echo "Agent:    http://localhost:8000/health"
	@echo "Widget:   make widget  ->  http://localhost:5173"

demo-stop: ## Alle lokalen Dienste stoppen
	-bash scripts/widget.sh down
	-bash scripts/agent.sh down
	-bash scripts/magento.sh down
	-bash scripts/search.sh down
	-bash scripts/db.sh down

ps: ## Status aller lokalen Dienste
	@bash scripts/db.sh status || true
	@bash scripts/search.sh status || true
	@bash scripts/magento.sh status || true
	@bash scripts/agent.sh status || true
	@bash scripts/widget.sh status || true

codespace: ## Idempotent: komplettes Setup (falls noetig) + alle Dienste inkl. Widget starten – Devcontainer postCreate/postStart
	bash scripts/codespace-up.sh

db: ## MariaDB lokal starten
	bash scripts/db.sh up

search: ## Elasticsearch lokal starten
	bash scripts/search.sh up

magento: ## Magento lokal starten (php -S, installiert/seeded falls noetig)
	bash scripts/magento.sh up

agent: ## Agent lokal starten (uvicorn aus .local/venv)
	bash scripts/agent.sh up

agent-dev: ## Agent im Vordergrund mit Autoreload
	bash scripts/agent.sh dev

agent-test: ## pytest (Tools gegen Fake-Gateway)
	bash scripts/agent.sh test

widget-install:
	cd frontend && npm install

widget: widget-install ## Chat-Widget Dev-Server im Vordergrund (proxied /api auf den Agent auf :8000)
	cd frontend && npm run dev

widget-up: ## Chat-Widget im Hintergrund starten (wie im Codespace)
	bash scripts/widget.sh up

widget-build:
	cd frontend && npm run build

e2e: ## Cypress-e2e-Suite gegen das gebaute Widget (Agent-API gemockt, kein Magento noetig)
	bash scripts/e2e.sh

e2e-live: ## Cypress-e2e im Live-Modus gegen Agent + Magento (make demo zuerst starten)
	bash scripts/e2e.sh --live

cy-open: ## Cypress interaktiv oeffnen
	cd frontend && npm run cy:open

clean: demo-stop

purge: demo-stop ## Zusaetzlich alle lokalen Installationen/Daten loeschen (.local/, magento2/)
	rm -rf .local magento2
