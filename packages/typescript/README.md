# @kredit/kredit

Risk management SDK for AI agents. Wallets, spending rules, and kredit scores.

## Install

```bash
npm i @kredit/kredit
```

## Authentication

```typescript
import { Kredit } from "@kredit/kredit";

// Pass directly
const kredit = new Kredit({ apiKey: "kr_live_..." });

// Or use env var: KREDIT_API_KEY
const kredit = new Kredit();

// Or use ~/.kredit/config file (created by `kredit login`)
const kredit = new Kredit();
```

## Full Pipeline

### 1. Create Organization

```typescript
const org = await kredit.orgs.create({ name: "my-team" });
const orgs = await kredit.orgs.list();
```

### 2. Create Agent with Wallet

```typescript
const agent = await kredit.agents.create({
  orgName: "my-team",
  name: "travel-bot",
  priority: "high",
  wallet: { balance: 5000, budget: 5000, max_per_txn: 1000, daily_spend_limit: 5000 },
  rules: [
    { name: "Flight cap", match: "flight.*", max_cost_per_txn: 800, daily_spend_limit: 3000, hourly_rate_limit: 10 },
    { name: "Default", match: "*", max_cost_per_txn: 100, daily_spend_limit: 500, hourly_rate_limit: 200 },
  ],
});
```

### 3. Add More Rules

```typescript
await kredit.rules.add({
  agentId: agent.id,
  name: "OpenAI cap",
  match: "openai.*",
  max_cost_per_txn: 5,
  daily_spend_limit: 100,
  hourly_rate_limit: 50,
});

const rules = await kredit.rules.list({ agentId: agent.id });
await kredit.rules.update({ agentId: agent.id, ruleId: rules[0].id, max_cost_per_txn: 10 });
await kredit.rules.remove({ agentId: agent.id, ruleId: rules[0].id });
```

### 4. Check Risk Before Any Paid Action

```typescript
const result = await kredit.check({
  agentId: agent.id,
  action: "flight.booking",
  estimatedCost: 450,
  type: "api_call",                    // api_call | compute | data | tool | other
  metadata: { provider: "kayak" },     // optional context
});

// result.status: "allowed" | "blocked" | "flagged"
// result.risk_level: "low" | "medium" | "high" | "critical"
// result.block_reason: "rule:Flight cap:max_cost_per_txn" | "wallet_empty" | "agent_frozen" | null
// result.transaction_id: "txn_..."
// result.wallet_balance: 4550
// result.credit_score: 742
```

### 5. Execute Action & Report Outcome

```typescript
if (result.status === "allowed") {
  const booking = await bookFlight(params);
  await kredit.report({
    transactionId: result.transaction_id,
    outcome: "success",                // success | failure | partial
    actualCost: 425,                   // optional — adjusts wallet if different from estimate
  });
} else {
  console.log(`Blocked: ${result.block_reason}`);
}
```

### 6. Check Kredit Score

```typescript
const score = await kredit.score({ agentId: agent.id });
// score.score: 742 (300-850)
// score.status: "active" | "throttled" | "frozen"
// score.task_success_rate: 0.95
// score.cost_efficiency: 0.92
// score.violation_count: 2
// score.total_tasks: 48
```

### 7. Check Spend

```typescript
const spend = await kredit.spend({ agentId: agent.id });
// spend.total_spend: 12450
// spend.daily_spend: 890
// spend.weekly_spend: 4200
// spend.monthly_spend: 12450
```

### 8. Fleet Overview

```typescript
const fleet = await kredit.fleet();
// fleet.total_agents: 15
// fleet.active_agents: 10
// fleet.throttled_agents: 3
// fleet.frozen_agents: 2
// fleet.total_spend: 52400
// fleet.risk_events_blocked: 124
// fleet.avg_credit_score: 680
```

## All Agent Methods

```typescript
const agents = await kredit.agents.list();                       // all agents
const agents = await kredit.agents.list({ orgId: org.id });      // by org
const agent = await kredit.agents.get({ agentId: "agt_..." });
await kredit.agents.update({ agentId: agent.id, priority: "critical" });
await kredit.agents.update({ agentId: agent.id, wallet: { budget: 10000 } });
await kredit.agents.delete({ agentId: agent.id });
```

## All Wallet Methods

```typescript
const wallet = await kredit.wallet.get({ agentId: agent.id });
await kredit.wallet.update({
  agentId: agent.id,
  balance: 5000,
  budget: 10000,
  max_per_txn: 500,
  daily_spend_limit: 2000,
});
```

## All Transaction Methods

```typescript
const txns = await kredit.transactions.list();                                  // all
const txns = await kredit.transactions.list({ agentId: agent.id });             // by agent
const txns = await kredit.transactions.list({ status: "blocked" });             // blocked only
const txns = await kredit.transactions.list({ riskLevel: "high", limit: 10 }); // high risk
```

## Core Concepts

**Wallet** — balance, budget, max_per_txn, daily_spend_limit (all in dollars, 0 = unlimited)

**Rules** — per-action limits with fnmatch patterns (`openai.*`, `flight.*`, `*`). Most specific wins.

**Priority** — `normal` (blocked at limits), `high` (auto-topup at 10%), `critical` (never blocked)

**Kredit Score** — 300-850 composite. 600+ = active, 400-600 = throttled, <400 = frozen.

**Check Order** — priority → frozen check → auto-topup → wallet limits → rules → score → anomaly detection

## Links

- [Dashboard](https://kredit.sh)
- [Docs](https://kredit.sh/docs)
- [Skill Reference](https://kredit.sh/skill)
- [GitHub](https://github.com/kreditsh/kredit)
- [PyPI](https://pypi.org/project/kredit/)
- [MCP](https://www.npmjs.com/package/kredit-mcp)
