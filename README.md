# Kredit

Identity and risk intelligence for AI agents. An agent says what it wants to do, in words. Kredit runs nine risk layers and the organization's own rules and answers allow, review, or deny, with the reason in plain English. A person steps in only where the mandate says so.

This repository holds the clients:

| Package | Path | Install |
|---|---|---|
| CLI | `packages/cli` | `curl -sSL kredit.sh/install \| sh` |
| MCP server | `packages/mcp` | `npm i -g kredit-mcp` |
| Python SDK | `packages/python` | `pip install kredit` |
| TypeScript SDK | `packages/typescript` | `npm i @kredit/kredit` |

The CLI and the MCP server speak the current platform API. The Python and TypeScript SDKs are being brought onto it; until then, call the API directly from those languages (see the docs at https://kredit.sh/docs).

## The model

- An **organization** owns agents, rules, integrations, documents and commerce workflows.
- An **agent** carries a versioned prompt, tools, guardrails (per-action cap, review threshold, allowed and blocked vendors) and rules. A new version waits until a person activates it on the console.
- A **rule** caps spend per window (`150/txn`, `500/day`, `2000/mo`) or hit rate per window, per organization or per agent. Each rule says whether a hit denies or asks a person.
- A **check** is one call before an action: `POST /check` with the agent id and the intent in words. The amount, merchant, rail and action are read from the words; anything stated outright is taken as given.
- **Two credentials.** An API key (`kr_live_`) acts as you. An agent token (`kat_`) is the agent's own, good for an hour at most; with it an agent may only check its own intents, read its own record and rotate its token.
- **Policy changes over an API key wait.** Deleting an organization or agent, adding or changing a rule, changing organization settings: each is filed as a pending approval that a person approves on the console under Review, with a passkey. The active policy stays in force until then.

## Get a key

```bash
kredit login          # opens the console, saves the key to ~/.kredit/config
```

Or create one on the console under API keys and export it:

```bash
export KREDIT_API_KEY=kr_live_...
```

## CLI

```bash
kredit orgs create --name "Acme"
kredit orgs use <org_id>

kredit agents create --name "Shopping agent" \
  --prompt "Buys running shoes for the team from the brands on the allow list." \
  --allowed nike.com,hoka.com,newbalance.com --max-per-action 150 --review-above 100 \
  --spend 500/day
# version 1 is pending: a person activates it on the console

kredit rules add --name "Per transaction cap" --spend 150/txn --on-hit deny
# filed as a pending approval

kredit tokens issue <agent_id> --ttl 60        # once the agent is verified (KYA)

kredit check --agent <agent_id> "buy a pair of Nike Pegasus 42 from nike.com for $130 by card"
# ALLOW  score 85  7.9 ms
# within the agent's limits
#   PASS  Agent identity: KYA verified via kredit
#   ...

kredit decisions list --limit 10
kredit approvals list
kredit commerce start <workflow_id> --choice you
```

Every command is listed in [`packages/cli/README.md`](packages/cli/README.md). Output is JSON unless the command has a human form (`check`), and `--json` always gives the raw response.

## MCP server

For Claude Code, Claude Desktop, or any MCP client. The agent calls `kredit_check` before it acts.

```bash
npm i -g kredit-mcp
export KREDIT_API_KEY=kr_live_...
claude mcp add kredit -- kredit-mcp serve
```

Fifty-six tools, grouped: session, organizations, rules, agents and versions, agent tokens, check, decisions, approvals, documents, integrations, audit and orders, environments and simulations, agentic commerce workflows and runs. Approving, promoting and reviewing are not tools: those need a person and a passkey on the console. The full list with one line each is in [`packages/mcp/README.md`](packages/mcp/README.md).

```text
kredit_check({ "agent_id": "ag_…", "intent": "pay the Nike invoice 8812, $1,850 by card" })
→ { "outcome": "allow", "score": 85, "reason": "within the agent's limits", "layers": [ …nine… ] }
```

## Configuration

| Variable | Meaning | Default |
|---|---|---|
| `KREDIT_API_KEY` | `kr_live_` key or `kat_` agent token | from `~/.kredit/config` |
| `KREDIT_API_URL` | API base | `https://api.kredit.sh` |
| `KREDIT_ORG` | default organization for the CLI | `org=` in `~/.kredit/config`, else your first organization |
| `KREDIT_DASHBOARD_URL` | where `kredit login` sends you | `https://kredit.sh` |

## Links

- Console: https://kredit.sh/console
- Docs: https://kredit.sh/docs
- npm: [kredit-mcp](https://www.npmjs.com/package/kredit-mcp), [@kredit/kredit](https://www.npmjs.com/package/@kredit/kredit)
- PyPI: [kredit](https://pypi.org/project/kredit/)
