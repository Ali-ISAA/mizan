from pydantic import SecretStr
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Core
    secret_key: SecretStr = SecretStr("dev-secret-key-change-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Database
    database_url: str = "postgresql+asyncpg://mizan:mizan@localhost:5434/mizan"

    # Redis
    redis_url: str = "redis://localhost:6381/0"

    # CORS
    allowed_origins: List[str] = ["http://localhost:7002", "http://localhost:7003"]

    # Files
    upload_dir: str = "/tmp/mizan-uploads"
    max_file_size_mb: int = 200

    # Noesia
    noesia_api_url: str = "http://localhost:8080"
    noesia_pat: str = ""
    noesia_profile_slug: str = ""

    # Qdrant
    qdrant_url: str = "http://localhost:7004"
    qdrant_host: str = ""
    qdrant_api_key: str = ""

    # Ollama
    ollama_url: str = "http://localhost:11434"
    ollama_embed_model: str = "nomic-embed-text"

    # LLM
    llm_provider: str = "dashscope"
    llm_model: str = "qwen-plus-2025-12-01"
    llm_api_key: str = ""
    llm_base_url: str = ""

    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    zai_api_key: str = ""
    zai_base_url: str = "https://api.z.ai/api/paas/v4"

    chat_llm_provider: str = ""
    chat_llm_model: str = ""
    chat_api_key: str = ""
    chat_api_base: str = ""

    # Superadmin
    superadmin_email: str = "admin@mizan.local"
    superadmin_password: SecretStr = SecretStr("admin123")

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
