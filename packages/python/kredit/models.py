"""Pydantic response models for the Kredit API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Org(BaseModel):
    """Organization."""
    id: str
    name: str
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
    name: str
    status: str = "active"
    priority: str = "normal"
    wallet: Wallet | None = None
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
