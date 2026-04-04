"""Configuration resolution for the Kredit SDK."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_BASE_URL = "https://api.kredit.sh"
DEFAULT_TIMEOUT = 5.0
DEFAULT_MAX_RETRIES = 2


def resolve_api_key(api_key: str | None = None) -> str | None:
    """Resolve API key from param, env var, or config file (in that order)."""
    if api_key:
        return api_key

    env_key = os.environ.get("KREDIT_API_KEY")
    if env_key:
        return env_key

    config_path = Path.home() / ".kredit" / "config"
    if config_path.exists():
        for line in config_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("api_key="):
                return line.split("=", 1)[1].strip()
            if line.startswith("KREDIT_API_KEY="):
                return line.split("=", 1)[1].strip()

    return None


def resolve_base_url(base_url: str | None = None) -> str:
    """Resolve base URL from param or env var, falling back to default."""
    if base_url:
        return base_url.rstrip("/")

    env_url = os.environ.get("KREDIT_API_URL")
    if env_url:
        return env_url.rstrip("/")

    return DEFAULT_BASE_URL
