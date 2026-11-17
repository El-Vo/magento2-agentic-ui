.PHONY: demo demo-stop ps agent-dev agent-test widget widget-build widget-install clean

demo: ## Start Magento demo shop + agent + widget (docker compose up)
	docker compose up -d --build
	@echo "Magento:    http://localhost:8080  (Admin: http://localhost:8080/admin, admin/admin123)"
	@echo "Agent:      http://localhost:8000/health"
	@echo "Widget:     http://localhost:5173"

demo-stop:
	docker compose down

ps:
	docker compose ps

agent-dev: ## Run agent locally with autoreload
	cd agent && uvicorn app.main:app --reload --port 8000

agent-test: ## Run agent tests against fake GraphQL gateway
	cd agent && python -m pytest -q

widget-install:
	cd frontend && npm install

widget: widget-install ## Run widget dev server (proxies /api to agent)
	cd frontend && npm run dev

widget-build:
	cd frontend && npm run build

clean: demo-stop
	docker compose down -v
