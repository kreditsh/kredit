# kredit

The command line for the Kredit platform API: organizations, agents and their
mandates, the check every agent action runs through, the decisions it produces,
and the agentic commerce runs. One Bash script, no build step.

## Install

```bash
curl -sSL kredit.sh/install | sh
```

Or copy the script somewhere on your path:

```bash
cp packages/cli/kredit ~/.local/bin/kredit && chmod +x ~/.local/bin/kredit
```

Needs `curl`. Output is prettier with `jq` installed; `python3` covers what `jq`
would otherwise do.

## Sign in

```bash
kredit login
```

Opens the console in your browser, signs you in, and saves an API key to
`~/.kredit/config`. `kredit logout` removes it. `kredit whoami` shows the
session behind the key.

## Config

| Setting | Where |
|---|---|
| API key | `KREDIT_API_KEY`, or `api_key=` in `~/.kredit/config` |
| API URL | `KREDIT_API_URL` (default `https://api.kredit.sh`) |
| Organization | `--org ID` on any command, then `KREDIT_ORG`, then `org=` in the config (set with `kredit orgs use ID`), then the first organization on the account |

Flags take either form: `--name value` or `--name=value`.

## Commands

**Organizations**

- `kredit orgs list` all organizations on the account
- `kredit orgs get [ID]` one organization, the default one when no id is given
- `kredit orgs create --name NAME [--description D]`
- `kredit orgs update ID [--name NAME] [--description D]`
- `kredit orgs delete ID` queued for a person to approve
- `kredit orgs summary [ID]` counts and spend
- `kredit orgs use ID` make it the default for every command

**Rules** (per organization; every change waits for a person)

- `kredit rules list`
- `kredit rules add [--name N] [--type payment|tool|api] [--providers a,b] [--spend AMOUNT/WINDOW] [--hit-rate COUNT/WINDOW] [--allowed a,b] [--blocked a,b] [--on-hit deny|review] [--enabled true|false]`
- `kredit rules update RULE_ID` with the same flags
- `kredit rules remove RULE_ID`

Windows are `txn`, `sec`, `min`, `hr`, `day`, `wk`, `mo`. `--spend 500/day` caps
a day, `--spend 150/txn` caps one transaction. `--on-hit review` sends a hit to a
person instead of denying it.

**Agents**

- `kredit agents list`
- `kredit agents get ID`
- `kredit agents create --name NAME --prompt "what it does" [--description D] [--allowed a,b] [--blocked a,b] [--max-per-action N] [--review-above N] [--spend AMOUNT/WINDOW]`
- `kredit agents update ID [--name NAME] [--description D]`
- `kredit agents freeze ID` and `kredit agents unfreeze ID`
- `kredit agents delete ID` queued for a person to approve
- `kredit agents verify ID [--provider kredit|skyfire|kite]` know-your-agent
- `kredit agents promote ID` to production
- `kredit agents decisions ID [--limit N]`

**Versions** (an agent's policy is a version; a person activates it)

- `kredit versions propose AGENT_ID [--prompt P] [--allowed a,b] [--blocked a,b] [--max-per-action N] [--review-above N] [--spend AMOUNT/WINDOW] [--note T]`
- `kredit versions approve AGENT_ID VERSION_ID [--env sandbox|production]`
- `kredit versions reject AGENT_ID VERSION_ID [--note T]`

**Tokens** (the agent's own credential, an hour at most)

- `kredit tokens issue AGENT_ID [--ttl MINUTES]` prints the token once
- `kredit tokens list AGENT_ID`
- `kredit tokens revoke AGENT_ID TOKEN_ID`

**The check**

- `kredit check --agent AGENT_ID "what the agent wants to do, in words" [--amount N] [--currency USD] [--merchant NAME] [--domain D] [--category C] [--rail card|usdc|skyfire|kite|ach|wire|crypto] [--env sandbox|production] [--json]`

The intent is text. Amount, merchant and rail are read from it; anything you
state with a flag is taken as given. The output is the outcome, the score, the
reason, and one line per risk layer. `--json` prints the whole decision.

**Decisions**

- `kredit decisions list [--agent ID] [--outcome allow|deny|review] [--env E] [--limit N]`
- `kredit decisions get ID`
- `kredit decisions reviews` decisions waiting for a person
- `kredit decisions execute ID`

**Approvals**

- `kredit approvals list` changes waiting for a passkey

**Documents**

- `kredit documents list`
- `kredit documents add --name NAME (--file PATH | --text "..." | --url URL) [--tags a,b]`
- `kredit documents search --q "words"`
- `kredit documents delete ID`

**Integrations**

- `kredit integrations list` providers, their fields, and what is set
- `kredit integrations set PROVIDER [--key name=value ...] [--enabled true|false] [--mode simulated|sandbox|live]`
- `kredit integrations test PROVIDER`

**More**

- `kredit audit [--limit N] [--action A]`
- `kredit orders`
- `kredit environments list | create --name NAME | delete ID`
- `kredit sim run [--scenario normal|fraud|runaway|mixed] [--count N] [--agents a,b] [--environment ID] [--seed N]`, `kredit sim list | get ID | stop ID`
- `kredit commerce workflows`, `kredit commerce update WORKFLOW_ID [--name N --query Q --agent ID]`
- `kredit commerce runs`, `kredit commerce run RUN_ID`
- `kredit commerce start WORKFLOW_ID [--query Q] [--budget N] [--choice you|agent] [--from-run RUN_ID]`
- `kredit commerce choose RUN_ID [FIND_ID]`, `kredit commerce rechoose RUN_ID FIND_ID`, `kredit commerce stop RUN_ID`
- `kredit seed` a demo organization with agents and history

## A worked example

```bash
kredit login

# an organization, made the default
kredit orgs create --name "Acme"
kredit orgs use <org id>

# a shopping agent that may only buy from four vendors, at most $150 a go,
# with anything over $100 going to a person
kredit agents create --name "Shopping agent" \
  --prompt "Buys running shoes for the team, under $150 a pair." \
  --allowed nike.com,hoka.com,newbalance.com,asics.com \
  --max-per-action 150 --review-above 100

# and no more than $500 a day across the organization
kredit rules add --name "Daily cap" --spend 500/day --on-hit deny

# the agent's own credential, good for an hour
kredit tokens issue <agent id>

# what the agent asks before it acts
kredit check --agent <agent id> "pay nike.com 129.99 for men's running shoes"
```

The check prints something like:

```
REVIEW  score 85  6.9 ms
above the $100 review threshold, a person decides

  PASS  Agent identity: KYA verified via kredit
  PASS  Business identity: KYB verified via kredit
  PASS  Intent risk analysis: intent consistent with the agent's brief
  PASS  Compliance: no sanctions match across 2 list(s)
  WARN  Guardrails & policies: above the $100 review threshold, a person decides
  PASS  Scope & permissions: payment.purchase covered by tool card
  PASS  Financial risk: in line with its history
  PASS  Fraud: no flags
  PASS  Disputes & recovery: merchant dispute rate 0.4%

decision 6aa9...
```

`allow` means go. `review` waits for a person on the console. `deny` is final,
with the reason on the line under the score.

## Changes that wait for a person

Deleting an organization or an agent, and adding, changing or removing a rule,
are not applied when they come from an API key. They come back as a pending
approval, and the command says so:

```
This change is waiting for a person. Approve it with a passkey at https://kredit.sh/console/review.
The active policy stays in force until then.
```

A person approves them on the console's Review tab, one at a time or all at
once, with a passkey.
