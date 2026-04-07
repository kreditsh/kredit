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

## Tools (22 total)

### Organizations
| Tool | Description |
|------|-------------|
| `kredit_list_orgs` | List all organizations |
| `kredit_create_org` | Create an organization |
| `kredit_rename_org` | Rename an organization |
| `kredit_delete_org` | Delete an organization |

### Agents
| Tool | Description |
|------|-------------|
| `kredit_list_agents` | List agents (filter by org) |
| `kredit_create_agent` | Create agent with wallet, priority, rules |
| `kredit_get_agent` | Get agent details |
| `kredit_update_agent` | Update name, priority, wallet |
| `kredit_delete_agent` | Delete an agent |

### Rules
| Tool | Description |
|------|-------------|
| `kredit_list_rules` | List rules for an agent |
| `kredit_add_rule` | Add a spending rule (match pattern + limits) |
| `kredit_update_rule` | Update a rule |
| `kredit_delete_rule` | Delete a rule |

### Risk Check & Report
| Tool | Description |
|------|-------------|
| `kredit_check` | Risk evaluation before a paid action |
| `kredit_report` | Report outcome after action completes |

### Score & Wallet
| Tool | Description |
|------|-------------|
| `kredit_score` | Get credit score and stats |
| `kredit_wallet` | Get wallet balance and limits |
| `kredit_update_wallet` | Update wallet balance, budget, limits |

### Fleet & Logs
| Tool | Description |
|------|-------------|
| `kredit_fleet` | Fleet overview stats |
| `kredit_transactions` | List transactions (audit log) |
| `kredit_events` | Agent state change history |

## Example

After setup, Claude can:

```
"Create an org called my-team, add an agent called travel-bot
with a $5000 budget and a rule that caps flight bookings at $800"
```

Claude will call:
1. `kredit_create_org` → creates "my-team"
2. `kredit_create_agent` → creates travel-bot with wallet
3. `kredit_add_rule` → adds flight.* rule with $800 cap

Then before any paid action:
```
"Book a flight for $450"
```

Claude calls `kredit_check` → allowed → books flight → `kredit_report` → score updates.

## Links

- [kredit.sh](https://kredit.sh) — Dashboard
- [Docs](https://kredit.sh/docs)
- [GitHub](https://github.com/kreditsh/kredit/tree/main/packages/mcp)
