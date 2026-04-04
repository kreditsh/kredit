"""Pydantic response models for the Kredit API."""

from __future__ import annotations

from pydantic import BaseModel


class Org(BaseModel):
    """Organization."""

    id: str
    name: str
    created_at: str | None = None


class ApiLimit(BaseModel):
    """Per-API guardrails."""

    max_cost_per_txn: float = 0  # max allowed cost per call (dollars), 0 = unlimited
    daily_spend_limit: float = 0  # max dollars per day on this API, 0 = unlimited
    hourly_rate_limit: int = 0  # max calls per hour, 0 = unlimited


class Wallet(BaseModel):
    """Agent wallet."""

    balance: float = 0
    budget: float = 0
    max_per_txn: float = 0  # global max per transaction (dollars), 0 = unlimited
    daily_spend_limit: float = 0  # global max spend per day (dollars), 0 = unlimited


class Credit(BaseModel):
    """Agent credit score."""

    score: int = 700
    task_success_rate: float = 1.0
    cost_efficiency: float = 1.0
    violation_count: int = 0
    total_tasks: int = 0


class Agent(BaseModel):
    """Agent resource."""

    id: str
    org_id: str
    name: str
    status: str = "active"
    priority: str = "normal"
    wallet: Wallet | None = None
    credit: Credit | None = None
    api_limits: dict[str, ApiLimit] | None = None
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


class Transaction(BaseModel):
    """Transaction record."""

    id: str
    agent_id: str
    action: str
    estimated_cost: float
    actual_cost: float | None = None
    outcome: str | None = None
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
