# kredit-mcp

MCP server for Kredit: identity and risk checks for AI agents that spend money, from Claude Code and Claude Desktop.

## Install

```bash
npm i -g kredit-mcp
```

## Setup

```bash
# An API key from the console (Developer), or an agent token issued for one agent
export KREDIT_API_KEY=kr_live_...

# Add it to Claude Code
claude mcp add kredit -- kredit-mcp serve

# Or pass the key on the command line
claude mcp add kredit -- kredit-mcp serve --api-key=kr_live_...

# Point at another server (default https://api.kredit.sh)
claude mcp add kredit -- kredit-mcp serve --api-url=http://localhost:8666
```

Claude Desktop reads the same command from its MCP settings.

## The model

An **organization** owns everything: its agents, its rules, its integrations (VGS and other providers), its documents, and its commerce workflows. Every tool that works inside an organization takes `org_id`. There is no activated organization on the server side; pass the id.

An **agent** has a brief (its prompt), tools, rules and guardrails, kept as versions. A version applies once a person approves it on the console.

A **rule** is a spend cap over a window (`txn`, `sec`, `min`, `hr`, `day`, `wk`, `mo`), a hit-rate cap, or a vendor allow or block list. Each rule says what a hit does: `deny`, or `review` so a person decides.

### Two kinds of credential

| Credential | Who holds it | What it may do |
|---|---|---|
| API key `kr_live_...` | The operator | Everything below, subject to approvals |
| Agent token `kat_...` | One agent, an hour at most | `kredit_check` for itself, read its own agent, rotate its own token |

### What waits for a person

Over an API key, some changes do not apply at once. Deleting an organization or an agent, adding, changing or removing a rule, changing organization settings, and proposing a new agent version are recorded as **pending approvals**. A person approves them on the console's Review tab with a passkey, one at a time or all at once. Until then the active policy stays in force.

Reviews of decisions and of commerce runs are also decided by a person on the console. This server lists them; it cannot approve them.

## Tools

**Session**
- `kredit_whoami`: the user behind the key and whether the session is passkey-verified.

**Organizations**
- `kredit_list_orgs`, `kredit_get_org`, `kredit_create_org`, `kredit_update_org`, `kredit_delete_org`, `kredit_org_summary`.
- `kredit_seed_demo`: the demo organization with its agents, documents and workflows.

**Rules**
- `kredit_list_rules`, `kredit_add_rule`, `kredit_update_rule`, `kredit_delete_rule`: organization rules with a spend cap, a hit-rate cap, allow and block lists, and deny or review on a hit.

**Agents**
- `kredit_list_agents`, `kredit_get_agent`, `kredit_create_agent`, `kredit_update_agent` (rename, or set status `frozen` or `active`), `kredit_delete_agent`.
- `kredit_propose_version`, `kredit_approve_version`, `kredit_reject_version`, `kredit_promote_agent`.
- `kredit_verify_agent`: KYA with a provider.
- `kredit_agent_decisions`: the agent's decisions, newest first.

**Agent tokens**
- `kredit_issue_agent_token`: a short-lived token for one agent, returned once. The agent must be KYA verified.
- `kredit_list_agent_tokens`, `kredit_revoke_agent_token`.

**The check**
- `kredit_check`: ask before acting. The intent is text. Returns `allow`, `deny` or `review`, a score, a reason in plain English, and nine risk layers.

**Decisions**
- `kredit_list_decisions` (filter by agent, outcome, environment), `kredit_get_decision`, `kredit_list_reviews`, `kredit_execute_decision`.

**Approvals**
- `kredit_list_approvals`: policy changes and deletes waiting for a person.

**Documents**
- `kredit_list_documents`, `kredit_add_document` (text or URL; tag `sanctions` for the compliance layer), `kredit_search_documents`, `kredit_delete_document`.

**Integrations**
- `kredit_list_integrations`: each provider's mode, whether it is connected, and the key fields it needs.
- `kredit_update_integration`: set keys by field name, the mode, or enable it.
- `kredit_test_integration`.

**Audit and orders**
- `kredit_audit`, `kredit_list_orders`.

**Environments and simulations**
- `kredit_list_environments`, `kredit_create_environment`, `kredit_delete_environment`.
- `kredit_run_simulation`, `kredit_list_simulations`, `kredit_get_simulation`, `kredit_stop_simulation`.

**Agentic commerce**
- `kredit_list_workflows`, `kredit_update_workflow`.
- `kredit_start_run`: the agent searches and ranks options; the run waits at the choice or picks itself. Pass `from_run_id` to reuse an earlier search.
- `kredit_list_runs`, `kredit_get_run`, `kredit_choose_option`, `kredit_rechoose_option`, `kredit_stop_run`.

## A worked example

Create an organization and an agent that may only buy from a few shoe brands, with a daily budget.

```
kredit_create_org {name: "Acme"}
→ {id: "org_1", ...}

kredit_create_agent {
  org_id: "org_1",
  name: "Shopping agent",
  prompt: "Buy running gear for the team at the best price.",
  guardrails: {
    allowed_merchants: ["nike.com", "hoka.com", "newbalance.com"],
    require_review_above: 100
  }
}
→ {id: "agent_1", ...}   the first version waits for a person to approve it

kredit_add_rule {
  org_id: "org_1",
  name: "Daily budget",
  spend: {amount: 500, window: "day"},
  on_hit: "deny"
}
→ waits as a pending approval on the Review tab
```

A person approves the version and the rule on the console, and verifies the agent with a passkey. Then give the agent its own credential:

```
kredit_issue_agent_token {agent_id: "agent_1", ttl_minutes: 60}
→ {token: "kat_...", expires_at: "..."}   shown once
```

The agent runs with `KREDIT_API_KEY=kat_...` and asks before it buys:

```
kredit_check {
  agent_id: "agent_1",
  intent: "Buy the Pegasus 42 from nike.com for $131.97 by card"
}
→ {
  outcome: "review",
  score: 85,
  reason: "above the $100 review threshold, a person decides",
  layers: [
    {key: "agent_identity", status: "pass", detail: "KYA verified via kredit"},
    {key: "business_identity", status: "pass", ...},
    {key: "intent", status: "pass", detail: "intent consistent with the agent's brief"},
    {key: "compliance", status: "pass", ...},
    {key: "guardrails", status: "warn", detail: "above the $100 review threshold, a person decides"},
    {key: "scope", ...}, {key: "financial", ...}, {key: "fraud", ...}, {key: "disputes", ...}
  ]
}
```

The same purchase from adidas.com is denied: the vendor is not on the list. A second pair the same day that takes the total past $500 is denied by the daily budget. A review waits for a person on the console; `kredit_list_reviews` shows what is waiting.

## Development

```bash
npm run build
npm test
npm run lint
```

## License

MIT
