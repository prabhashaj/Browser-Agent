"""backend/app/config.py — Settings loaded from environment variables."""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Server
    port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # Database
    database_url: str = "sqlite+aiosqlite:///./pilot.db"

    # Auth
    session_secret: str = "change-me-in-production"
    csrf_secret: str = "change-me-too"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # LLM
    gemini_api_key: str = ""
    anthropic_api_key: str = ""

    # Jev
    typesafe_api_key: str = ""
    decider: str = "llm"  # "llm" | "jev"

    # Vault
    secret_encryption_key: str = ""  # 32-byte hex; empty = vault disabled

    # Google OAuth
    google_oauth_enabled: bool = False
    google_client_id: str = ""
    google_client_secret: str = ""

    # Browser
    browser_mode: str = "local"  # "local" | "remote"
    screencast_fps: int = 10
    screencast_quality: int = 75

    # Agent limits
    max_concurrent_runs: int = 2
    approval_timeout_seconds: int = 300
    max_steps_per_run: int = 60
    max_run_seconds: int = 600

    # Kill switch
    kill_switch: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def vault_enabled(self) -> bool:
        return bool(self.secret_encryption_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
