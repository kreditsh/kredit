# @kredit/kredit

Risk management SDK for AI agents. Wallets, spending rules, and kredit scores.

## Install

```bash
npm i @kredit/kredit
```

## Quick Start

```typescript
import { Kredit } from "@kredit/kredit";

const kredit = new Kredit({ apiKey: "kr_live_..." });

const result = await kredit.check({ agentId: "bot-01", action: "openai.chat", estimatedCost: 2.50 });

if (result.status === "allowed") {
  // do the action...
  await kredit.report({ transactionId: result.transaction_id, outcome: "success", actualCost: 2.40 });
}
```

## Organizations

```typescript
const org = await kredit.orgs.create({ name: "my-team" });
const orgs = await kredit.orgs.list();
```

## Agents

```typescript
const agent = await kredit.agents.create({
  orgName: "my-team",
  name: "research-bot",
  priority: "high",
  wallet: { balance: 5000, budget: 5000, max_per_txn: 100, daily_spend_limit: 1000 },
});

const agents = await kredit.agents.list({ orgId: org.id });
const detail = await kredit.agents.get({ agentId: agent.id });
await kredit.agents.update({ agentId: agent.id, priority: "critical" });
await kredit.agents.delete({ agentId: agent.id });
```

## Rules

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

## Check & Report

```typescript
const result = await kredit.check({
  agentId: agent.id,
  action: "flight.booking",
  estimatedCost: 450,
  type: "api_call",
  metadata: { provider: "kayak" },
});

if (result.status === "allowed") {
  const booking = await bookFlight(params);
  await kredit.report({
    transactionId: result.transaction_id,
    outcome: "success",
    actualCost: 425,
  });
} else {
  console.log(`Blocked: ${result.block_reason}`);
}
```

## Score, Spend & Fleet

```typescript
const score = await kredit.score({ agentId: agent.id });
const spend = await kredit.spend({ agentId: agent.id });
const fleet = await kredit.fleet();
const txns = await kredit.transactions.list({ agentId: agent.id, status: "blocked" });
```

## Wallet

```typescript
const wallet = await kredit.wallet.get({ agentId: agent.id });
await kredit.wallet.update({ agentId: agent.id, budget: 10000, daily_spend_limit: 2000 });
```

## Authentication

```typescript
// Pass directly
const kredit = new Kredit({ apiKey: "kr_live_..." });

// Or use env var: KREDIT_API_KEY
const kredit = new Kredit();

// Or use ~/.kredit/config file (created by `kredit login`)
const kredit = new Kredit();
```

## Links

- [Dashboard](https://kredit.sh)
- [Docs](https://kredit.sh/docs)
- [GitHub](https://github.com/kreditsh/kredit)
- [PyPI](https://pypi.org/project/kredit/)
- [MCP](https://www.npmjs.com/package/kredit-mcp)
