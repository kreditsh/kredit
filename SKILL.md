# Kredit SDK Skill

Use this skill when the user wants to add financial risk management, spending controls, or guardrails to AI agents. Kredit provides wallets, rules, credit scoring, and spend tracking.

## When to Use

- User wants to control how much an AI agent can spend
- User needs per-API spending limits or rate limits for agents
- User wants to track agent spending and block risky transactions
- User asks about agent wallets, budgets, or credit scores
- User wants to set up rules like "max $500 per flight booking" or "max 50 OpenAI calls per hour"

## Install

```bash
pip install kredit          # Python
npm i @kredit/kredit        # JavaScript
curl -sSL https://kredit.sh/install | sh  # CLI
```

## Authentication

```bash
# CLI login (opens browser, saves key to ~/.kredit/config)
kredit login

# Or set env var
export KREDIT_API_KEY=kr_live_...
```

## Core Concepts

### Agent
An autonomous program that spends money. Has a wallet, rules, credit score, and priority level.

### Wallet
Balance and global spending limits:
- `balance` — current dollars available
- `budget` — total allocated dollars
- `max_per_txn` — max dollars per single transaction (0 = unlimited)
- `daily_spend_limit` — max dollars per day (0 = unlimited)

### Rules
Per-action spending limits with pattern matching:
- `match` — fnmatch pattern (`openai.*`, `flight.*`, `*`)
- `max_cost_per_txn` — max dollars per call
- `daily_spend_limit` — max dollars per day on matched actions
- `hourly_rate_limit` — max calls per hour on matched actions
- Most specific rule wins (`flight.*` beats `*`)

### Priority
- `normal` — blocked when limits hit
- `high` — auto-increase wallet when low
- `critical` — never blocked

### Credit Score (300-850)
- 600+ = active
- 400-600 = throttled
- <400 = frozen

## Python Usage

```python
from kredit import Kredit

kredit = Kredit(api_key="kr_live_...")

# Create org + agent
org = kredit.orgs.create(name="my-team")
agent = kredit.agents.create(
    org="my-team",
    name="research-bot",
    priority="normal",
    wallet={"balance": 100, "budget": 100, "max_per_txn": 10, "daily_spend_limit": 50},
    rules=[
        {"name": "OpenAI", "match": "openai.*", "max_cost_per_txn": 5, "daily_spend_limit": 30, "hourly_rate_limit": 50},
        {"name": "Default", "match": "*", "max_cost_per_txn": 10, "daily_spend_limit": 50, "hourly_rate_limit": 100},
    ],
)

# Before any paid action: check
result = kredit.check(agent_id=agent.id, action="openai.chat", estimated_cost=2.50)
if result.status == "allowed":
    # do the action...
    kredit.report(transaction_id=result.transaction_id, outcome="success", actual_cost=2.50)
else:
    print(f"Blocked: {result.block_reason}")

# Manage rules
kredit.agents.add_rule(agent.id, {"name": "Flights", "match": "flight.*", "max_cost_per_txn": 500})
rules = kredit.agents.list_rules(agent.id)
kredit.agents.remove_rule(agent.id, rule_id="rule_abc")

# Check score
score = kredit.score(agent_id=agent.id)
```

## JavaScript Usage

```typescript
import { Kredit } from "@kredit/kredit";

const kredit = new Kredit({ apiKey: "kr_live_..." });

const agent = await kredit.agents.create({
  org: "my-team",
  name: "research-bot",
  wallet: { balance: 100, budget: 100, max_per_txn: 10, daily_spend_limit: 50 },
  rules: [
    { name: "OpenAI", match: "openai.*", max_cost_per_txn: 5, daily_spend_limit: 30, hourly_rate_limit: 50 },
  ],
});

const result = await kredit.check({ agentId: agent.id, action: "openai.chat", estimatedCost: 2.5 });
if (result.status === "allowed") {
  // do action...
  await kredit.report({ transactionId: result.transaction_id, outcome: "success", actualCost: 2.5 });
}
```

## CLI Usage

```bash
kredit orgs create --name=my-team
kredit agents create --org=my-team --name=bot-01
kredit rules add --agent=ID --name="OpenAI" --match="openai.*" --max-cost=5 --daily=30 --hourly=50
kredit check --agent=ID --action=openai.chat --cost=2.50
kredit report --agent=ID --txn=TXN_ID --outcome=success --cost=2.50
kredit score --agent=ID
kredit rules list --agent=ID
kredit rules remove --agent=ID --rule=RULE_ID
```

## API Endpoints

Base: `https://api.kredit.sh` | Auth: `Authorization: Bearer kr_live_...`

- `POST /check` — risk evaluation
- `POST /report` — report outcome
- `POST /agents` — create agent (with wallet, rules, priority)
- `PUT /agents/:id` — update agent
- `DELETE /agents/:id` — delete agent
- `POST /agents/:id/rules` — add rule
- `PUT /agents/:id/rules/:rule_id` — update rule
- `DELETE /agents/:id/rules/:rule_id` — delete rule
- `GET /agents/:id/score` — credit score
- `POST /orgs` — create org
- `GET /fleet/overview` — fleet stats

## Docs

https://kredit.sh/docs
