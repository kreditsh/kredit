# kredit skill

Use this skill when an AI agent is about to buy or pay for something, or when the user wants to put an agent under limits. kredit checks every action an agent takes with money before it runs, and answers allow, review (escalated to a person) or deny.

## When to use

- The user wants an agent that can buy or pay, with limits on what it may do
- The user wants rules: a spend cap, a rate cap, allowed or blocked vendors
- An agent is about to spend money and needs a decision first
- The user asks why something was escalated or denied

## Setup

```bash
npm i -g kredit-mcp
claude mcp add kredit -- kredit-mcp serve     # reads KREDIT_API_KEY
```

The key comes from the console at https://kredit.sh/console, under API keys. Base URL: `https://api.kredit.sh`. Auth: `Authorization: Bearer kr_live_…`.

## The three steps

### 1. Create an agent

An agent is a name, a brief, the tools it may use, and limits on one action.

```text
kredit_create_agent({
  "org_id": "…",
  "name": "procurement",
  "prompt": "Buys office hardware from approved vendors.",
  "tools": [{ "name": "payments", "scopes": ["payment.*"] }],
  "guardrails": { "max_per_action": 5000, "require_review_above": 2500 }
})
```

The agent comes back with its first version **pending** and its identity **unverified**. It cannot act yet. Without a tool whose scopes cover the action (`payment.*` for payments), every check is denied.

### 2. Add rules

```text
kredit_add_rule({
  "org_id": "…",
  "name": "Card cap",
  "type": "payment",
  "spend": { "amount": 5000, "window": "day" },
  "blocked": ["giftcards.example"],
  "on_hit": "deny"
})
```

| field | meaning |
|---|---|
| type | payment, api or tool: what the rule governs |
| spend | amount and window: txn, sec, min, hr, day, wk, mo, quarter, year |
| hit_rate | count and window: how often the action may happen |
| allowed, blocked | vendors or providers, by domain or name |
| on_hit | deny, or review to escalate to a person |

`kredit_add_rule` governs every agent in the organization. For one agent, propose a version that carries the rule with `kredit_propose_version`. Either way the change is **pending**.

### 3. A person verifies, in the console

You cannot do this step, and you must not try to. Tell the user, in these words or close to them:

> Open https://kredit.sh/console. Overview lists what is waiting on you: approve the agent's version and the rule. Then under Agents press "verify now" on the agent. Each one asks for Touch ID or Face ID.

Until a person has done this, the agent has no approved version and no verified identity, and checks on it are denied or escalated. Do not retry in a loop; wait for the user to say it is done, then read the agent again with `kredit_get_agent`.

## Check before every action

```text
kredit_check({
  "agent_id": "…",
  "intent": "buy 12 monitors at monitordepot.com for $4,188 by card"
})
```

Say what the agent wants to do in words. The amount, vendor, rail and action are read from them.

- `allow`: go ahead.
- `review`: escalated. A person decides in the console. Stop and tell the user; read the decision again later.
- `deny`: stop. Say the reason. Never work around a denial by splitting or rewording the action.

## The response

```json
{
  "id": "6aa9c9b21f4cc27614259db6",
  "agent_id": "6a9e5043480a787fa94b77ff",
  "agent_name": "procurement",
  "environment": "sandbox",
  "outcome": "review",
  "score": 85,
  "reason": "above the $2,500 review threshold, a person decides",
  "intent": {
    "action": "payment.card",
    "description": "buy 12 monitors at monitordepot.com for $4,188 by card",
    "amount": 4188,
    "currency": "USD",
    "merchant": { "name": "Monitor Depot", "domain": "monitordepot.com", "category": "hardware" },
    "payment_rail": "card"
  },
  "checks": [
    { "key": "identity", "label": "Identity", "status": "pass", "ok": true, "value": "verified", "layers": ["agent_identity", "business_identity"] },
    { "key": "mandate", "label": "Mandate", "status": "warn", "ok": false, "value": "above the $2,500 review threshold, a person decides", "layers": ["guardrails", "scope"] },
    { "key": "payee", "label": "Payee", "status": "pass", "ok": true, "value": "known and clear", "layers": ["compliance", "disputes"] },
    { "key": "behavior", "label": "Behavior", "status": "pass", "ok": true, "value": "in line with its history", "layers": ["intent", "financial", "fraud"] }
  ],
  "layers": [
    { "key": "agent_identity", "name": "Agent identity", "status": "pass", "detail": "KYA verified via kredit", "ms": 0.006, "provider": "kredit" },
    { "key": "business_identity", "name": "Business identity", "status": "pass", "detail": "KYB verified via kredit", "ms": 0.003, "provider": "kredit" },
    { "key": "intent", "name": "Intent risk analysis", "status": "pass", "detail": "intent consistent with the agent's brief", "ms": 0.015, "provider": "kredit" },
    { "key": "compliance", "name": "Compliance", "status": "pass", "detail": "no sanctions match across 1 list(s)", "ms": 0.016, "provider": "kredit" },
    { "key": "guardrails", "name": "Guardrails & policies", "status": "warn", "detail": "above the $2,500 review threshold, a person decides", "ms": 0.086, "provider": "kredit" },
    { "key": "scope", "name": "Scope & permissions", "status": "pass", "detail": "payment.card covered by tool payments", "ms": 0.006, "provider": "kredit" },
    { "key": "financial", "name": "Financial risk", "status": "pass", "detail": "in line with its history", "ms": 0.003, "provider": "kredit" },
    { "key": "fraud", "name": "Fraud", "status": "pass", "detail": "no fraud signals", "ms": 0.027, "provider": "kredit" },
    { "key": "disputes", "name": "Disputes & recovery", "status": "pass", "detail": "merchant dispute rate 0.6%", "ms": 0.008, "provider": "kredit" }
  ],
  "latency_ms": 0.97,
  "created_at": "2026-10-01T18:07:34.614271+00:00",
  "review": { "status": "pending", "by": null, "at": null, "note": null },
  "execution": null
}
```

Read `outcome` to act. Read `checks` to explain: four checks a person cares about, each the worst of the layers named in its `layers`. Read `layers` for the holistic risk: nine layers, each with what it found, who answered and how fast.

| check | asks | layers behind it |
|---|---|---|
| identity | Who is acting, and who stands behind it? | agent identity, business identity |
| mandate | Is it allowed to do this? | guardrails and policies, scope and permissions |
| payee | Is the other side safe to pay? | compliance, disputes and recovery |
| behavior | Is this how the agent normally acts? | intent risk analysis, financial risk, fraud |

When you report a decision to the user, lead with the outcome, then the check that was not ok and its `value`. Do not paste the layers unless asked.

## Docs

https://kredit.sh/docs
