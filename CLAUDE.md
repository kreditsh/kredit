# Kredit SDK

Financial risk management SDK for AI agents. Wallets, credit scoring, and spend authorization.

## What this is

Kredit is a thin client SDK that talks to kredit-server over REST. It provides spend tracking, risk detection, credit scoring, and dynamic budget allocation for agent fleets.

Monorepo containing:
- `packages/python/` — Python SDK (published to PyPI as `kredit`)
- `packages/typescript/` — TypeScript SDK (published to npm as `kredit`)
- `packages/cli/` — Shell CLI (`kredit check`, `kredit report`, `kredit agents`, `kredit orgs`)

## Core API surface

```python
kredit = Kredit(api_key="kr_live_...")

# Create org (or pass org name when creating agents)
org = kredit.orgs.create(name="research-team")

# Create agent — by org_id or org name
agent = kredit.agents.create(org_id="6648...", name="research-bot-01")
agent = kredit.agents.create(org="research-team", name="research-bot-01")

# Risk gate — call before every paid API call
result = kredit.check(agent_id="...", action="serp_api.search", estimated_cost=1)
# → { allow: true, risk_level: "low", agent: { status, score, wallet_remaining, rate_remaining } }

# Outcome reporting — call after action completes
kredit.report(agent_id="...", txn_id="...", outcome="success", actual_cost=1)

# Read score
kredit.score(agent_id="...")

# Wallet management
kredit.wallet.get(agent_id="...")
kredit.wallet.set_budget(agent_id="...", budget=500000)  # cents
```

Both Python and TypeScript SDKs must have identical API surfaces. Python is the reference implementation.

## Tech stack

- Python: Python 3.10+, httpx for HTTP, pydantic for models
- TypeScript: Node 18+, native fetch, zod for validation

## Code style

- Python: ruff for linting/formatting, pytest for tests
- TypeScript: biome for linting/formatting, vitest for tests
- No classes unless necessary. Prefer simple functions and typed dicts/objects.
- Every public function needs docstrings/JSDoc and a test.

## CLI

```bash
kredit check --agent=agt_8f3k2m --action=serp_api.search --cost=1
kredit report --agent=agt_8f3k2m --txn=txn_... --outcome=success --cost=1
kredit agents list --org=research-team
kredit orgs create --name=research-team
kredit score --agent=agt_8f3k2m
```

Reads `KREDIT_API_KEY` from env or `~/.kredit/config`.

## Key commands

- Python: `cd packages/python && ruff check . && pytest`
- TypeScript: `cd packages/typescript && npx biome check . && npx vitest`
- CLI: `cd packages/cli && bash kredit --help`

## Important

- Never hardcode API URLs. Always read from config/env `KREDIT_API_URL`.
- Default base URL is `https://api.kredit.sh`
- All HTTP calls must have timeouts (5s default) and retries (2x with backoff).
- `kredit.check()` is the hot path. It must be fast. No unnecessary allocations.
- All money amounts are integers in cents. Never use floats for money.
