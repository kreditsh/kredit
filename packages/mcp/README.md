# kredit-mcp

MCP server for Kredit — risk management for AI agents in Claude Code and Claude Desktop.

## Install

```bash
npm i -g kredit-mcp
```

## Setup

```bash
# Get API key
kredit login
# Or from https://kredit.sh dashboard

# Add to Claude Code
claude mcp add kredit -- kredit-mcp serve --api-key=kr_live_...

# Or via env
export KREDIT_API_KEY=kr_live_...
claude mcp add kredit -- kredit-mcp serve
```

## The model

An **organization** is the top level: it owns agents, environments, workflows and
guardrail rules. One organization is **activated** at a time — every tool that
takes `org_id` may omit it and will target the activated org
(`kredit_activate_org` switches).

Mode belongs to an **environment**, never to the organization:

| Mode | Provider calls | Settlement |
|------|----------------|------------|
| `sandbox` | simulated | none |
| `preview` | real | none |
| `production` | real | live |

Each organization gets those three standard environments, and every simulation
run is its own throwaway `sandbox` environment cloned from its parent — so a run
never touches the live fleet.

## Tools

### Organizations
| Tool | Description |
|------|-------------|
| `kredit_list_orgs` | List your organizations (the activated one is flagged) |
| `kredit_create_org` | Create an organization (provisions its 3 environments) |
| `kredit_get_org` | Get an organization's config and live environment |
| `kredit_activate_org` | Point this API key and the kredit agent at one org |
| `kredit_update_org` | Update name, integrations, execution settings, tool gates |
| `kredit_delete_org` | Delete an org and everything under it |
| `kredit_reset_org` | Reset fleet scores/counters (history untouched) |
| `kredit_org_activity` | Live runs across the org's environments |
| `kredit_org_versions` | Saved state versions |
| `kredit_restore_org_version` | Roll back to a version |

### Pilot
| Tool | Description |
|------|-------------|
| `kredit_pilot` | Stand up a demo fleet + guardrails and start a live run (creates the org too when `org_id` is omitted) |

### Guardrail rules
| Tool | Description |
|------|-------------|
| `kredit_list_rules` | List rules with their environment/agent scope |
| `kredit_add_rule` | Add a rule: spend cap, hit-rate cap, allow/block lists |
| `kredit_update_rule` | Update a rule's caps, providers, or enabled flag |
| `kredit_delete_rule` | Delete a rule |

Rules are the only monetary gate. An agent's budget is *derived* from its
tightest applicable spend rule — agent-scoped first, else environment-wide.

### Agents
| Tool | Description |
|------|-------------|
| `kredit_list_agents` | List agents (scope by env or mode) |
| `kredit_create_agent` | Create an agent; `budget` materializes a spend rule |
| `kredit_get_agent` | Get identity, score, status, rules |
| `kredit_update_agent` | Update name, priority, or per-env status |
| `kredit_delete_agent` | Delete an agent and its per-env state |
| `kredit_publish_agent` | Publish a draft so it may act outside sandbox |

### Risk check & report
| Tool | Description |
|------|-------------|
| `kredit_check` | Risk evaluation before a paid action |
| `kredit_report` | Report outcome after the action completes |
| `kredit_run` | The full 6-stage trusted path in one call |
| `kredit_action_intent` | Dry-run the trust layer (no execution, no record) |
| `kredit_execute_action` | Execute an action, gated by the environment's mode |

### Environments
| Tool | Description |
|------|-------------|
| `kredit_list_environments` | List the org's environments |
| `kredit_create_environment` | Create one with a mode |
| `kredit_get_environment` | Full manifest: fleet, rules, priors, audit, activity |
| `kredit_clone_environment` | Clone the whole state into a sandbox copy |
| `kredit_promote_environment` | Promote a proven env into another mode |
| `kredit_go_live` | Make an environment the org's live API target |
| `kredit_reset_environment` | Wipe an env's data, keep the env |
| `kredit_delete_environment` | Delete a disposable env (run or clone) |
| `kredit_environment_versions` / `kredit_restore_environment` | State history |

### Simulations
| Tool | Description |
|------|-------------|
| `kredit_run_simulation` | Run predictive or realtime; returns the run's env |
| `kredit_list_simulations` | Past and running simulations |
| `kredit_get_simulation` | One run's config, snapshot and results |
| `kredit_stop_simulation` | Stop a running simulation |

### Score, fleet & logs
| Tool | Description |
|------|-------------|
| `kredit_score` / `kredit_score_trust` | Get / recompute an agent's kredit score |
| `kredit_spend` | Agent spend by window, category and over time |
| `kredit_fleet` | Fleet overview: counts, derived budget, avg score, spend |
| `kredit_transactions` | The audit log |
| `kredit_events` | Agent state-change history |
| `kredit_optimize` | Tighten guardrails on projected overspenders |

### Priors, workflows, chats & integrations
| Tool | Description |
|------|-------------|
| `kredit_list_priors` / `kredit_set_prior` / `kredit_delete_prior` | Demand priors driving the simulation engine |
| `kredit_list_workflows` / `kredit_create_workflow` / `kredit_get_workflow` / `kredit_update_workflow` / `kredit_delete_workflow` | Workflow graphs |
| `kredit_run_workflow` / `kredit_execute_workflow` | Simulate or execute a workflow |
| `kredit_workflow_runs` / `kredit_get_workflow_run` | Workflow run history |
| `kredit_list_chats` / `kredit_get_chat` | Persisted kredit-agent chats |
| `kredit_list_integrations` | Providers and what they settle per environment |

## Example

After setup, Claude can:

```
"Create an org called my-team with a travel-bot agent on a $5000/mo budget,
and cap flight bookings at $800 per payment"
```

Claude will call:
1. `kredit_create_org` → creates "my-team" and its three environments
2. `kredit_create_agent` → creates travel-bot (the budget becomes a spend rule)
3. `kredit_add_rule` → a payment rule capping flights at $800

Then before any paid action:

```
"Book a flight for $450"
```

Claude calls `kredit_check` → allowed → books the flight → `kredit_report` →
the score updates.

To try the whole thing at once: *"run a kredit pilot"* → `kredit_pilot` stands
up an organization, a fleet with guardrails, and a live streaming run.

## Links

- [kredit.sh](https://kredit.sh) — Dashboard
- [Docs](https://kredit.sh/docs)
- [GitHub](https://github.com/kreditsh/kredit/tree/main/packages/mcp)
