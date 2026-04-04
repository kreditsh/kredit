"""Main Kredit client."""

from __future__ import annotations

import time
from typing import Any

import httpx

from kredit.config import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_TIMEOUT,
    resolve_api_key,
    resolve_base_url,
)
from kredit.exceptions import AuthError, KreditError, RiskDenied
from kredit.models import Agent, CheckResult, Org, ScoreResult, Wallet


class _OrgsMixin:
    """Org management methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def create(self, *, name: str) -> Org:
        """Create an organization."""
        data = self._client._request("POST", "/orgs", json={"name": name})
        return Org.model_validate(data)

    def list(self) -> list[Org]:
        """List all organizations."""
        data = self._client._request("GET", "/orgs")
        return [Org.model_validate(item) for item in data]


class _AgentsMixin:
    """Agent management methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def create(
        self,
        *,
        name: str,
        org_id: str | None = None,
        org: str | None = None,
    ) -> Agent:
        """Create an agent. Pass either org_id or org (name)."""
        body: dict[str, Any] = {"name": name}
        if org_id is not None:
            body["org_id"] = org_id
        elif org is not None:
            body["org"] = org
        else:
            raise KreditError("Either org_id or org must be provided")
        data = self._client._request("POST", "/agents", json=body)
        return Agent.model_validate(data)

    def list(self, *, org_id: str) -> list[Agent]:
        """List agents for an organization."""
        data = self._client._request("GET", "/agents", params={"org_id": org_id})
        return [Agent.model_validate(item) for item in data]

    def get(self, *, agent_id: str) -> Agent:
        """Get a single agent by ID."""
        data = self._client._request("GET", f"/agents/{agent_id}")
        return Agent.model_validate(data)


class _WalletMixin:
    """Wallet management methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def get(self, *, agent_id: str) -> Wallet:
        """Get wallet for an agent."""
        data = self._client._request("GET", f"/wallets/{agent_id}")
        return Wallet.model_validate(data)

    def set_budget(self, *, agent_id: str, budget: int) -> Wallet:
        """Set wallet budget (in cents)."""
        data = self._client._request(
            "PUT",
            f"/wallets/{agent_id}",
            json={"budget": budget},
        )
        return Wallet.model_validate(data)


class Kredit:
    """Kredit SDK client.

    Args:
        api_key: API key. Falls back to KREDIT_API_KEY env var or ~/.kredit/config.
        base_url: API base URL. Falls back to KREDIT_API_URL env var or https://api.kredit.sh.
        timeout: Request timeout in seconds. Default 5.
        max_retries: Max retry attempts on transient errors. Default 2.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ) -> None:
        resolved_key = resolve_api_key(api_key)
        if not resolved_key:
            raise AuthError(
                "No API key provided. Pass api_key, set KREDIT_API_KEY, "
                "or add api_key=... to ~/.kredit/config"
            )
        self._api_key = resolved_key
        self._base_url = resolve_base_url(base_url)
        self._timeout = timeout
        self._max_retries = max_retries
        self._http = httpx.Client(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "User-Agent": "kredit-python/0.1.0",
            },
            timeout=self._timeout,
        )

        self.orgs = _OrgsMixin(self)
        self.agents = _AgentsMixin(self)
        self.wallet = _WalletMixin(self)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Send an HTTP request with retry and backoff."""
        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                resp = self._http.request(method, path, json=json, params=params)
                return self._handle_response(resp)
            except httpx.TimeoutException as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    time.sleep(0.5 * (2**attempt))
                    continue
                raise KreditError(f"Request timed out after {self._max_retries + 1} attempts") from exc
            except (httpx.ConnectError, httpx.RemoteProtocolError) as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    time.sleep(0.5 * (2**attempt))
                    continue
                raise KreditError(f"Connection failed after {self._max_retries + 1} attempts") from exc
            except KreditError:
                raise
            except Exception as exc:
                last_exc = exc
                raise KreditError(f"Unexpected error: {exc}") from exc

        raise KreditError(f"Request failed after {self._max_retries + 1} attempts") from last_exc

    def _handle_response(self, resp: httpx.Response) -> Any:
        """Parse response, raising typed errors for non-2xx status codes."""
        if resp.status_code == 401 or resp.status_code == 403:
            body = self._safe_json(resp)
            if resp.status_code == 401:
                raise AuthError(body.get("error", "Authentication failed"), body=body)
            raise RiskDenied(body.get("error", "Forbidden"), body=body)

        if resp.status_code == 429:
            body = self._safe_json(resp)
            raise KreditError("Rate limited", status_code=429, body=body)

        if resp.status_code >= 500:
            raise KreditError(
                f"Server error ({resp.status_code})",
                status_code=resp.status_code,
                body=self._safe_json(resp),
            )

        if resp.status_code >= 400:
            body = self._safe_json(resp)
            raise KreditError(
                body.get("error", f"Request failed ({resp.status_code})"),
                status_code=resp.status_code,
                body=body,
            )

        return resp.json()

    @staticmethod
    def _safe_json(resp: httpx.Response) -> dict:
        """Attempt to parse JSON body; return empty dict on failure."""
        try:
            return resp.json()
        except Exception:
            return {}

    # ----- Top-level convenience methods -----

    def check(
        self,
        *,
        agent_id: str,
        action: str,
        estimated_cost: int,
    ) -> CheckResult:
        """Run a risk check before executing an action.

        This is the hot path — kept minimal for speed.

        Args:
            agent_id: The agent requesting the action.
            action: Action identifier (e.g. "serp_api.search").
            estimated_cost: Estimated cost in cents.

        Returns:
            CheckResult with allow/deny decision and agent status.
        """
        data = self._request(
            "POST",
            "/check",
            json={
                "agent_id": agent_id,
                "action": action,
                "estimated_cost": estimated_cost,
            },
        )
        return CheckResult.model_validate(data)

    def report(
        self,
        *,
        agent_id: str,
        txn_id: str,
        outcome: str,
        actual_cost: int,
    ) -> None:
        """Report the outcome of an action after completion.

        Args:
            agent_id: The agent that executed the action.
            txn_id: Transaction ID from the check response.
            outcome: Result of the action ("success", "failure", "error").
            actual_cost: Actual cost incurred in cents.
        """
        self._request(
            "POST",
            "/report",
            json={
                "agent_id": agent_id,
                "txn_id": txn_id,
                "outcome": outcome,
                "actual_cost": actual_cost,
            },
        )

    def score(self, *, agent_id: str) -> ScoreResult:
        """Get the credit score for an agent.

        Args:
            agent_id: The agent to score.

        Returns:
            ScoreResult with score value, risk level, and contributing factors.
        """
        data = self._request("GET", f"/agents/{agent_id}/score")
        return ScoreResult.model_validate(data)

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._http.close()

    def __enter__(self) -> Kredit:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
