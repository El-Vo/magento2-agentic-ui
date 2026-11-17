from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mistral_api_key: str = ""
    agent_model: str = "mistral-large-latest"
    magento_base_url: str = "http://localhost:8080"
    magento_store_code: str = "default"
    agent_allowed_origin: str = "http://localhost:5173"
    max_tool_calls_per_turn: int = 6
    # Dauerhaft angemeldeter Demo-Customer (Agent handelt in seinem Namen)
    persistent_customer_email: str = "demo.kunde@agentic.local"
    persistent_customer_password: str = "Demo!Kunde123"

    @property
    def magento_graphql_url(self) -> str:
        return f"{self.magento_base_url.rstrip('/')}/graphql"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.mistral_api_key)


settings = Settings()
