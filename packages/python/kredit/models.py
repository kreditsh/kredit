"""Pydantic response models for the Kredit API."""

from __future__ import annotations

from pydantic import BaseModel, Field


def _flat_week() -> list[float]:
    return [1.0] * 7


def _flat_day() -> list[float]:
    return [1.0] * 24


class Org(BaseModel):
    """Organization."""
    id: str
    name: str
    mode: str = ""
    created_at: str | None = None


class Rule(BaseModel):
    """Agent spending rule."""
    id: str = ""
    name: str = ""
    match: str = "*"
    max_cost_per_txn: float = 0  # dollars, 0 = unlimited
    daily_spend_limit: float = 0  # dollars, 0 = unlimited
    hourly_rate_limit: int = 0  # calls per hour, 0 = unlimited
    enabled: bool = True


class Wallet(BaseModel):
    """Agent wallet."""
    balance: float = 0
    budget: float = 0
    max_per_txn: float = 0  # dollars, 0 = unlimited
    daily_spend_limit: float = 0  # dollars, 0 = unlimited


class Credit(BaseModel):
    """Agent credit score."""
    score: int = 700
    task_success_rate: float = 1.0
    cost_efficiency: float = 1.0
    violation_count: int = 0
    total_tasks: int = 0
    updated_at: str | None = None


class Agent(BaseModel):
    """Agent resource."""
    id: str
    org_id: str
    sandbox_id: str | None = None
    name: str
    mode: str = ""
    status: str = "active"
    priority: str = "normal"
    wallet: Wallet | None = None
    budgets: dict | None = None
    credit: Credit | None = None
    rules: list[Rule] = []
    created_at: str | None = None
    updated_at: str | None = None


class CheckResult(BaseModel):
    """Response from the risk-check endpoint."""
    transaction_id: str
    status: str
    risk_level: str
    block_reason: str | None = None
    agent_status: str | None = None
    wallet_balance: float | None = None
    credit_score: int | None = None


class ReportResult(BaseModel):
    """Response from the report endpoint."""
    transaction_id: str
    outcome: str
    new_score: int
    agent_status: str


class Transaction(BaseModel):
    """Transaction record."""
    id: str
    org_id: str
    agent_id: str
    mode: str = ""
    type: str = "api_call"
    action: str
    status: str
    risk_level: str
    block_reason: str | None = None
    estimated_cost: float
    actual_cost: float | None = None
    outcome: str | None = None
    metadata: dict | None = None
    timestamp: str | None = None


class ScoreResult(BaseModel):
    """Credit score result."""
    agent_id: str
    score: int
    task_success_rate: float | None = None
    cost_efficiency: float | None = None
    violation_count: int | None = None
    total_tasks: int | None = None
    status: str | None = None
    updated_at: str | None = None


class AgentSpend(BaseModel):
    """Agent spend breakdown."""
    agent_id: str
    total_spend: float
    daily_spend: float
    weekly_spend: float
    monthly_spend: float


class FleetOverview(BaseModel):
    """Fleet-level stats."""
    total_agents: int
    active_agents: int
    throttled_agents: int
    frozen_agents: int
    total_balance: float
    total_budget: float
    avg_credit_score: float
    total_spend: float
    daily_spend: float
    weekly_spend: float
    monthly_spend: float
    risk_events_blocked: int


class Policy(BaseModel):
    """Scoring policy."""
    id: str
    org_id: str
    scoring_weights: dict
    updated_at: str | None = None


class Event(BaseModel):
    """Agent event."""
    id: str
    type: str
    before: dict | None = None
    after: dict | None = None
    timestamp: str


class Gaussian(BaseModel):
    """Gaussian(mean, variance) distribution used by priors."""
    mean: float = 0.0
    variance: float = 0.0


class Seasonality(BaseModel):
    """Day-of-week (7) × hour-of-day (24) traffic multipliers."""
    dow: list[float] = Field(default_factory=_flat_week)   # Mon..Sun multipliers
    hour: list[float] = Field(default_factory=_flat_day)   # 0..23 multipliers


class Prior(BaseModel):
    """A distribution assumption that drives simulations, per sandbox+mode."""
    id: str
    sandbox_id: str
    mode: str = ""
    name: str = ""
    workflow_id: str = ""  # "" = applies to the whole sandbox+mode
    frequency: Gaussian = Field(default_factory=Gaussian)  # actions/hour
    cost: Gaussian = Field(default_factory=Gaussian)  # dollars per action
    transitions: dict = {}
    seasonality: Seasonality = Field(default_factory=Seasonality)
    source: str = "manual"  # "manual" | "learned"
    created_at: str | None = None
    updated_at: str | None = None


class WorkflowNode(BaseModel):
    """A node in a workflow graph."""
    id: str
    type: str = "tool"  # agent | llm | api | tool | payment
    label: str = ""
    integration: str = ""
    config: dict = {}


class WorkflowEdge(BaseModel):
    """A directed edge between two workflow nodes.

    ``from`` is a Python keyword, so it is exposed as ``from_`` with a
    populate-by-name alias.
    """
    model_config = {"populate_by_name": True}

    from_: str = Field(alias="from")
    to: str
    condition: str = ""


class Workflow(BaseModel):
    """An orchestration graph of nodes and edges, per sandbox+mode."""
    id: str
    sandbox_id: str
    mode: str = ""
    name: str = ""
    nodes: list[WorkflowNode] = []
    edges: list[WorkflowEdge] = []
    version: int = 1
    created_at: str | None = None
    updated_at: str | None = None


class Environment(BaseModel):
    """An environment within a sandbox.

    The 3 modes are standard environments (a sandbox has exactly one
    production environment); a simulation run/clone is an environment with
    mode "simulation" plus `simulation_id`/`parent_environment_id`.
    """
    id: str
    sandbox_id: str
    user_id: str = ""
    mode: str = ""  # simulation | preview | production
    name: str = ""
    simulation_id: str | None = None
    parent_environment_id: str | None = None
    active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class ChatComponent(BaseModel):
    """A rich component attached to a chat message."""
    type: str = ""
    ref_id: str = ""
    title: str = ""
    data: dict = {}


class Message(BaseModel):
    """A single message in a Kredit-agent chat."""
    id: str
    chat_id: str = ""
    role: str = ""  # user | assistant | tool | system
    content: str = ""
    tool_calls: list[dict] = []
    components: list[ChatComponent] = []
    created_at: str | None = None


class Chat(BaseModel):
    """A persisted Kredit-agent conversation.

    ``messages`` is populated by :meth:`Kredit.chats.get`; list responses omit it.
    """
    id: str
    sandbox_id: str | None = None
    mode: str = ""
    simulation_id: str | None = None
    title: str = ""
    messages: list[Message] = []
    created_at: str | None = None
    updated_at: str | None = None
