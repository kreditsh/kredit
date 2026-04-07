#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KreditAPI } from "./api.js";
import { resolveConfig } from "./config.js";

function tool(
	server: McpServer,
	name: string,
	desc: string,
	schema: Record<string, any>,
	fn: (args: Record<string, any>) => Promise<any>,
) {
	server.tool(name, desc, schema, async (args) => {
		try {
			const result = await fn(args);
			return {
				content: [
					{ type: "text" as const, text: JSON.stringify(result, null, 2) },
				],
			};
		} catch (err) {
			return {
				content: [
					{
						type: "text" as const,
						text: `Error: ${err instanceof Error ? err.message : String(err)}`,
					},
				],
				isError: true,
			};
		}
	});
}

function createServer(api: KreditAPI): McpServer {
	const server = new McpServer({ name: "kredit", version: "0.2.0" });

	// ── Orgs ──
	tool(server, "kredit_list_orgs", "List all organizations", {}, () =>
		api.listOrgs(),
	);
	tool(
		server,
		"kredit_create_org",
		"Create an organization",
		{ name: z.string() },
		({ name }) => api.createOrg(name),
	);
	tool(
		server,
		"kredit_rename_org",
		"Rename an organization",
		{ org_id: z.string(), name: z.string() },
		({ org_id, name }) => api.renameOrg(org_id, name),
	);
	tool(
		server,
		"kredit_delete_org",
		"Delete an organization and all its agents/transactions",
		{ org_id: z.string() },
		({ org_id }) => api.deleteOrg(org_id),
	);

	// ── Agents ──
	tool(
		server,
		"kredit_list_agents",
		"List agents, optionally filtered by org",
		{ org_id: z.string().optional() },
		({ org_id }) => api.listAgents(org_id),
	);
	tool(
		server,
		"kredit_create_agent",
		"Create an agent with wallet, priority, and rules",
		{
			org_name: z
				.string()
				.optional()
				.describe(
					"Organization name (created if doesn't exist). Either org_name or org_id is required.",
				),
			org_id: z
				.string()
				.optional()
				.describe("Organization ID (alternative to org_name)"),
			name: z.string().describe("Agent name"),
			priority: z.enum(["normal", "high", "critical"]).optional(),
			wallet: z
				.object({
					balance: z.number().optional(),
					budget: z.number().optional(),
					max_per_txn: z.number().optional(),
					daily_spend_limit: z.number().optional(),
				})
				.optional(),
			rules: z
				.array(
					z.object({
						name: z.string(),
						match: z.string(),
						max_cost_per_txn: z.number().optional(),
						daily_spend_limit: z.number().optional(),
						hourly_rate_limit: z.number().int().optional(),
					}),
				)
				.optional(),
		},
		(args) => {
			if (!args.org_name && !args.org_id) {
				throw new Error("Either org_name or org_id is required");
			}
			return api.createAgent(args);
		},
	);
	tool(
		server,
		"kredit_get_agent",
		"Get agent details",
		{ agent_id: z.string() },
		({ agent_id }) => api.getAgent(agent_id),
	);
	tool(
		server,
		"kredit_update_agent",
		"Update agent name, priority, or wallet",
		{
			agent_id: z.string(),
			name: z.string().optional(),
			priority: z.enum(["normal", "high", "critical"]).optional(),
			wallet: z
				.object({
					balance: z.number().optional(),
					budget: z.number().optional(),
					max_per_txn: z.number().optional(),
					daily_spend_limit: z.number().optional(),
				})
				.optional(),
		},
		({ agent_id, ...data }) => api.updateAgent(agent_id, data),
	);
	tool(
		server,
		"kredit_delete_agent",
		"Delete an agent",
		{ agent_id: z.string() },
		({ agent_id }) => api.deleteAgent(agent_id),
	);

	// ── Rules ──
	tool(
		server,
		"kredit_list_rules",
		"List rules for an agent",
		{ agent_id: z.string() },
		({ agent_id }) => api.listRules(agent_id),
	);
	tool(
		server,
		"kredit_add_rule",
		"Add a spending rule to an agent",
		{
			agent_id: z.string(),
			name: z.string().describe("Rule name"),
			match: z
				.string()
				.describe("Action pattern, e.g. 'openai.*', 'flight.*', '*'"),
			max_cost_per_txn: z
				.number()
				.optional()
				.describe("Max dollars per call, 0=unlimited"),
			daily_spend_limit: z
				.number()
				.optional()
				.describe("Max dollars per day, 0=unlimited"),
			hourly_rate_limit: z
				.number()
				.int()
				.optional()
				.describe("Max calls per hour, 0=unlimited"),
		},
		({ agent_id, ...rule }) => api.addRule(agent_id, rule),
	);
	tool(
		server,
		"kredit_update_rule",
		"Update a rule",
		{
			agent_id: z.string(),
			rule_id: z.string(),
			name: z.string().optional(),
			match: z.string().optional(),
			max_cost_per_txn: z.number().optional(),
			daily_spend_limit: z.number().optional(),
			hourly_rate_limit: z.number().int().optional(),
			enabled: z.boolean().optional(),
		},
		({ agent_id, rule_id, ...data }) => api.updateRule(agent_id, rule_id, data),
	);
	tool(
		server,
		"kredit_delete_rule",
		"Delete a rule from an agent",
		{ agent_id: z.string(), rule_id: z.string() },
		({ agent_id, rule_id }) => api.deleteRule(agent_id, rule_id),
	);

	// ── Check & Report ──
	tool(
		server,
		"kredit_check",
		"Risk check before a paid action. Returns allow/block with reason.",
		{
			agent_id: z.string(),
			action: z
				.string()
				.describe("Action name, e.g. 'openai.chat', 'flight.booking'"),
			estimated_cost: z.number().describe("Estimated cost in dollars"),
			type: z
				.enum(["api_call", "compute", "data", "tool", "other"])
				.optional()
				.describe("Transaction type, defaults to api_call"),
			metadata: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("Freeform metadata for the transaction"),
		},
		(args) => api.check(args),
	);
	tool(
		server,
		"kredit_report",
		"Report outcome after an action. Updates credit score.",
		{
			transaction_id: z.string(),
			outcome: z.enum(["success", "failure", "partial"]),
			actual_cost: z.number().optional().describe("Actual cost in dollars"),
		},
		(args) => api.report(args),
	);

	// ── Score & Wallet ──
	tool(
		server,
		"kredit_score",
		"Get agent credit score and stats",
		{ agent_id: z.string() },
		({ agent_id }) => api.getScore(agent_id),
	);
	tool(
		server,
		"kredit_wallet",
		"Get agent wallet balance and limits",
		{ agent_id: z.string() },
		({ agent_id }) => api.getWallet(agent_id),
	);
	tool(
		server,
		"kredit_update_wallet",
		"Update agent wallet balance, budget, or limits",
		{
			agent_id: z.string(),
			balance: z.number().optional(),
			budget: z.number().optional(),
			max_per_txn: z.number().optional(),
			daily_spend_limit: z.number().optional(),
		},
		({ agent_id, ...data }) => api.updateWallet(agent_id, data),
	);

	// ── Fleet ──
	tool(server, "kredit_fleet", "Get fleet overview stats", {}, () =>
		api.fleetOverview(),
	);

	// ── Transactions ──
	tool(
		server,
		"kredit_transactions",
		"List transactions (audit log)",
		{
			agent_id: z.string().optional(),
			status: z.enum(["allowed", "blocked", "flagged"]).optional(),
			limit: z.number().int().optional(),
		},
		(args) => api.listTransactions(args),
	);

	// ── Events ──
	tool(
		server,
		"kredit_events",
		"List agent state change events (score, status, wallet, rules)",
		{
			agent_id: z.string(),
			event_type: z
				.string()
				.optional()
				.describe(
					"Filter: score_change, status_change, wallet_update, rule_added, rule_removed",
				),
		},
		({ agent_id, event_type }) => api.listEvents(agent_id, event_type),
	);

	return server;
}

async function main(): Promise<void> {
	const config = resolveConfig();
	if (!config.apiKey) console.error("Warning: No KREDIT_API_KEY set.");
	const api = new KreditAPI(config);
	const server = createServer(api);
	await server.connect(new StdioServerTransport());
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});

export { createServer, KreditAPI };
