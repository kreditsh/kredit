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

// Mode is a property of an ENVIRONMENT, never of an organization.
const MODE_DESC =
	"Environment mode to scope to: sandbox (fully simulated) | preview (real API calls, no settlement) | production (live)";
const modeField = () =>
	z.enum(["sandbox", "preview", "production"]).optional().describe(MODE_DESC);

const ENVIRONMENT_ID_DESC =
	"Environment id to scope to (canonical scope; takes precedence over mode when both are set)";
const environmentIdField = () =>
	z.string().optional().describe(ENVIRONMENT_ID_DESC);

// Every org-scoped call may omit org_id — the server uses the activated org.
const ORG_ID_DESC =
	"Organization id. Omit to use the ACTIVATED organization (see kredit_activate_org).";
const orgIdField = () => z.string().optional().describe(ORG_ID_DESC);

const WINDOW = [
	"sec",
	"min",
	"hr",
	"day",
	"wk",
	"mo",
	"quarter",
	"year",
] as const;

function createServer(api: KreditAPI): McpServer {
	const server = new McpServer({ name: "kredit", version: "0.6.0" });

	// ── Organizations (the top-level tenant) ──
	tool(
		server,
		"kredit_list_orgs",
		"List your organizations. An organization is the top-level tenant: it owns agents, environments, workflows and guardrail rules. The activated one (what every other call defaults to) has active: true.",
		{},
		() => api.listOrgs(),
	);
	tool(
		server,
		"kredit_create_org",
		"Create an organization. Its three standard environments (sandbox, preview, production) are provisioned automatically. A user's first organization becomes the activated one.",
		{
			name: z.string().describe("Organization name (unique per account)"),
			config: z
				.record(z.string(), z.any())
				.optional()
				.describe("Optional org config: integrations, execution, tool gates"),
		},
		({ name, config }) => api.createOrg(name, config),
	);
	tool(
		server,
		"kredit_get_org",
		"Get an organization: config, version, activation state, and its live environment",
		{ org_id: orgIdField() },
		async ({ org_id }) => api.getOrg(org_id ?? (await activeOrgId(api))),
	);
	tool(
		server,
		"kredit_activate_org",
		"Activate an organization — point this API key, the kredit agent and the CLI at it. Every org-scoped call that omits org_id then targets this organization.",
		{ org_id: z.string() },
		({ org_id }) => api.activateOrg(org_id),
	);
	tool(
		server,
		"kredit_update_org",
		"Update an organization's name or config (integrations, per-mode execution settings, tool allow/block lists)",
		{
			org_id: orgIdField(),
			name: z.string().optional(),
			config: z.record(z.string(), z.any()).optional(),
		},
		async ({ org_id, ...data }) =>
			api.updateOrg(org_id ?? (await activeOrgId(api)), data),
	);
	tool(
		server,
		"kredit_delete_org",
		"Delete an organization and EVERYTHING under it: agents, environments, rules, simulations, workflows and transactions",
		{ org_id: z.string() },
		({ org_id }) => api.deleteOrg(org_id),
	);
	tool(
		server,
		"kredit_reset_org",
		"Reset the fleet's mutable state: kredit scores back to 700, counters zeroed, every agent active. Rules, agents and the transaction log are untouched.",
		{ org_id: orgIdField() },
		async ({ org_id }) => api.resetOrg(org_id ?? (await activeOrgId(api))),
	);
	tool(
		server,
		"kredit_org_activity",
		"List live runs (simulations, workflow runs) across an organization's environments",
		{ org_id: orgIdField() },
		async ({ org_id }) => api.orgActivity(org_id ?? (await activeOrgId(api))),
	);
	tool(
		server,
		"kredit_org_versions",
		"List an organization's saved state versions (one per rule/agent/config change)",
		{ org_id: orgIdField() },
		async ({ org_id }) => api.orgVersions(org_id ?? (await activeOrgId(api))),
	);
	tool(
		server,
		"kredit_restore_org_version",
		"Roll an organization back to a saved version (config + agents + rules). Reversible — the current state is snapshotted first.",
		{ org_id: orgIdField(), version: z.number().int() },
		async ({ org_id, version }) =>
			api.restoreOrgVersion(org_id ?? (await activeOrgId(api)), version),
	);

	// ── Pilot ──
	tool(
		server,
		"kredit_pilot",
		"Stand up a demo fleet and run a live pilot simulation. With no org_id it creates a brand-new organization (one call: org + agents + guardrails + streaming run); with org_id it seeds the fleet into that organization's environment. Returns the run's environment_id — open it in the platform to watch the audit fill in.",
		{
			org_id: z
				.string()
				.optional()
				.describe("Seed into this org. Omit to create a fresh organization."),
			environment_id: z
				.string()
				.optional()
				.describe("Environment to seed into (defaults to the sandbox env)"),
			agent_count: z.number().int().min(1).max(50).optional(),
			integrations: z
				.array(z.string())
				.optional()
				.describe("Providers the fleet may use, e.g. ['stripe','openai']"),
			name: z
				.string()
				.optional()
				.describe("Name for the new organization (only when org_id is omitted)"),
		},
		({ org_id, environment_id, agent_count, integrations, name }) =>
			org_id
				? api.runPilot(org_id, {
						...(agent_count !== undefined ? { agent_count } : {}),
						...(integrations ? { integrations } : {}),
						...(environment_id ? { environment_id } : {}),
					})
				: api.pilotBootstrap({
						...(agent_count !== undefined ? { agent_count } : {}),
						...(integrations ? { integrations } : {}),
						...(name ? { name } : {}),
					}),
	);

	// ── Guardrail rules (the only monetary gate) ──
	tool(
		server,
		"kredit_list_rules",
		"List an organization's guardrail rules. Each rule carries its scope: environment_id (blank = applies org-wide) and agent_id (blank = applies to the whole fleet).",
		{ org_id: orgIdField() },
		async ({ org_id }) => api.listOrgRules(org_id ?? (await activeOrgId(api))),
	);
	tool(
		server,
		"kredit_add_rule",
		"Add a guardrail rule — the ONLY monetary gate. A rule governs actions of `type` on `providers` (empty = all providers) and enforces, in order: blocked list, allow list, spend-per-window cap, hit-rate-per-window cap. Scope it to one agent with agent_id, and to one environment with environment_id (omit for org-wide). An agent's budget is derived from its tightest applicable spend rule.",
		{
			org_id: orgIdField(),
			name: z.string().describe("Rule name, e.g. 'Payment cap'"),
			type: z
				.enum(["payment", "api", "tool"])
				.describe("The action kind this rule governs"),
			providers: z
				.array(z.string())
				.optional()
				.describe("Providers covered, e.g. ['stripe','visa']. Empty = all."),
			spend: z
				.object({
					amount: z.number().describe("Cap in dollars (0 = no cap)"),
					window: z.enum(WINDOW),
				})
				.optional()
				.describe("Spend cap over a rolling window"),
			hit_rate: z
				.object({
					count: z.number().int().describe("Max calls (0 = no cap)"),
					window: z.enum(WINDOW),
				})
				.optional()
				.describe("Call-count cap over a rolling window"),
			allowed: z
				.array(z.string())
				.optional()
				.describe("If non-empty, ONLY these actions/providers are permitted"),
			blocked: z
				.array(z.string())
				.optional()
				.describe("These actions/providers are always denied"),
			agent_id: z
				.string()
				.optional()
				.describe("Scope to one agent. Omit to apply to the whole fleet."),
			environment_id: environmentIdField(),
			mode: modeField(),
		},
		async ({ org_id, ...rule }) =>
			api.addOrgRule(org_id ?? (await activeOrgId(api)), rule),
	);
	tool(
		server,
		"kredit_update_rule",
		"Update a guardrail rule's caps, providers, lists, or enabled flag",
		{
			org_id: orgIdField(),
			rule_id: z.string(),
			name: z.string().optional(),
			type: z.enum(["payment", "api", "tool"]).optional(),
			providers: z.array(z.string()).optional(),
			spend: z
				.object({ amount: z.number(), window: z.enum(WINDOW) })
				.optional(),
			hit_rate: z
				.object({ count: z.number().int(), window: z.enum(WINDOW) })
				.optional(),
			allowed: z.array(z.string()).optional(),
			blocked: z.array(z.string()).optional(),
			enabled: z.boolean().optional(),
		},
		async ({ org_id, rule_id, ...data }) =>
			api.updateOrgRule(org_id ?? (await activeOrgId(api)), rule_id, data),
	);
	tool(
		server,
		"kredit_delete_rule",
		"Delete a guardrail rule from an organization",
		{ org_id: orgIdField(), rule_id: z.string() },
		async ({ org_id, rule_id }) =>
			api.deleteOrgRule(org_id ?? (await activeOrgId(api)), rule_id),
	);

	// ── Agents ──
	tool(
		server,
		"kredit_list_agents",
		"List agents. Agents belong directly to the organization; their mutable state (score, status, counters) is per environment, so scope with environment_id or mode to see one environment's fleet.",
		{
			org_id: orgIdField(),
			mode: modeField(),
			environment_id: environmentIdField(),
			status: z.enum(["active", "throttled", "frozen"]).optional(),
		},
		({ org_id, mode, environment_id, status }) =>
			api.listAgents(org_id, mode, environment_id, status),
	);
	tool(
		server,
		"kredit_create_agent",
		"Create an agent in an organization. `budget` is a convenience that materializes an agent-scoped spend RULE (budgets are always rules, never stored state). New agents are drafts: they may act only in sandbox environments until published.",
		{
			name: z.string().describe("Agent name (unique per organization)"),
			org_id: orgIdField(),
			mode: modeField(),
			environment_id: environmentIdField(),
			priority: z.enum(["critical", "high", "normal", "low"]).optional(),
			budget: z
				.number()
				.optional()
				.describe("Spend cap in dollars — materialized as an agent-scoped rule"),
			budget_window: z
				.enum(WINDOW)
				.optional()
				.describe("Window for the budget rule (default: mo)"),
			backdate_days: z
				.number()
				.int()
				.optional()
				.describe("Make the agent appear older (tenure bonus in simulations)"),
		},
		(args) => api.createAgent(args),
	);
	tool(
		server,
		"kredit_get_agent",
		"Get an agent: identity, priority, kredit score, status, and rules",
		{ agent_id: z.string() },
		({ agent_id }) => api.getAgent(agent_id),
	);
	tool(
		server,
		"kredit_update_agent",
		"Update an agent's name, priority, or status. Status is per-environment — pass environment_id to target one environment's state row.",
		{
			agent_id: z.string(),
			name: z.string().optional(),
			priority: z.enum(["critical", "high", "normal", "low"]).optional(),
			status: z.enum(["active", "throttled", "frozen"]).optional(),
			environment_id: environmentIdField(),
		},
		({ agent_id, ...data }) => api.updateAgent(agent_id, data),
	);
	tool(
		server,
		"kredit_delete_agent",
		"Delete an agent identity and all of its per-environment state",
		{ agent_id: z.string() },
		({ agent_id }) => api.deleteAgent(agent_id),
	);
	tool(
		server,
		"kredit_publish_agent",
		"Publish a draft agent so it may act outside sandbox environments (preview and production)",
		{ agent_id: z.string() },
		({ agent_id }) => api.publishAgent(agent_id),
	);

	// ── Check & Report ──
	tool(
		server,
		"kredit_check",
		"Risk check before a paid action. Returns allow/block with reason, plus the agent's kredit score.",
		{
			agent_id: z.string(),
			action: z
				.string()
				.describe("Action name, e.g. 'openai.chat', 'payment.stripe.charge'"),
			estimated_cost: z.number().describe("Estimated cost in dollars"),
			environment_id: environmentIdField(),
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
		"Report outcome after an action. Updates the agent's credit score.",
		{
			transaction_id: z.string(),
			outcome: z.enum(["success", "failure", "partial"]),
			actual_cost: z.number().optional().describe("Actual cost in dollars"),
		},
		(args) => api.report(args),
	);

	// ── Score & Spend ──
	tool(
		server,
		"kredit_score",
		"Get an agent's kredit score and stats",
		{ agent_id: z.string() },
		({ agent_id }) => api.getScore(agent_id),
	);
	tool(
		server,
		"kredit_spend",
		"Get an agent's spend: totals by window, by category, over time, and recent transactions",
		{ agent_id: z.string() },
		({ agent_id }) => api.getSpend(agent_id),
	);

	// ── Fleet ──
	tool(
		server,
		"kredit_fleet",
		"Fleet overview: agent counts by status, total derived budget, average kredit score, windowed spend, and risk events blocked",
		{
			org_id: orgIdField(),
			mode: modeField(),
			environment_id: environmentIdField(),
		},
		({ org_id, mode, environment_id }) =>
			api.fleetOverview(org_id, mode, environment_id),
	);

	// ── Transactions & events ──
	tool(
		server,
		"kredit_transactions",
		"List transactions (the audit log), scoped by organization, environment, agent, or simulation run",
		{
			org_id: orgIdField(),
			agent_id: z.string().optional(),
			status: z.enum(["allowed", "blocked", "flagged"]).optional(),
			risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
			limit: z.number().int().optional(),
			mode: modeField(),
			environment_id: environmentIdField(),
			simulation_id: z
				.string()
				.optional()
				.describe("Only transactions from this simulation run"),
		},
		(args) => api.listTransactions(args),
	);
	tool(
		server,
		"kredit_events",
		"List an agent's state-change events (score, status, rules, publish)",
		{
			agent_id: z.string(),
			event_type: z
				.string()
				.optional()
				.describe(
					"Filter: score_change, status_change, rule_added, rule_removed, agent_published",
				),
		},
		({ agent_id, event_type }) => api.listEvents(agent_id, event_type),
	);

	// ── Environments ──
	tool(
		server,
		"kredit_list_environments",
		"List an organization's environments. The three modes (sandbox | preview | production) are the standard environments — exactly one production environment per org. Every simulation run is its own sandbox-mode environment nested inside its parent.",
		{ org_id: orgIdField() },
		async ({ org_id }) =>
			api.listEnvironments(org_id ?? (await activeOrgId(api))),
	);
	tool(
		server,
		"kredit_create_environment",
		"Create an environment in an organization with a mode: sandbox (fully simulated), preview (real API calls, no settlement), or production (live)",
		{
			org_id: orgIdField(),
			mode: z
				.enum(["sandbox", "preview", "production"])
				.describe("Environment mode"),
			name: z.string().optional().describe("Optional environment name"),
		},
		async ({ org_id, mode, name }) =>
			api.createEnvironment({
				org_id: org_id ?? (await activeOrgId(api)),
				mode,
				...(name ? { name } : {}),
			}),
	);
	tool(
		server,
		"kredit_get_environment",
		"Get an environment's full manifest: fleet, guardrail rules, priors, workflows, execution settings, recent audit, and live activity",
		{ environment_id: z.string() },
		({ environment_id }) => api.environmentBundle(environment_id),
	);
	tool(
		server,
		"kredit_clone_environment",
		"Clone an environment into a fresh sandbox-mode copy of its whole state (agents, rules, priors). Experiment on an exact copy — of production, even — without touching the live fleet, then run a simulation on the clone.",
		{ environment_id: z.string() },
		({ environment_id }) => api.cloneEnvironment(environment_id),
	);
	tool(
		server,
		"kredit_promote_environment",
		"Promote an environment's full state into a standard-mode environment (sandbox | preview | production), creating it on demand. The target is snapshotted first, so this is reversible.",
		{
			environment_id: z.string().describe("Source environment to promote"),
			mode: z
				.enum(["sandbox", "preview", "production"])
				.describe("Target mode to promote into"),
		},
		({ environment_id, mode }) =>
			api.promoteEnvironmentToMode(environment_id, mode),
	);
	tool(
		server,
		"kredit_go_live",
		"Make an environment the organization's LIVE target — the environment API calls hit when they don't pass an environment_id",
		{ environment_id: z.string() },
		({ environment_id }) => api.goLiveEnvironment(environment_id),
	);
	tool(
		server,
		"kredit_reset_environment",
		"Wipe everything an environment owns (agents' state, rules, priors, runs, transactions) while keeping the environment itself",
		{ environment_id: z.string() },
		({ environment_id }) => api.resetEnvironment(environment_id),
	);
	tool(
		server,
		"kredit_delete_environment",
		"Delete a disposable environment (a simulation run's env or a clone) and all its data. Standard mode environments cannot be deleted — reset them instead.",
		{ environment_id: z.string() },
		({ environment_id }) => api.deleteEnvironment(environment_id),
	);
	tool(
		server,
		"kredit_environment_versions",
		"List an environment's saved state versions (newest first)",
		{ environment_id: z.string() },
		({ environment_id }) => api.environmentVersions(environment_id),
	);
	tool(
		server,
		"kredit_restore_environment",
		"Roll an environment back to a saved state version. Reversible — the current state is snapshotted first.",
		{ environment_id: z.string(), version: z.number().int() },
		({ environment_id, version }) =>
			api.restoreEnvironment(environment_id, version),
	);

	// ── Simulations ──
	tool(
		server,
		"kredit_run_simulation",
		"Run a simulation. Every run gets its OWN environment cloned from the parent, so it never mutates the live fleet. 'realtime' drives real transactions through the trusted path (use stream for a live run); 'predictive' projects the fleet over a horizon with weekly guardrail optimization. Returns environment_id — the run's environment.",
		{
			org_id: orgIdField(),
			environment_id: environmentIdField(),
			mode: z
				.enum(["predictive", "realtime"])
				.optional()
				.describe("Engine mode (default: predictive)"),
			duration_sec: z
				.number()
				.int()
				.optional()
				.describe("Realtime run length in seconds (0 = until stopped)"),
			period: z
				.string()
				.optional()
				.describe("Predictive horizon, e.g. 1d, 1wk, 1mo, 1quarter, 1year"),
			seed: z.number().int().optional().describe("Deterministic seed"),
			stream: z
				.boolean()
				.optional()
				.describe("Return immediately and stream the run server-side"),
			name: z.string().optional().describe("Name for this run"),
		},
		(args) => api.runSimulation({ mode: "predictive", ...args }),
	);
	tool(
		server,
		"kredit_list_simulations",
		"List past and running simulations for an organization",
		{ org_id: orgIdField() },
		({ org_id }) => api.listSimulations(org_id),
	);
	tool(
		server,
		"kredit_get_simulation",
		"Get a simulation run: config, fleet snapshot, results, and its environment_id",
		{ simulation_id: z.string() },
		({ simulation_id }) => api.getSimulation(simulation_id),
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
		"List demand priors (expected call frequency, cost, and seasonality) that drive the simulation engine",
		{
			org_id: orgIdField(),
			mode: modeField(),
			environment_id: environmentIdField(),
		},
		({ org_id, mode, environment_id }) =>
			api.listPriors(org_id, mode, environment_id),
	);
	tool(
		server,
		"kredit_set_prior",
		"Create or update a demand prior. A prior estimates how often an action runs (frequency) and what it costs (cost), plus a weekly/daily seasonality shape. Pass prior_id to update an existing prior; omit it to create one. For seasonality, give a preset name (24x7, weekday, business-hours) OR explicit dow (7 numbers) and hour (24 numbers) weights.",
		{
			name: z.string().describe("Prior name, e.g. 'openai.chat'"),
			org_id: orgIdField(),
			prior_id: z
				.string()
				.optional()
				.describe("Existing prior id to update; omit to create a new prior"),
			agent_id: z
				.string()
				.optional()
				.describe("Scope to one agent; omit for a fleet-wide prior"),
			mode: modeField(),
			environment_id: environmentIdField(),
			frequency_mean: z.number().describe("Expected number of calls per period"),
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
				org_id,
				prior_id,
				agent_id,
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
			return api.createPrior(org_id, {
				name,
				frequency,
				cost,
				...(seasonality ? { seasonality } : {}),
				...(agent_id ? { agent_id } : {}),
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
		"List an organization's workflows (node/edge graphs). Workflows are org-level definitions — the environment is chosen at execution time.",
		{ org_id: orgIdField() },
		({ org_id }) => api.listWorkflows(org_id),
	);
	tool(
		server,
		"kredit_create_workflow",
		"Create a workflow (a graph of nodes and edges) in an organization. Node types: agent|llm|api|tool|payment; api/tool/payment nodes require an integration of the matching kind. Invalid graphs are rejected by the server.",
		{
			org_id: orgIdField(),
			name: z.string().describe("Workflow name (unique per organization)"),
			nodes: z.array(nodeSchema).describe("Workflow nodes"),
			edges: z.array(edgeSchema).describe("Directed edges between node ids"),
		},
		({ org_id, name, nodes, edges }) =>
			api.createWorkflow({
				name,
				nodes,
				edges,
				...(org_id ? { org_id } : {}),
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
			nodes: z
				.array(nodeSchema)
				.optional()
				.describe("Replacement workflow nodes"),
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
		"Simulate a workflow end-to-end via the server engine (no settlement). Returns node_runs plus node_count, blocked_count, and total_cost.",
		{
			workflow_id: z.string(),
			seed: z.number().int().optional().describe("Deterministic seed"),
			environment_id: environmentIdField(),
		},
		({ workflow_id, seed, environment_id }) =>
			api.simulateWorkflow(workflow_id, seed, environment_id),
	);
	tool(
		server,
		"kredit_execute_workflow",
		"Execute a workflow for real through the trusted path, settled per the environment's mode. Returns the run record with node_runs, blocked_count, total_cost, and transaction_ids.",
		{
			workflow_id: z.string(),
			seed: z.number().int().optional().describe("Deterministic seed"),
			environment_id: environmentIdField(),
		},
		({ workflow_id, seed, environment_id }) =>
			api.executeWorkflow(workflow_id, seed, environment_id),
	);
	tool(
		server,
		"kredit_workflow_runs",
		"List past execution runs for a workflow (id, status, node_count, blocked_count, total_cost, created_at)",
		{ workflow_id: z.string() },
		({ workflow_id }) => api.listWorkflowRuns(workflow_id),
	);
	tool(
		server,
		"kredit_get_workflow_run",
		"Get a single workflow run record by run id, including its node_runs and transaction_ids",
		{ run_id: z.string() },
		({ run_id }) => api.getWorkflowRun(run_id),
	);

	// ── Chats ──
	tool(
		server,
		"kredit_list_chats",
		"List persisted kredit-agent chats for an organization",
		{ org_id: orgIdField() },
		({ org_id }) => api.listChats(org_id),
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
		"List partner integrations and whether they execute/settle in a given environment",
		{ org_id: orgIdField(), environment_id: environmentIdField() },
		({ org_id, environment_id }) =>
			api.listIntegrations(org_id, environment_id),
	);

	// ── Action verbs ──
	tool(
		server,
		"kredit_action_intent",
		"Dry-run the trust layer for an action (no execution, no record)",
		{
			agent_id: z.string(),
			action: z
				.string()
				.describe("kind.provider.verb, e.g. payment.stripe.charge"),
			estimated_cost: z.number().optional(),
			environment_id: environmentIdField(),
		},
		(args) => api.actionIntent(args),
	);
	tool(
		server,
		"kredit_execute_action",
		"Execute a payment/api/tool action, gated by the environment's mode (sandbox = fully simulated, preview = real call but no settlement, production = live)",
		{
			agent_id: z.string(),
			action: z.string(),
			provider: z.string().optional(),
			estimated_cost: z.number().optional(),
			environment_id: environmentIdField(),
		},
		(args) => api.executeAction(args),
	);
	tool(
		server,
		"kredit_run",
		"Run the full 6-stage trusted path in one shot (intent → identity → trust → execute → observe → optimize). Returns a transaction_id, status, execution, outcome, and a trust_card with the 6-stage path.",
		{
			agent_id: z.string(),
			action: z
				.string()
				.describe("Action name, e.g. 'openai.chat', 'payment.stripe.charge'"),
			estimated_cost: z
				.number()
				.optional()
				.describe("Estimated cost in dollars"),
			environment_id: environmentIdField(),
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
		"Run a predictive simulation and tighten guardrails on agents projected to overspend their fair share",
		{
			org_id: orgIdField(),
			period: z.string().optional().describe("Horizon, e.g. 1mo"),
			apply: z
				.boolean()
				.optional()
				.describe("Write the tightened rules (false = dry run)"),
		},
		(args) => api.optimize(args),
	);

	return server;
}

/**
 * The activated organization's id — the fallback for tools whose endpoint
 * takes org_id in the PATH (and so can't rely on the server-side default).
 */
async function activeOrgId(api: KreditAPI): Promise<string> {
	const orgs = await api.listOrgs();
	if (!Array.isArray(orgs) || orgs.length === 0) {
		throw new Error(
			"No organizations yet — create one with kredit_create_org (or run kredit_pilot).",
		);
	}
	const active = orgs.find((o: any) => o.active) ?? orgs[0];
	return active.id;
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
