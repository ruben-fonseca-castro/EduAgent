from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-4-6"
    llm_temperature: float = 0.7

    # API Keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1"   # set this for OpenAI-compatible endpoints (e.g. Oracle)
    ollama_base_url: str = "http://localhost:11434"

    # Oracle Cloud Generative AI
    oci_compartment_id: str = ""
    oci_service_endpoint: str = "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com"
    oci_config_profile: str = "DEFAULT"  # profile name in ~/.oci/config

    # Paths
    data_dir: str = "./data"
    chroma_db_path: str = "./data/chroma_db"
    lessons_dir: str = "./data/generated_lessons"
    student_context_dir: str = "./data/student_context"
    mcp_server_path: str = "./backend/mcp_servers/python_executor.py"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    def ensure_dirs(self) -> None:
        for path in [self.data_dir, self.chroma_db_path, self.lessons_dir, self.student_context_dir]:
            Path(path).mkdir(parents=True, exist_ok=True)

    def _get_oci_llm(self, streaming: bool = False):
        from langchain_community.chat_models.oci_generative_ai import ChatOCIGenAI
        return ChatOCIGenAI(
            model_id=self.llm_model,
            service_endpoint=self.oci_service_endpoint,
            compartment_id=self.oci_compartment_id,
            auth_type="API_KEY",
            auth_profile=self.oci_config_profile,
            model_kwargs={"temperature": self.llm_temperature, "max_tokens": 4096},
        )

    def _get_openai_llm(self, streaming: bool = False, temperature: float | None = None):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=self.llm_model,
            api_key=self.openai_api_key,
            temperature=temperature if temperature is not None else self.llm_temperature,
            streaming=streaming,
            **({"base_url": self.openai_api_base} if self.openai_api_base else {}),
        )

    def get_llm(self, streaming: bool = False):
        if self.llm_provider == "ollama":
            from langchain_ollama import ChatOllama
            return ChatOllama(model=self.llm_model, base_url=self.ollama_base_url)

        if self.llm_provider == "oci":
            return self._get_oci_llm(streaming=streaming)

        if self.llm_provider == "openai":
            return self._get_openai_llm(streaming=streaming)

        from langchain.chat_models import init_chat_model
        return init_chat_model(
            f"{self.llm_provider}/{self.llm_model}",
            temperature=self.llm_temperature,
            streaming=streaming,
        )

    def get_small_llm(self, streaming: bool = False):
        """Lighter model for parse_input node."""
        if self.llm_provider == "ollama":
            from langchain_ollama import ChatOllama
            return ChatOllama(model=self.llm_model, base_url=self.ollama_base_url)

        if self.llm_provider == "oci":
            return self._get_oci_llm(streaming=streaming)

        if self.llm_provider == "openai":
            return self._get_openai_llm(streaming=streaming, temperature=0.3)

        if self.llm_provider == "anthropic":
            from langchain.chat_models import init_chat_model
            return init_chat_model(
                "anthropic/claude-haiku-4-5-20251001",
                temperature=0.3,
                streaming=streaming,
            )

        from langchain.chat_models import init_chat_model
        return init_chat_model(
            f"{self.llm_provider}/{self.llm_model}",
            temperature=0.3,
            streaming=streaming,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
