"""Main Kredit client."""

from __future__ import annotations

import json as _json
import time
from collections.abc import Iterator
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
    Chat,
    CheckResult,
    Environment,
    FleetOverview,
    Org,
    Prior,
    ReportResult,
    Rule,
    ScoreResult,
    Transaction,
    Wallet,
    Workflow,
)


class _OrgsMixin:
    """Org management methods, bound to a Kredit client instance."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def create(
        self, *, name: str, mode: str | None = None, environment_id: str | None = None
    ) -> Org:
        """Create an organization."""
        body: dict[str, Any] = {"name": name}
        if mode is not None:
            body["mode"] = mode
        if environment_id is not None:
            body["environment_id"] = environment_id
        data = self._client._request("POST", "/orgs", json=body)
        return Org.model_validate(data)

    def list(
        self, *, mode: str | None = None, environment_id: str | None = None
    ) -> list[Org]:
        """List all organizations."""
        params: dict[str, str] = {}
        if mode is not None:
            params["mode"] = mode
        if environment_id is not None:
            params["environment_id"] = environment_id
        data = self._client._request("GET", "/orgs", params=params or None)
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
        sandbox_id: str | None = None,
        priority: str | None = None,
        budgets: dict | None = None,
        mode: str | None = None,
        environment_id: str | None = None,
    ) -> Agent:
        """Create an agent. Pass either org_id or org_name.

        Optionally scope it to a `sandbox_id` and attach per-kind `budgets`
        (control-plane windowed limits).
        """
        body: dict[str, Any] = {"name": name}
        if org_id is not None:
            body["org_id"] = org_id
        elif org_name is not None:
            body["org_name"] = org_name
        else:
            raise KreditError("Either org_id or org_name must be provided")
        if sandbox_id is not None:
            body["sandbox_id"] = sandbox_id
        if priority is not None:
            body["priority"] = priority
        if budgets is not None:
            body["budgets"] = budgets
        if mode is not None:
            body["mode"] = mode
        if environment_id is not None:
            body["environment_id"] = environment_id
        data = self._client._request("POST", "/agents", json=body)
        return Agent.model_validate(data)

    def list(
        self,
        *,
        org_id: str | None = None,
        mode: str | None = None,
        environment_id: str | None = None,
    ) -> list[Agent]:
        """List agents, optionally filtered by organization."""
        params: dict[str, str] = {}
        if org_id is not None:
            params["org_id"] = org_id
        if mode is not None:
            params["mode"] = mode
        if environment_id is not None:
            params["environment_id"] = environment_id
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
        mode: str | None = None,
    ) -> Rule:
        """Add a rule to an agent. Pass `mode` ("" = all modes) to scope it."""
        body: dict[str, Any] = {
            "name": name,
            "match": match,
            "max_cost_per_txn": max_cost_per_txn,
            "daily_spend_limit": daily_spend_limit,
            "hourly_rate_limit": hourly_rate_limit,
        }
        if mode is not None:
            body["mode"] = mode
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
        mode: str | None = None,
        environment_id: str | None = None,
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
        if mode:
            params["mode"] = mode
        if environment_id is not None:
            params["environment_id"] = environment_id
        data = self._client._request("GET", "/transactions", params=params)
        return [Transaction.model_validate(item) for item in data]


class _SandboxesMixin:
    """Sandbox (environment container) methods. Returns raw dicts."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(self) -> list[dict]:
        """List sandboxes."""
        return self._client._request("GET", "/sandboxes")

    def create(self, *, name: str, config: dict | None = None) -> dict:
        """Create a named sandbox (starts in simulation mode)."""
        body: dict[str, Any] = {"name": name}
        if config is not None:
            body["config"] = config
        return self._client._request("POST", "/sandboxes", json=body)

    def get(self, *, sandbox_id: str) -> dict:
        """Get a sandbox by id."""
        return self._client._request("GET", f"/sandboxes/{sandbox_id}")

    def update(self, *, sandbox_id: str, name: str | None = None, config: dict | None = None) -> dict:
        """Update a sandbox name and/or config."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if config is not None:
            body["config"] = config
        return self._client._request("PUT", f"/sandboxes/{sandbox_id}", json=body)

    def delete(self, *, sandbox_id: str) -> None:
        """Delete a sandbox (must be empty)."""
        self._client._request("DELETE", f"/sandboxes/{sandbox_id}")

    def copy(self, *, sandbox_id: str, name: str) -> dict:
        """Clone a sandbox's config into a new named sandbox."""
        return self._client._request("POST", f"/sandboxes/{sandbox_id}/copy", json={"name": name})

    def promote_preview(self, *, sandbox_id: str) -> dict:
        """Copy a simulation sandbox's config to the preview environment."""
        return self._client._request("POST", f"/sandboxes/{sandbox_id}/promote/preview")

    def promote_production(self, *, preview_sandbox_id: str) -> dict:
        """Copy the preview sandbox's config to production."""
        return self._client._request(
            "POST", f"/sandboxes/{preview_sandbox_id}/promote/production"
        )

    def deploy(
        self,
        *,
        sandbox_id: str,
        from_mode: str,
        to_mode: str,
        include: tuple[str, ...] | list[str] = ("orgs", "agents", "rules"),
        source_simulation_id: str | None = None,
    ) -> dict:
        """Deploy config from one mode to another within a sandbox.

        Copies the selected `include` kinds ("orgs", "agents", "rules") from
        `from_mode` into `to_mode`. Returns ``{ok, deployed:{orgs,agents,rules}}``.
        """
        body: dict[str, Any] = {
            "from_mode": from_mode,
            "to_mode": to_mode,
            "include": list(include),
        }
        if source_simulation_id is not None:
            body["source_simulation_id"] = source_simulation_id
        return self._client._request(
            "POST", f"/sandboxes/{sandbox_id}/deploy", json=body
        )

    def versions(self, *, sandbox_id: str) -> dict:
        """List a sandbox's saved config versions."""
        return self._client._request("GET", f"/sandboxes/{sandbox_id}/versions")

    def switch(self, *, sandbox_id: str, version: int) -> dict:
        """Restore a previous config version as active."""
        return self._client._request("POST", f"/sandboxes/{sandbox_id}/switch/{version}")


class _SimulationsMixin:
    """Trust simulation methods. Returns raw dicts."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def run(
        self,
        *,
        sandbox_id: str,
        mode: str = "predictive",
        period: str = "1mo",
        duration_sec: int = 60,
        monthly_budget: float = 0.0,
        seed: int = 42,
        stream: bool = False,
        name: str | None = None,
    ) -> dict:
        """Run a trust simulation on a sandbox.

        Pass ``stream=True`` (realtime) to start the simulation in the
        background; the response is ``{id, status:"running"}`` and events can be
        consumed via :meth:`stream`. Pass ``name`` to label the run.
        """
        body: dict[str, Any] = {
            "sandbox_id": sandbox_id,
            "mode": mode,
            "period": period,
            "duration_sec": duration_sec,
            "monthly_budget": monthly_budget,
            "seed": seed,
        }
        if stream:
            body["stream"] = stream
        if name is not None:
            body["name"] = name
        return self._client._request("POST", "/simulations/run", json=body)

    def list(self, *, sandbox_id: str | None = None) -> list[dict]:
        """List past simulations, optionally by sandbox."""
        params = {"sandbox_id": sandbox_id} if sandbox_id else None
        return self._client._request("GET", "/simulations", params=params)

    def get(self, *, simulation_id: str) -> dict:
        """Get a stored simulation by id."""
        return self._client._request("GET", f"/simulations/{simulation_id}")

    def stop(self, *, simulation_id: str) -> dict:
        """Stop a running (streaming) simulation. Returns ``{ok, stopped}``."""
        return self._client._request("POST", f"/simulations/{simulation_id}/stop")

    def stream(self, *, simulation_id: str) -> Iterator[dict]:
        """Stream events from a running simulation as they occur.

        Yields each Server-Sent Event as a parsed dict — ``{"type":"action",
        ...}`` events, ``{"type":"ping"}`` keepalives, and a final
        ``{"type":"done", "total_actions":N}`` event, after which the generator
        stops.
        """
        return self._client._stream(f"/simulations/{simulation_id}/stream")


class _PriorsMixin:
    """Prior (simulation distribution) methods, bound to a Kredit client instance.

    Priors are scoped per (sandbox, mode). ``sandbox_id`` is passed as a query
    parameter on list/create, not in the JSON body.
    """

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def presets(self) -> dict:
        """List ready-made seasonality curves (``24x7``, ``weekday``, ``business-hours``)."""
        return self._client._request("GET", "/priors/presets")

    def list(
        self,
        *,
        sandbox_id: str,
        mode: str | None = None,
        environment_id: str | None = None,
    ) -> list[Prior]:
        """List priors for a sandbox, optionally filtered by mode."""
        params: dict[str, str] = {"sandbox_id": sandbox_id}
        if mode is not None:
            params["mode"] = mode
        if environment_id is not None:
            params["environment_id"] = environment_id
        data = self._client._request("GET", "/priors", params=params)
        return [Prior.model_validate(item) for item in data]

    def create(
        self,
        *,
        sandbox_id: str,
        name: str,
        frequency: dict | None = None,
        cost: dict | None = None,
        seasonality: dict | None = None,
        transitions: dict | None = None,
        source: str = "manual",
        mode: str | None = None,
        environment_id: str | None = None,
        workflow_id: str = "",
    ) -> Prior:
        """Create a prior in a sandbox.

        ``frequency`` and ``cost`` are ``{"mean": .., "variance": ..}`` dicts;
        ``seasonality`` is ``{"dow": [7], "hour": [24]}``. Omitted distributions
        fall back to the server defaults. ``sandbox_id`` is sent as a query
        parameter.
        """
        body: dict[str, Any] = {
            "name": name,
            "source": source,
            "workflow_id": workflow_id,
        }
        if frequency is not None:
            body["frequency"] = frequency
        if cost is not None:
            body["cost"] = cost
        if seasonality is not None:
            body["seasonality"] = seasonality
        if transitions is not None:
            body["transitions"] = transitions
        if mode is not None:
            body["mode"] = mode
        if environment_id is not None:
            body["environment_id"] = environment_id
        data = self._client._request(
            "POST", "/priors", params={"sandbox_id": sandbox_id}, json=body
        )
        return Prior.model_validate(data)

    def update(
        self,
        *,
        prior_id: str,
        name: str | None = None,
        frequency: dict | None = None,
        cost: dict | None = None,
        seasonality: dict | None = None,
        transitions: dict | None = None,
    ) -> Prior:
        """Update a prior. Only provided fields are changed."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if frequency is not None:
            body["frequency"] = frequency
        if cost is not None:
            body["cost"] = cost
        if seasonality is not None:
            body["seasonality"] = seasonality
        if transitions is not None:
            body["transitions"] = transitions
        data = self._client._request("PUT", f"/priors/{prior_id}", json=body)
        return Prior.model_validate(data)

    def delete(self, *, prior_id: str) -> None:
        """Delete a prior."""
        self._client._request("DELETE", f"/priors/{prior_id}")


class _WorkflowsMixin:
    """Workflow (orchestration graph) methods, bound to a Kredit client instance.

    Workflows are scoped per (sandbox, mode). On :meth:`list`, ``sandbox_id`` is
    a query parameter; on :meth:`create`, it is sent in the JSON body (like
    ``orgs.create``).
    """

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(
        self,
        *,
        sandbox_id: str,
        mode: str | None = None,
        environment_id: str | None = None,
    ) -> list[Workflow]:
        """List workflows for a sandbox, optionally filtered by mode.

        ``sandbox_id`` is passed as a query parameter.
        """
        params: dict[str, str] = {"sandbox_id": sandbox_id}
        if mode is not None:
            params["mode"] = mode
        if environment_id is not None:
            params["environment_id"] = environment_id
        data = self._client._request("GET", "/workflows", params=params)
        return [Workflow.model_validate(item) for item in data]

    def create(
        self,
        *,
        sandbox_id: str,
        name: str,
        nodes: list[dict],
        edges: list[dict],
        mode: str | None = None,
        environment_id: str | None = None,
    ) -> Workflow:
        """Create a workflow in a sandbox.

        ``nodes`` are ``{id, type, label, integration?, config?}`` dicts and
        ``edges`` are ``{from, to, condition?}`` dicts. ``sandbox_id`` is sent
        in the JSON body. Invalid graphs (cycles, bad integrations) raise a 400.
        """
        body: dict[str, Any] = {
            "sandbox_id": sandbox_id,
            "name": name,
            "nodes": nodes,
            "edges": edges,
        }
        if mode is not None:
            body["mode"] = mode
        if environment_id is not None:
            body["environment_id"] = environment_id
        data = self._client._request("POST", "/workflows", json=body)
        return Workflow.model_validate(data)

    def get(self, *, workflow_id: str) -> Workflow:
        """Get a single workflow by ID."""
        data = self._client._request("GET", f"/workflows/{workflow_id}")
        return Workflow.model_validate(data)

    def update(
        self,
        *,
        workflow_id: str,
        name: str | None = None,
        nodes: list[dict] | None = None,
        edges: list[dict] | None = None,
    ) -> Workflow:
        """Update a workflow. Bumps its version and keeps history.

        Only provided fields are changed.
        """
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if nodes is not None:
            body["nodes"] = nodes
        if edges is not None:
            body["edges"] = edges
        data = self._client._request("PUT", f"/workflows/{workflow_id}", json=body)
        return Workflow.model_validate(data)

    def delete(self, *, workflow_id: str) -> None:
        """Delete a workflow."""
        self._client._request("DELETE", f"/workflows/{workflow_id}")

    def versions(self, *, workflow_id: str) -> dict:
        """List a workflow's saved versions (``{current, history:[...]}``)."""
        return self._client._request("GET", f"/workflows/{workflow_id}/versions")

    def simulate(self, *, workflow_id: str, seed: int = 42) -> dict:
        """Simulate a run through the workflow graph.

        Returns ``{workflow_id, mode, node_count, blocked_count, total_cost,
        node_runs:[...]}``.
        """
        return self._client._request(
            "POST", f"/workflows/{workflow_id}/simulate", params={"seed": seed}
        )

    def execute(self, *, workflow_id: str, seed: int = 42) -> dict:
        """Execute the workflow for real through the trusted path.

        Unlike :meth:`simulate`, this settles each node per mode and records
        transactions. Returns the run record ``{id, workflow_id, sandbox_id,
        mode, status, node_count, blocked_count, total_cost, elapsed_sec,
        node_runs:[...], transaction_ids, created_at}``.
        """
        return self._client._request(
            "POST", f"/workflows/{workflow_id}/execute", params={"seed": seed}
        )

    def runs(self, *, workflow_id: str) -> list[dict]:
        """List past runs for a workflow, newest first.

        Returns ``[{id, workflow_id, mode, status, node_count, blocked_count,
        total_cost, created_at}]``.
        """
        return self._client._request("GET", f"/workflows/{workflow_id}/runs")

    def get_run(self, *, run_id: str) -> dict:
        """Get a single run record by its run id (the full run record)."""
        return self._client._request("GET", f"/workflows/runs/{run_id}")


class _EnvironmentsMixin:
    """Environment methods, bound to a Kredit client instance.

    A sandbox contains environments: the 3 modes (simulation, preview,
    production) are standard environments — a sandbox has exactly one
    production environment — and each simulation run is an environment with
    mode "simulation" nested inside its parent environment. On
    :meth:`list` and :meth:`create`, ``sandbox_id`` is passed as a query
    parameter and JSON body field respectively.
    """

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(self, *, sandbox_id: str) -> list[Environment]:
        """List environments for a sandbox (lazily provisions the standard envs).

        ``sandbox_id`` is passed as a query parameter.
        """
        data = self._client._request(
            "GET", "/environments", params={"sandbox_id": sandbox_id}
        )
        return [Environment.model_validate(item) for item in data]

    def create(
        self,
        *,
        sandbox_id: str,
        mode: str,
        name: str | None = None,
        simulation_id: str | None = None,
    ) -> Environment:
        """Create an environment in a sandbox.

        ``mode`` is one of ``simulation``, ``preview``, or ``production``.
        Pass ``simulation_id`` to bind a simulation-mode environment to a
        simulation run. ``sandbox_id`` is sent in the JSON body.
        """
        body: dict[str, Any] = {"sandbox_id": sandbox_id, "mode": mode}
        if name is not None:
            body["name"] = name
        if simulation_id is not None:
            body["simulation_id"] = simulation_id
        data = self._client._request("POST", "/environments", json=body)
        return Environment.model_validate(data)

    def get(self, *, environment_id: str) -> Environment:
        """Get a single environment by ID."""
        data = self._client._request("GET", f"/environments/{environment_id}")
        return Environment.model_validate(data)

    def delete(self, *, environment_id: str) -> None:
        """Delete an environment.

        Standard/mode environments cannot be deleted and raise a 400.
        """
        self._client._request("DELETE", f"/environments/{environment_id}")


class _ChatsMixin:
    """Chat methods (persisted Kredit-agent conversations), bound to a client.

    On :meth:`list` and :meth:`create`, ``sandbox_id`` is optional and passed as
    a query parameter and JSON body field respectively.
    """

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(self, *, sandbox_id: str | None = None) -> list[Chat]:
        """List chats, optionally filtered by sandbox.

        ``sandbox_id`` is passed as a query parameter.
        """
        params = {"sandbox_id": sandbox_id} if sandbox_id else None
        data = self._client._request("GET", "/chats", params=params)
        return [Chat.model_validate(item) for item in data]

    def create(
        self,
        *,
        sandbox_id: str | None = None,
        mode: str | None = None,
        environment_id: str | None = None,
        simulation_id: str | None = None,
        title: str | None = None,
    ) -> Chat:
        """Create a chat. All fields are optional."""
        body: dict[str, Any] = {}
        if sandbox_id is not None:
            body["sandbox_id"] = sandbox_id
        if mode is not None:
            body["mode"] = mode
        if environment_id is not None:
            body["environment_id"] = environment_id
        if simulation_id is not None:
            body["simulation_id"] = simulation_id
        if title is not None:
            body["title"] = title
        data = self._client._request("POST", "/chats", json=body)
        return Chat.model_validate(data)

    def get(self, *, chat_id: str) -> Chat:
        """Get a single chat by ID, including its ``messages``."""
        data = self._client._request("GET", f"/chats/{chat_id}")
        return Chat.model_validate(data)

    def delete(self, *, chat_id: str) -> None:
        """Delete a chat."""
        self._client._request("DELETE", f"/chats/{chat_id}")


class _IntegrationsMixin:
    """Partner integration listing."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def list(self, *, sandbox_id: str | None = None) -> dict:
        """List integrations and per-env execution capability."""
        params = {"sandbox_id": sandbox_id} if sandbox_id else None
        return self._client._request("GET", "/integrations", params=params)


class _ActionsMixin:
    """Action verbs: intent / execute / score / optimize."""

    def __init__(self, client: Kredit) -> None:
        self._client = client

    def intent(self, *, agent_id: str, action: str, estimated_cost: float = 0.0) -> dict:
        """Dry-run the trust layer (no debit, no record)."""
        return self._client._request(
            "POST",
            "/actions/intent",
            json={"agent_id": agent_id, "action": action, "estimated_cost": estimated_cost},
        )

    def execute(
        self,
        *,
        agent_id: str,
        action: str,
        provider: str | None = None,
        estimated_cost: float = 0.0,
        type: str = "api_call",
    ) -> dict:
        """Execute a payment/api/tool action (env-gated)."""
        body: dict[str, Any] = {
            "agent_id": agent_id,
            "action": action,
            "estimated_cost": estimated_cost,
            "type": type,
        }
        if provider:
            body["provider"] = provider
        return self._client._request("POST", "/actions/execute", json=body)

    def run(
        self,
        *,
        agent_id: str,
        action: str,
        provider: str | None = None,
        estimated_cost: float = 0.0,
        type: str = "api_call",
        outcome: str = "success",
    ) -> dict:
        """Run the full 6-stage trusted path in one shot (env-gated)."""
        body: dict[str, Any] = {
            "agent_id": agent_id,
            "action": action,
            "estimated_cost": estimated_cost,
            "type": type,
            "outcome": outcome,
        }
        if provider:
            body["provider"] = provider
        return self._client._request("POST", "/actions/run", json=body)

    def score_trust(self, *, agent_id: str) -> dict:
        """Recompute and return an agent's trust score."""
        return self._client._request("POST", "/actions/score", json={"agent_id": agent_id})

    def optimize(self, *, sandbox_id: str, period: str = "1mo", apply: bool = True) -> dict:
        """Run a predictive simulation and tighten projected overspenders."""
        return self._client._request(
            "POST",
            "/actions/optimize",
            json={"sandbox_id": sandbox_id, "period": period, "apply": apply},
        )


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
                "User-Agent": "kredit-python/0.7.8",
            },
            timeout=self._timeout,
        )

        self.orgs = _OrgsMixin(self)
        self.agents = _AgentsMixin(self)
        self.wallet = _WalletMixin(self)
        self.rules = _RulesMixin(self)
        self.transactions = _TransactionsMixin(self)
        self.sandboxes = _SandboxesMixin(self)
        self.simulations = _SimulationsMixin(self)
        self.priors = _PriorsMixin(self)
        self.workflows = _WorkflowsMixin(self)
        self.environments = _EnvironmentsMixin(self)
        self.chats = _ChatsMixin(self)
        self.integrations = _IntegrationsMixin(self)
        self.actions = _ActionsMixin(self)

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

    def _stream(self, path: str) -> Iterator[dict]:
        """Stream Server-Sent Events from `path`, yielding parsed `data:` dicts.

        Reuses the client's base url and auth headers. Stops after a `done`
        event. Uses no read timeout so long-lived streams aren't cut off.
        """
        # SSE streams are long-lived; disable the read timeout but keep the
        # connect timeout so a dead server still fails fast.
        stream_timeout = httpx.Timeout(self._timeout, read=None)
        with self._http.stream("GET", path, timeout=stream_timeout) as resp:
            if resp.status_code >= 400:
                resp.read()
                self._handle_response(resp)
            for line in resp.iter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[len("data:") :].strip()
                if not payload:
                    continue
                try:
                    event = _json.loads(payload)
                except ValueError:
                    continue
                yield event
                if event.get("type") == "done":
                    break

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

    def fleet(
        self, *, mode: str | None = None, environment_id: str | None = None
    ) -> FleetOverview:
        """Get fleet-level overview stats.

        Args:
            mode: Optional mode to scope the overview
                ("simulation", "preview", or "production").
            environment_id: Optional environment to scope the overview.

        Returns:
            FleetOverview with aggregate metrics across all agents.
        """
        params: dict[str, str] = {}
        if mode is not None:
            params["mode"] = mode
        if environment_id is not None:
            params["environment_id"] = environment_id
        data = self._request("GET", "/fleet/overview", params=params or None)
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
