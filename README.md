# Kredit

Risk management for AI agents. Every agent gets a wallet, a credit score, and spending rules.

- **Wallets** — balance, budget, global spend limits
- **Rules** — per-action limits with pattern matching (`openai.*`, `flight.*`, `*`)
- **Credit scoring** — 300-850 score based on success rate, cost efficiency, compliance
- **Priority levels** — normal, high (auto-topup), critical (never blocked)

## Install

```bash
# CLI
curl -sSL https://kredit.sh/install | sh

# Python
pip install kredit

# JavaScript
npm i @kredit/kredit

# MCP (Claude Code / Claude Desktop)
npm i -g kredit-mcp
```

## Get Your API Key

```bash
# Via CLI (opens browser, creates key automatically)
kredit login

# Or from the dashboard: https://kredit.sh → API Key → Create New Key
```

## Quick Start

### CLI

```bash
# Create an org and agent
kredit orgs create --name=my-team
kredit agents create --org-name=my-team --name=research-bot

# Add spending rules
kredit rules add --agent-id=AGENT_ID --name="OpenAI cap" --match="openai.*" --max-cost-per-txn=5 --daily-spend-limit=100 --hourly-rate-limit=50
kredit rules add --agent-id=AGENT_ID --name="Default" --match="*" --max-cost-per-txn=10 --daily-spend-limit=500 --hourly-rate-limit=200

# Risk check before an API call
kredit check --agent-id=AGENT_ID --action=openai.chat --estimated-cost=2.50
# → { "status": "allowed", "risk_level": "low", "transaction_id": "..." }

# Report outcome
kredit report --transaction-id=TXN_ID --outcome=success --actual-cost=2.50

# Check credit score
kredit score --agent-id=AGENT_ID
```

### Python

```python
from kredit import Kredit

kredit = Kredit(api_key="kr_live_...")

# Create agent with wallet and rules
agent = kredit.agents.create(
    org_name="my-team",
    name="travel-bot",
    priority="high",
    wallet={"balance": 5000, "budget": 5000, "max_per_txn": 1000, "daily_spend_limit": 5000},
    rules=[
        {"name": "Flight cap", "match": "flight.*", "max_cost_per_txn": 800, "daily_spend_limit": 3000, "hourly_rate_limit": 10},
        {"name": "Default", "match": "*", "max_cost_per_txn": 500, "daily_spend_limit": 2000, "hourly_rate_limit": 50},
    ],
)

# Risk check
result = kredit.check(agent_id=agent.id, action="flight.booking", estimated_cost=450)

if result.status == "allowed":
    booking = book_flight(params)
    kredit.report(transaction_id=result.transaction_id, outcome="success", actual_cost=425)
else:
    print(f"Blocked: {result.block_reason}")
    # → "rule:Flight cap:max_cost_per_txn"
```

### JavaScript

```typescript
import { Kredit } from "@kredit/kredit";

const kredit = new Kredit({ apiKey: "kr_live_..." });

const agent = await kredit.agents.create({
  orgName: "my-team",
  name: "travel-bot",
  priority: "high",
  wallet: { balance: 5000, budget: 5000, max_per_txn: 1000, daily_spend_limit: 5000 },
  rules: [
    { name: "Flight cap", match: "flight.*", max_cost_per_txn: 800, daily_spend_limit: 3000, hourly_rate_limit: 10 },
    { name: "Default", match: "*", max_cost_per_txn: 500, daily_spend_limit: 2000, hourly_rate_limit: 50 },
  ],
});

const result = await kredit.check({ agentId: agent.id, action: "flight.booking", estimatedCost: 450 });

if (result.status === "allowed") {
  const booking = await bookFlight(params);
  await kredit.report({ transactionId: result.transaction_id, outcome: "success", actualCost: 425 });
}
```

## Rules

Rules define per-action spending limits. Each rule has a `match` pattern (fnmatch) and limits:

```json
{
  "name": "OpenAI cap",
  "match": "openai.*",
  "max_cost_per_txn": 5.0,
  "daily_spend_limit": 100.0,
  "hourly_rate_limit": 50,
  "enabled": true
}
```

When an action is checked, the most specific matching rule applies. `flight.*` beats `*` for `flight.booking`.

```bash
kredit rules add --agent-id=ID --name="Flight cap" --match="flight.*" --max-cost-per-txn=800 --daily-spend-limit=3000 --hourly-rate-limit=10
kredit rules list --agent-id=ID
kredit rules remove --agent-id=ID --rule-id=RULE_ID
```

## Wallet

Each agent has a wallet with global limits:

| Field | Description |
|-------|-------------|
| `balance` | Current balance (dollars) |
| `budget` | Total allocated (dollars) |
| `max_per_txn` | Global max per transaction, 0 = unlimited |
| `daily_spend_limit` | Global max spend per day, 0 = unlimited |

## Priority

| Level | Behavior |
|-------|----------|
| `normal` | Blocked when limits hit |
| `high` | Auto-increase wallet by 50% when balance < 10% of budget |
| `critical` | Never blocked — always allowed, logs warning |

## Credit Score

Agents earn a credit score (300-850) based on:
- Task success rate (30%)
- Cost efficiency (25%)
- Violation rate (20%)
- Spend consistency (15%)
- Tenure bonus (10%)

Score thresholds:
- **600+** → active
- **400-600** → throttled (reduced limits)
- **<400** → frozen (blocked, needs human approval)

## Check Order

1. Priority override (critical → always allow)
2. Frozen status check
3. High priority auto-increase
4. Global wallet: `max_per_txn`
5. Global wallet: `daily_spend_limit`
6. Wallet balance
7. Rules: match action pattern → most specific wins
8. Credit score < 400 → block
9. Anomaly detection (10x avg cost)
10. Score-based risk escalation

## API

Base URL: `https://api.kredit.sh`

All requests require `Authorization: Bearer kr_live_...` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | /check | Risk evaluation |
| POST | /report | Report outcome |
| GET/POST | /agents | List/create agents |
| PUT | /agents/:id | Update agent |
| DELETE | /agents/:id | Delete agent |
| GET/POST | /agents/:id/rules | List/add rules |
| PUT | /agents/:id/rules/:rule_id | Update rule |
| DELETE | /agents/:id/rules/:rule_id | Delete rule |
| GET | /agents/:id/score | Credit score |
| GET | /agents/:id/spend | Spend breakdown |
| GET/POST | /orgs | List/create orgs |
| GET | /wallets/:id | Get wallet |
| PUT | /wallets/:id | Update wallet |
| GET | /fleet/overview | Fleet stats |
| GET | /transactions | Audit log |

## MCP (Claude Code / Claude Desktop)

```bash
npm i -g kredit-mcp
```

### Setup

```bash
# Add to Claude Code
claude mcp add kredit -- kredit-mcp serve --api-key=kr_live_...

# Or via env
export KREDIT_API_KEY=kr_live_...
claude mcp add kredit -- kredit-mcp serve
```

### Tools (22 total)

**Organizations**

| Tool | Description |
|------|-------------|
| `kredit_list_orgs` | List all organizations |
| `kredit_create_org` | Create an organization |
| `kredit_rename_org` | Rename an organization |
| `kredit_delete_org` | Delete an organization |

**Agents**

| Tool | Description |
|------|-------------|
| `kredit_list_agents` | List agents (filter by org) |
| `kredit_create_agent` | Create agent with wallet, priority, rules |
| `kredit_get_agent` | Get agent details |
| `kredit_update_agent` | Update name, priority, wallet |
| `kredit_delete_agent` | Delete an agent |

**Rules**

| Tool | Description |
|------|-------------|
| `kredit_list_rules` | List rules for an agent |
| `kredit_add_rule` | Add a spending rule (match pattern + limits) |
| `kredit_update_rule` | Update a rule |
| `kredit_delete_rule` | Delete a rule |

**Risk Check & Report**

| Tool | Description |
|------|-------------|
| `kredit_check` | Risk evaluation before a paid action |
| `kredit_report` | Report outcome after action completes |

**Score & Wallet**

| Tool | Description |
|------|-------------|
| `kredit_score` | Get credit score and stats |
| `kredit_wallet` | Get wallet balance and limits |
| `kredit_update_wallet` | Update wallet balance, budget, limits |

**Fleet & Logs**

| Tool | Description |
|------|-------------|
| `kredit_fleet` | Fleet overview stats |
| `kredit_transactions` | List transactions (audit log) |
| `kredit_events` | Agent state change history |

### Example

After setup, Claude can:

```
"Create an org called my-team, add an agent called travel-bot
with a $5000 budget and a rule that caps flight bookings at $800"
```

Claude will call `kredit_create_org` → `kredit_create_agent` → `kredit_add_rule`.

Then before any paid action, Claude calls `kredit_check` → allowed → does action → `kredit_report` → score updates.

## Links

- **Dashboard**: https://kredit.sh
- **Docs**: https://kredit.sh/docs
- **npm**: [@kredit/kredit](https://www.npmjs.com/package/@kredit/kredit)
- **PyPI**: [kredit](https://pypi.org/project/kredit/)
- **MCP**: [kredit-mcp](https://www.npmjs.com/package/kredit-mcp)
