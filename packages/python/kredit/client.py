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
from kredit.models import (
    Agent,
    AgentSpend,
    CheckResult,
    FleetOverview,
    Org,
    ReportResult,
    Rule,
    ScoreResult,
    Transaction,
    Wallet,
)


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
        org_name: str | None = None,
    ) -> Agent:
        """Create an agent. Pass either org_id or org_name."""
        body: dict[str, Any] = {"name": name}
        if org_id is not None:
            body["org_id"] = org_id
        elif org_name is not None:
            body["org_name"] = org_name
        else:
            raise KreditError("Either org_id or org_name must be provided")
        data = self._client._request("POST", "/agents", json=body)
        return Agent.model_validate(data)

    def list(self, *, org_id: str | None = None) -> list[Agent]:
        """List agents, optionally filtered by organization."""
        params: dict[str, str] = {}
        if org_id is not None:
            params["org_id"] = org_id
        data = self._client._request("GET", "/agents", params=params or None)
        return [Agent.model_validate(item) for item in data]

    def get(self, *, agent_id: str) -> Agent:
        """Get a single agent by ID."""
        data = self._client._request("GET", f"/agents/{agent_id}")
        return Agent.model_validate(data)

    def update(
        self,
        *,
        agent_id: str,
        name: str | None = None,
        priority: str | None = None,
        wallet: dict | None = None,
    ) -> Agent:
        """Update an agent."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if priority is not None:
            body["priority"] = priority
        if wallet is not None:
            body["wallet"] = wallet
        data = self._client._request("PUT", f"/agents/{agent_id}", json=body)
        return Agent.model_validate(data)

    def delete(self, *, agent_id: str) -> None:
        """Delete an agent."""
        self._client._request("DELETE", f"/agents/{agent_id}")


class _WalletMixin:
    """Wallet management methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def get(self, *, agent_id: str) -> Wallet:
        """Get wallet for an agent."""
        data = self._client._request("GET", f"/wallets/{agent_id}")
        return Wallet.model_validate(data)

    def set_budget(self, *, agent_id: str, budget: float) -> Wallet:
        """Set wallet budget (dollars). Deprecated: use wallet.update() instead."""
        data = self._client._request(
            "PUT",
            f"/wallets/{agent_id}",
            json={"budget": budget},
        )
        return Wallet.model_validate(data)


class _RulesMixin:
    """Rule management methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(self, *, agent_id: str) -> list[Rule]:
        """List rules for an agent."""
        data = self._client._request("GET", f"/agents/{agent_id}/rules")
        return [Rule.model_validate(item) for item in data]

    def add(
        self,
        *,
        agent_id: str,
        name: str = "",
        match: str = "*",
        max_cost_per_txn: float = 0,
        daily_spend_limit: float = 0,
        hourly_rate_limit: int = 0,
    ) -> Rule:
        """Add a rule to an agent."""
        body = {
            "name": name,
            "match": match,
            "max_cost_per_txn": max_cost_per_txn,
            "daily_spend_limit": daily_spend_limit,
            "hourly_rate_limit": hourly_rate_limit,
        }
        data = self._client._request("POST", f"/agents/{agent_id}/rules", json=body)
        return Rule.model_validate(data)

    def update(self, *, agent_id: str, rule_id: str, **kwargs: Any) -> Rule:
        """Update a rule on an agent."""
        data = self._client._request(
            "PUT", f"/agents/{agent_id}/rules/{rule_id}", json=kwargs
        )
        return Rule.model_validate(data)

    def remove(self, *, agent_id: str, rule_id: str) -> None:
        """Remove a rule from an agent."""
        self._client._request("DELETE", f"/agents/{agent_id}/rules/{rule_id}")


class _TransactionsMixin:
    """Transaction query methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(
        self,
        *,
        agent_id: str | None = None,
        status: str | None = None,
        risk_level: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Transaction]:
        """List transactions with optional filters."""
        params: dict[str, Any] = {"limit": str(limit), "offset": str(offset)}
        if agent_id:
            params["agent_id"] = agent_id
        if status:
            params["status"] = status
        if risk_level:
            params["risk_level"] = risk_level
        data = self._client._request("GET", "/transactions", params=params)
        return [Transaction.model_validate(item) for item in data]


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
                "User-Agent": "kredit-python/0.7.0",
            },
            timeout=self._timeout,
        )

        self.orgs = _OrgsMixin(self)
        self.agents = _AgentsMixin(self)
        self.wallet = _WalletMixin(self)
        self.rules = _RulesMixin(self)
        self.transactions = _TransactionsMixin(self)

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
        estimated_cost: float,
        type: str = "api_call",
        metadata: dict | None = None,
    ) -> CheckResult:
        """Run a risk check before executing an action.

        This is the hot path -- kept minimal for speed.

        Args:
            agent_id: The agent requesting the action.
            action: Action identifier (e.g. "serp_api.search").
            estimated_cost: Estimated cost in dollars.
            type: Transaction type (default "api_call").
            metadata: Optional metadata dict.

        Returns:
            CheckResult with allow/deny decision and agent status.
        """
        body: dict[str, Any] = {
            "agent_id": agent_id,
            "action": action,
            "estimated_cost": estimated_cost,
            "type": type,
        }
        if metadata is not None:
            body["metadata"] = metadata
        data = self._request("POST", "/check", json=body)
        return CheckResult.model_validate(data)

    def report(
        self,
        *,
        transaction_id: str,
        outcome: str,
        actual_cost: float | None = None,
    ) -> ReportResult:
        """Report the outcome of an action after completion.

        Args:
            transaction_id: Transaction ID from the check response.
            outcome: Result of the action ("success", "failure", or "partial").
            actual_cost: Actual cost incurred in dollars (optional).

        Returns:
            ReportResult with updated score and agent status.
        """
        if outcome not in ("success", "failure", "partial"):
            raise KreditError(
                f"Invalid outcome '{outcome}': must be 'success', 'failure', or 'partial'"
            )
        body: dict[str, Any] = {
            "transaction_id": transaction_id,
            "outcome": outcome,
        }
        if actual_cost is not None:
            body["actual_cost"] = actual_cost
        data = self._request("POST", "/report", json=body)
        return ReportResult.model_validate(data)

    def score(self, *, agent_id: str) -> ScoreResult:
        """Get the credit score for an agent.

        Args:
            agent_id: The agent to score.

        Returns:
            ScoreResult with score value, risk level, and contributing factors.
        """
        data = self._request("GET", f"/agents/{agent_id}/score")
        return ScoreResult.model_validate(data)

    def fleet(self) -> FleetOverview:
        """Get fleet-level overview stats.

        Returns:
            FleetOverview with aggregate metrics across all agents.
        """
        data = self._request("GET", "/fleet/overview")
        return FleetOverview.model_validate(data)

    def spend(self, *, agent_id: str) -> AgentSpend:
        """Get spend breakdown for an agent.

        Args:
            agent_id: The agent to query.

        Returns:
            AgentSpend with total, daily, weekly, and monthly spend.
        """
        data = self._request("GET", f"/agents/{agent_id}/spend")
        return AgentSpend.model_validate(data)

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._http.close()

    def __enter__(self) -> Kredit:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
