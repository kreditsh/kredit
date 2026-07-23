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

const MODE_DESC =
	"Environment mode to scope to: simulation | preview | production";
const modeField = () =>
	z
		.enum(["simulation", "preview", "production"])
		.optional()
		.describe(MODE_DESC);

const ENVIRONMENT_ID_DESC =
	"Environment id to scope to (canonical scope; takes precedence over mode when both are set)";
const environmentIdField = () =>
	z.string().optional().describe(ENVIRONMENT_ID_DESC);

function createServer(api: KreditAPI): McpServer {
	const server = new McpServer({ name: "kredit", version: "0.2.0" });

	// ── Orgs ──
	tool(
		server,
		"kredit_list_orgs",
		"List all organizations, optionally scoped to a mode (simulation | preview | production)",
		{ mode: modeField(), environment_id: environmentIdField() },
		({ mode, environment_id }) => api.listOrgs(mode, environment_id),
	);
	tool(
		server,
		"kredit_create_org",
		"Create an organization, optionally in a specific mode (simulation | preview | production) or environment",
		{
			name: z.string(),
			mode: modeField(),
			environment_id: environmentIdField(),
		},
		({ name, mode, environment_id }) =>
			api.createOrg(name, mode, environment_id),
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
		"List agents, optionally filtered by org and scoped to a mode (simulation | preview | production)",
		{
			org_id: z.string().optional(),
			mode: modeField(),
			environment_id: environmentIdField(),
		},
		({ org_id, mode, environment_id }) =>
			api.listAgents(org_id, mode, environment_id),
	);
	tool(
		server,
		"kredit_create_agent",
		"Create an agent with wallet, priority, and rules, optionally in a specific mode (simulation | preview | production)",
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
			mode: modeField(),
			environment_id: environmentIdField(),
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
		"Add a spending rule to an agent, optionally scoped to a mode (simulation | preview | production); omit to apply to all modes",
		{
			agent_id: z.string(),
			name: z.string().describe("Rule name"),
			match: z
				.string()
				.describe("Action pattern, e.g. 'openai.*', 'flight.*', '*'"),
			mode: modeField(),
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
				.enum(["api_call", "mcp_call", "compute", "data", "tool", "other"])
				.optional()
				.describe("Transaction type; MCP-originated calls default to mcp_call"),
			metadata: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("Freeform metadata for the transaction"),
		},
		(args) => api.check({ type: "mcp_call", ...args }),
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
	tool(
		server,
		"kredit_fleet",
		"Get fleet overview stats, optionally scoped to a mode (simulation | preview | production)",
		{ mode: modeField(), environment_id: environmentIdField() },
		({ mode, environment_id }) => api.fleetOverview(mode, environment_id),
	);

	// ── Simulation ──
	tool(
		server,
		"kredit_simulation",
		"Run a Kredit simulation on a sandbox via the server engine. The server stands up the fleet, drives trust decisions, and returns the result summary.",
		{
			sandbox_id: z.string().describe("Sandbox to simulate against"),
			mode: z
				.enum(["predictive", "realtime"])
				.optional()
				.describe("Simulation mode (default: predictive)"),
			duration_sec: z
				.number()
				.int()
				.optional()
				.describe("Simulation duration in seconds"),
			period: z.string().optional().describe("e.g. 1mo, 1wk"),
			seed: z.number().int().optional().describe("Deterministic seed"),
		},
		({ sandbox_id, mode, duration_sec, period, seed }) =>
			api.runSimulation({
				sandbox_id,
				mode: mode ?? "predictive",
				...(duration_sec !== undefined ? { duration_sec } : {}),
				...(period !== undefined ? { period } : {}),
				...(seed !== undefined ? { seed } : {}),
			}),
	);

	// ── Transactions ──
	tool(
		server,
		"kredit_transactions",
		"List transactions (audit log), optionally scoped to a mode (simulation | preview | production)",
		{
			agent_id: z.string().optional(),
			status: z.enum(["allowed", "blocked", "flagged"]).optional(),
			limit: z.number().int().optional(),
			mode: modeField(),
			environment_id: environmentIdField(),
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

	// ── Sandboxes ──
	tool(server, "kredit_list_sandboxes", "List sandboxes (environment containers)", {}, () =>
		api.listSandboxes(),
	);
	tool(
		server,
		"kredit_create_sandbox",
		"Create a named sandbox (starts in simulation mode)",
		{ name: z.string(), config: z.record(z.string(), z.any()).optional() },
		({ name, config }) => api.createSandbox({ name, config }),
	);
	tool(
		server,
		"kredit_get_sandbox",
		"Get a sandbox by id (config, rules, version)",
		{ sandbox_id: z.string() },
		({ sandbox_id }) => api.getSandbox(sandbox_id),
	);
	tool(
		server,
		"kredit_update_sandbox",
		"Update a sandbox name/config (global budget, tools, rules)",
		{
			sandbox_id: z.string(),
			name: z.string().optional(),
			config: z.record(z.string(), z.any()).optional(),
		},
		({ sandbox_id, name, config }) => api.updateSandbox(sandbox_id, { name, config }),
	);
	tool(
		server,
		"kredit_promote_preview",
		"Copy a simulation sandbox's config to the preview environment",
		{ sandbox_id: z.string() },
		({ sandbox_id }) => api.promotePreview(sandbox_id),
	);
	tool(
		server,
		"kredit_promote_production",
		"Copy the preview sandbox's config to production",
		{ preview_sandbox_id: z.string() },
		({ preview_sandbox_id }) => api.promoteProduction(preview_sandbox_id),
	);
	tool(
		server,
		"kredit_sandbox_versions",
		"List a sandbox's saved config versions",
		{ sandbox_id: z.string() },
		({ sandbox_id }) => api.sandboxVersions(sandbox_id),
	);
	tool(
		server,
		"kredit_deploy_mode",
		"Deploy a sandbox's orgs/agents/rules from one mode to another (simulation | preview | production)",
		{
			sandbox_id: z.string(),
			from_mode: z
				.enum(["simulation", "preview", "production"])
				.describe("Source mode to deploy from"),
			to_mode: z
				.enum(["simulation", "preview", "production"])
				.describe("Target mode to deploy to"),
			include: z
				.array(z.enum(["orgs", "agents", "rules"]))
				.optional()
				.describe("Which resources to deploy (default: all)"),
		},
		({ sandbox_id, from_mode, to_mode, include }) =>
			api.deployMode(sandbox_id, { from_mode, to_mode, include }),
	);

	// ── Simulations ──
	tool(
		server,
		"kredit_run_simulation",
		"Run a trust simulation on a sandbox (predictive or realtime)",
		{
			sandbox_id: z.string(),
			mode: z.enum(["predictive", "realtime"]).optional(),
			period: z.string().optional().describe("e.g. 1mo, 1wk"),
			monthly_budget: z.number().optional(),
			seed: z.number().int().optional(),
		},
		(args) => api.runSimulation(args),
	);
	tool(
		server,
		"kredit_list_simulations",
		"List past simulations, optionally by sandbox",
		{ sandbox_id: z.string().optional() },
		({ sandbox_id }) => api.listSimulations(sandbox_id),
	);
	tool(
		server,
		"kredit_stop_simulation",
		"Stop a running simulation by id",
		{ simulation_id: z.string() },
		({ simulation_id }) => api.stopSimulation(simulation_id),
	);

	// ── Priors ──
	tool(
		server,
		"kredit_list_priors",
		"List demand priors (expected call frequency, cost, and seasonality) for a sandbox, optionally scoped to a mode (simulation | preview | production)",
		{
			sandbox_id: z.string().describe("Sandbox to list priors for"),
			mode: modeField(),
			environment_id: environmentIdField(),
		},
		({ sandbox_id, mode, environment_id }) =>
			api.listPriors(sandbox_id, mode, environment_id),
	);
	tool(
		server,
		"kredit_set_prior",
		"Create or update a demand prior for a sandbox. A prior estimates how often an action runs (frequency) and what it costs (cost), plus a weekly/daily seasonality shape. Pass prior_id to update an existing prior; omit it to create a new one. For seasonality, give a preset name (24x7, weekday, business-hours) OR explicit dow (7 numbers) and hour (24 numbers) weights.",
		{
			name: z.string().describe("Prior name, e.g. 'openai.chat'"),
			sandbox_id: z.string().describe("Sandbox this prior belongs to"),
			prior_id: z
				.string()
				.optional()
				.describe("Existing prior id to update; omit to create a new prior"),
			mode: modeField(),
			environment_id: environmentIdField(),
			frequency_mean: z
				.number()
				.describe("Expected number of calls per period"),
			frequency_variance: z
				.number()
				.optional()
				.describe("Uncertainty on frequency (default: frequency_mean)"),
			cost_mean: z.number().describe("Expected cost per call in dollars"),
			cost_variance: z
				.number()
				.optional()
				.describe("Uncertainty on cost in dollars (default: cost_mean * 0.25)"),
			seasonality_preset: z
				.enum(["24x7", "weekday", "business-hours"])
				.optional()
				.describe(
					"Named seasonality shape; resolved server-side into dow/hour weights",
				),
			seasonality_dow: z
				.array(z.number())
				.length(7)
				.optional()
				.describe("Explicit day-of-week weights (7 numbers, Mon..Sun)"),
			seasonality_hour: z
				.array(z.number())
				.length(24)
				.optional()
				.describe("Explicit hour-of-day weights (24 numbers, 0..23)"),
		},
		async (args) => {
			const {
				name,
				sandbox_id,
				prior_id,
				mode,
				environment_id,
				frequency_mean,
				frequency_variance,
				cost_mean,
				cost_variance,
				seasonality_preset,
				seasonality_dow,
				seasonality_hour,
			} = args;

			// Resolve seasonality: explicit dow/hour wins, else a named preset.
			let seasonality: { dow: number[]; hour: number[] } | undefined;
			if (seasonality_dow && seasonality_hour) {
				seasonality = { dow: seasonality_dow, hour: seasonality_hour };
			} else if (seasonality_preset) {
				const presets = await api.getPriorPresets();
				const preset = presets?.[seasonality_preset];
				if (!preset) {
					throw new Error(`Unknown seasonality preset: ${seasonality_preset}`);
				}
				seasonality = { dow: preset.dow, hour: preset.hour };
			}

			const frequency = {
				mean: frequency_mean,
				variance: frequency_variance ?? frequency_mean,
			};
			const cost = {
				mean: cost_mean,
				variance: cost_variance ?? cost_mean * 0.25,
			};

			if (prior_id) {
				return api.updatePrior(prior_id, {
					name,
					frequency,
					cost,
					...(seasonality ? { seasonality } : {}),
				});
			}
			return api.createPrior(sandbox_id, {
				name,
				frequency,
				cost,
				...(seasonality ? { seasonality } : {}),
				...(mode ? { mode } : {}),
				...(environment_id ? { environment_id } : {}),
			});
		},
	);
	tool(
		server,
		"kredit_delete_prior",
		"Delete a demand prior by id",
		{ prior_id: z.string() },
		({ prior_id }) => api.deletePrior(prior_id),
	);

	// ── Workflows ──
	const nodeSchema = z.object({
		id: z.string().describe("Unique node id within the workflow"),
		type: z
			.enum(["agent", "llm", "api", "tool", "payment"])
			.describe("Node type; api/tool/payment nodes need a matching integration"),
		label: z.string().describe("Human-readable node label"),
		integration: z
			.string()
			.optional()
			.describe("Integration key (required for api/tool/payment nodes)"),
		config: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Freeform node config"),
	});
	const edgeSchema = z.object({
		from: z.string().describe("Source node id"),
		to: z.string().describe("Target node id"),
		condition: z.string().optional().describe("Optional edge condition"),
	});
	tool(
		server,
		"kredit_list_workflows",
		"List agent workflows (node/edge graphs) for a sandbox, optionally scoped to a mode (simulation | preview | production)",
		{
			sandbox_id: z.string().describe("Sandbox to list workflows for"),
			mode: modeField(),
			environment_id: environmentIdField(),
		},
		({ sandbox_id, mode, environment_id }) =>
			api.listWorkflows(sandbox_id, mode, environment_id),
	);
	tool(
		server,
		"kredit_create_workflow",
		"Create a workflow (a graph of nodes and edges) in a sandbox. Node types: agent|llm|api|tool|payment; api/tool/payment nodes require an integration of the matching kind. Invalid graphs are rejected by the server.",
		{
			sandbox_id: z.string().describe("Sandbox this workflow belongs to"),
			name: z.string().describe("Workflow name"),
			mode: modeField(),
			environment_id: environmentIdField(),
			nodes: z.array(nodeSchema).describe("Workflow nodes"),
			edges: z.array(edgeSchema).describe("Directed edges between node ids"),
		},
		({ sandbox_id, name, mode, environment_id, nodes, edges }) =>
			api.createWorkflow({
				sandbox_id,
				name,
				nodes,
				edges,
				...(mode ? { mode } : {}),
				...(environment_id ? { environment_id } : {}),
			}),
	);
	tool(
		server,
		"kredit_get_workflow",
		"Get a workflow by id (nodes, edges, version)",
		{ workflow_id: z.string() },
		({ workflow_id }) => api.getWorkflow(workflow_id),
	);
	tool(
		server,
		"kredit_update_workflow",
		"Update a workflow's name, nodes, or edges",
		{
			workflow_id: z.string(),
			name: z.string().optional(),
			nodes: z.array(nodeSchema).optional().describe("Replacement workflow nodes"),
			edges: z
				.array(edgeSchema)
				.optional()
				.describe("Replacement directed edges between node ids"),
		},
		({ workflow_id, ...data }) => api.updateWorkflow(workflow_id, data),
	);
	tool(
		server,
		"kredit_delete_workflow",
		"Delete a workflow by id",
		{ workflow_id: z.string() },
		({ workflow_id }) => api.deleteWorkflow(workflow_id),
	);
	tool(
		server,
		"kredit_run_workflow",
		"Simulate a workflow end-to-end via the server engine. Returns node_runs plus node_count, blocked_count, and total_cost.",
		{
			workflow_id: z.string(),
			seed: z.number().int().optional().describe("Deterministic seed"),
		},
		({ workflow_id, seed }) => api.simulateWorkflow(workflow_id, seed),
	);
	tool(
		server,
		"kredit_execute_workflow",
		"Execute a workflow for real through the trusted path (settled per mode). Returns the run record with node_runs, node_count, blocked_count, total_cost, and transaction_ids.",
		{
			workflow_id: z.string(),
			seed: z.number().int().optional().describe("Deterministic seed"),
		},
		({ workflow_id, seed }) => api.executeWorkflow(workflow_id, seed),
	);
	tool(
		server,
		"kredit_workflow_runs",
		"List past execution runs for a workflow (id, mode, status, node_count, blocked_count, total_cost, created_at).",
		{ workflow_id: z.string() },
		({ workflow_id }) => api.listWorkflowRuns(workflow_id),
	);
	tool(
		server,
		"kredit_get_workflow_run",
		"Get a single workflow run record by run id, including its node_runs and transaction_ids.",
		{ run_id: z.string() },
		({ run_id }) => api.getWorkflowRun(run_id),
	);

	// ── Environments ──
	tool(
		server,
		"kredit_list_environments",
		"List environments in a sandbox. A sandbox contains environments: the 3 modes (simulation | preview | production) are standard environments (exactly one production environment per sandbox), and each simulation run is its own simulation-mode environment nested inside its parent environment.",
		{ sandbox_id: z.string().describe("Sandbox to list environments for") },
		({ sandbox_id }) => api.listEnvironments(sandbox_id),
	);
	tool(
		server,
		"kredit_create_environment",
		"Create an environment inside a sandbox. Use mode 'simulation' to spin up a simulation environment (pass simulation_id to bind it to a simulation run).",
		{
			sandbox_id: z.string().describe("Sandbox this environment belongs to"),
			mode: z
				.enum(["simulation", "preview", "production"])
				.describe("Environment mode"),
			name: z.string().optional().describe("Optional environment name"),
			simulation_id: z
				.string()
				.optional()
				.describe("Simulation run id to bind this environment to"),
		},
		({ sandbox_id, mode, name, simulation_id }) =>
			api.createEnvironment({
				sandbox_id,
				mode,
				...(name ? { name } : {}),
				...(simulation_id ? { simulation_id } : {}),
			}),
	);

	// ── Chats ──
	tool(
		server,
		"kredit_list_chats",
		"List chats, optionally filtered by sandbox",
		{ sandbox_id: z.string().optional().describe("Sandbox to list chats for") },
		({ sandbox_id }) => api.listChats(sandbox_id),
	);
	tool(
		server,
		"kredit_get_chat",
		"Get a chat by id, including its messages",
		{ chat_id: z.string() },
		({ chat_id }) => api.getChat(chat_id),
	);

	// ── Integrations ──
	tool(
		server,
		"kredit_list_integrations",
		"List partner integrations and whether they execute/settle in a sandbox's env",
		{ sandbox_id: z.string().optional() },
		({ sandbox_id }) => api.listIntegrations(sandbox_id),
	);

	// ── Action verbs ──
	tool(
		server,
		"kredit_action_intent",
		"Dry-run the trust layer for an action (no debit, no record)",
		{
			agent_id: z.string(),
			action: z.string().describe("kind.provider.verb, e.g. payment.stripe.charge"),
			estimated_cost: z.number().optional(),
		},
		(args) => api.actionIntent(args),
	);
	tool(
		server,
		"kredit_execute_action",
		"Execute a payment/api/tool action (env-gated; preview = no settlement)",
		{
			agent_id: z.string(),
			action: z.string(),
			provider: z.string().optional(),
			estimated_cost: z.number().optional(),
		},
		(args) => api.executeAction(args),
	);
	tool(
		server,
		"kredit_run",
		"Run the full 6-stage trusted path in one shot (intent → identity → trust → execute → observe → optimize). Returns a transaction_id, status, execution, outcome, and a trust_card with a 6-stage path.",
		{
			agent_id: z.string(),
			action: z
				.string()
				.describe("Action name, e.g. 'openai.chat', 'payment.stripe.charge'"),
			estimated_cost: z
				.number()
				.optional()
				.describe("Estimated cost in dollars"),
			type: z
				.enum(["api_call", "mcp_call", "compute", "data", "tool", "other"])
				.optional()
				.describe("Transaction type; MCP-originated calls default to mcp_call"),
			provider: z.string().optional(),
			outcome: z
				.enum(["success", "failure", "partial"])
				.optional()
				.describe("Optional pre-set outcome for the observe stage"),
		},
		(args) => api.run({ type: "mcp_call", ...args }),
	);
	tool(
		server,
		"kredit_score_trust",
		"Recompute and return an agent's trust score",
		{ agent_id: z.string() },
		({ agent_id }) => api.scoreTrust(agent_id),
	);
	tool(
		server,
		"kredit_optimize",
		"Run a predictive simulation and tighten guardrails on projected overspenders",
		{ sandbox_id: z.string(), period: z.string().optional(), apply: z.boolean().optional() },
		(args) => api.optimize(args),
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
