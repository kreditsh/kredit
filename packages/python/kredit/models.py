"""Pydantic response models for the Kredit API."""

from __future__ import annotations

from pydantic import BaseModel


class Org(BaseModel):
    """Organization."""

    id: str
    name: str
    created_at: str | None = None


class AgentStatus(BaseModel):
    """Embedded agent status returned inside a CheckResult."""

    status: str
    score: int
    wallet_remaining: int
    rate_remaining: int


class Agent(BaseModel):
    """Agent resource."""

    id: str
    org_id: str
    name: str
    status: str | None = None
    score: int | None = None
    created_at: str | None = None


class CheckResult(BaseModel):
    """Response from the risk-check endpoint."""

    allow: bool
    risk_level: str
    status: str
    txn_id: str | None = None
    agent: AgentStatus | None = None


class Transaction(BaseModel):
    """Transaction record."""

    id: str
    agent_id: str
    action: str
    estimated_cost: int
    actual_cost: int | None = None
    outcome: str | None = None
    created_at: str | None = None


class Wallet(BaseModel):
    """Wallet resource."""

    agent_id: str
    balance: int
    budget: int
    spent: int | None = None


class ScoreResult(BaseModel):
    """Credit score result."""

    agent_id: str
    score: int
    risk_level: str
    factors: list[str] | None = None
