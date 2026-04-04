"""Exception types for the Kredit SDK."""

from __future__ import annotations


class KreditError(Exception):
    """Base exception for all Kredit SDK errors."""

    def __init__(self, message: str, status_code: int | None = None, body: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.body = body or {}


class AuthError(KreditError):
    """Raised when authentication fails (401/403)."""

    def __init__(self, message: str = "Invalid or missing API key", body: dict | None = None):
        super().__init__(message, status_code=401, body=body)


class RiskDenied(KreditError):
    """Raised when a risk check denies the action."""

    def __init__(self, message: str = "Action denied by risk check", body: dict | None = None):
        super().__init__(message, status_code=403, body=body)
