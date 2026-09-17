#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { type Json, KreditAPI } from "./api.js";
import { resolveConfig } from "./config.js";

type Args = Record<string, unknown>;
type Shape = Record<string, z.ZodTypeAny>;

function tool(
	server: McpServer,
	name: string,
	desc: string,
	schema: Shape,
	fn: (args: Args) => Promise<unknown>,
) {
	server.tool(name, desc, schema, async (args) => {
		try {
			const result = await fn(args as Args);
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

const str = (v: unknown) => v as string;
const num = (v: unknown) => v as number | undefined;

const WINDOW = [
	"txn",
	"sec",
	"min",
	"hr",
	"day",
	"wk",
	"mo",
	"quarter",
	"year",
] as const;

const SERVER_INSTRUCTIONS = `Kredit is the identity and risk layer for AI agents that spend money.

Call kredit_check BEFORE any payment, purchase, transfer, or paid API call.
Describe the intent in words ("buy running shoes from nike.com for $129");
the server reads the action, amount, merchant and rail from the text. The
answer is allow, deny or review, with a score, a reason, and nine risk layers.

An organization owns its agents, rules, integrations and commerce workflows.
Over an API key, deleting an organization or an agent and changing policy
(rules, org settings, a new agent version) do not apply at once: they wait
as a pending approval that a person approves on the console with a passkey.
The active policy stays in force until then. Reviews of decisions and of
commerce runs are decided by a person on the console, never from here.`;

const PENDING =
	"Over an API key this waits as a pending approval that a person approves on the console (Review tab); the active policy stays in force meanwhile.";

// ── shared schemas ──
const toolSchema = z.object({
	name: z.string().describe("Tool name, e.g. 'store_checkout'"),
	kind: z.enum(["mcp", "api", "integration", "builtin"]).optional(),
	provider: z
		.string()
		.optional()
		.describe("Provider key for integration tools, e.g. 'vgs'"),
	scopes: z
		.array(z.string())
		.optional()
		.describe("Scopes the tool grants, e.g. ['payment.card']"),
	description: z.string().optional(),
});

const spendSchema = z
	.object({
		amount: z.number().min(0).describe("Dollars. 0 means no cap."),
		window: z
			.enum(WINDOW)
			.describe("Rolling window. 'txn' caps a single transaction."),
	})
	.describe("Spend cap over a window");

const hitRateSchema = z
	.object({
		count: z.number().int().min(0).describe("Max hits. 0 means no cap."),
		window: z.enum(WINDOW),
	})
	.describe("Call-count cap over a window");

const ruleFields = {
	name: z.string().optional().describe("Rule name, e.g. 'Daily budget'"),
	type: z
		.enum(["payment", "api", "tool"])
		.optional()
		.describe("The action kind this rule governs (default payment)"),
	providers: z
		.array(z.string())
		.optional()
		.describe("Rails or providers covered, e.g. ['card']. Empty means all."),
	spend: spendSchema.nullable().optional(),
	hit_rate: hitRateSchema.nullable().optional(),
	allowed: z
		.array(z.string())
		.optional()
		.describe(
			"If non-empty, only these merchants, domains or actions pass; everything else is a hit",
		),
	blocked: z
		.array(z.string())
		.optional()
		.describe("These merchants, domains or actions are always a hit"),
	enabled: z.boolean().optional().describe("Default true"),
	on_hit: z
		.enum(["deny", "review"])
		.optional()
		.describe("What a hit does: deny, or ask a person (default deny)"),
};
const ruleSchema = z.object(ruleFields);

const guardrailsSchema = z
	.object({
		max_per_action: z
			.number()
			.optional()
			.describe("Dollars: a single action above this is a hit"),
		require_review_above: z
			.number()
			.optional()
			.describe("Dollars: above this a person decides"),
		allowed_merchants: z
			.array(z.string())
			.optional()
			.describe(
				"Vendor allow list by domain, e.g. ['nike.com']. Vendors not on the list are denied.",
			),
		blocked_merchants: z.array(z.string()).optional(),
	})
	.describe("Per-action ceilings and vendor lists");

const merchantSchema = z.object({
	name: z.string(),
	domain: z.string().optional(),
	category: z.string().optional(),
});

const addressSchema = z.object({
	line1: z.string(),
	city: z.string(),
	region: z.string(),
	postal_code: z.string(),
	country: z.string().optional().describe("Default US"),
});

const kybSchema = z
	.object({
		status: z.enum(["verified", "pending", "unverified"]).optional(),
		provider: z.enum(["kredit", "middesk", "skyfire", "kite"]).optional(),
		legal_name: z.string().optional(),
		ein: z.string().optional(),
		address: addressSchema.optional(),
		phone: z.string().optional(),
		email: z.string().optional(),
	})
	.describe("Know your business: the legal entity behind the organization");

const orgSettingsSchema = z
	.object({
		score_floor: z
			.number()
			.int()
			.min(0)
			.max(100)
			.optional()
			.describe("Deny below this score"),
		review_floor: z
			.number()
			.int()
			.min(0)
			.max(100)
			.optional()
			.describe("A person decides below this score"),
		human_guard: z.boolean().optional(),
		email_denials: z.boolean().optional(),
		simulated_in_production: z.boolean().optional(),
		place_orders: z
			.boolean()
			.optional()
			.describe("Whether a commerce run presses the order button"),
	})
	.describe("Defaults applied to every decision in the organization");

function createServer(api: KreditAPI): McpServer {
	const server = new McpServer(
		{ name: "kredit", version: "0.8.0" },
		{ instructions: SERVER_INSTRUCTIONS },
	);

	// ── session ──
	tool(
		server,
		"kredit_whoami",
		"Who this key acts as: the user, whether the session is passkey-verified, and how many passkeys are registered.",
		{},
		() => api.session(),
	);

	// ── organizations ──
	tool(
		server,
		"kredit_list_orgs",
		"List the organizations this key can see. An organization owns its agents, rules, integrations and workflows.",
		{},
		() => api.listOrgs(),
	);
	tool(
		server,
		"kredit_get_org",
		"One organization: name, KYB, KYC, settings, rules and its active version.",
		{ org_id: z.string() },
		({ org_id }) => api.getOrg(str(org_id)),
	);
	tool(
		server,
		"kredit_create_org",
		"Create an organization.",
		{
			name: z.string().min(1).max(120),
			description: z.string().optional(),
		},
		({ name, description }) =>
			api.createOrg({ name, ...(description ? { description } : {}) }),
	);
	tool(
		server,
		"kredit_update_org",
		`Update an organization's name, description, KYB record or settings. ${PENDING}`,
		{
			org_id: z.string(),
			name: z.string().min(1).max(120).optional(),
			description: z.string().optional(),
			kyb: kybSchema.optional(),
			settings: orgSettingsSchema.optional(),
		},
		({ org_id, ...data }) => api.updateOrg(str(org_id), data),
	);
	tool(
		server,
		"kredit_delete_org",
		`Delete an organization and everything under it. ${PENDING}`,
		{ org_id: z.string() },
		({ org_id }) => api.deleteOrg(str(org_id)),
	);
	tool(
		server,
		"kredit_org_summary",
		"Counts and recent activity for an organization: agents, decisions by outcome, pending reviews and approvals.",
		{ org_id: z.string() },
		({ org_id }) => api.orgSummary(str(org_id)),
	);
	tool(
		server,
		"kredit_seed_demo",
		"Create the demo organization with its agents, documents and commerce workflows. Idempotent.",
		{},
		() => api.seed(),
	);

	// ── rules ──
	tool(
		server,
		"kredit_list_rules",
		"The organization's rules: vendor allow and block lists, spend caps per window, hit-rate caps, each with deny or review on a hit.",
		{ org_id: z.string() },
		({ org_id }) => api.listRules(str(org_id)),
	);
	tool(
		server,
		"kredit_add_rule",
		`Add an organization rule. Example: a $500 per day spend cap is {name:'Daily budget', spend:{amount:500, window:'day'}}. ${PENDING}`,
		{ org_id: z.string(), ...ruleFields },
		({ org_id, ...data }) => api.addRule(str(org_id), data),
	);
	tool(
		server,
		"kredit_update_rule",
		`Change part of an organization rule; fields left out keep their value. ${PENDING}`,
		{ org_id: z.string(), rule_id: z.string(), ...ruleFields },
		({ org_id, rule_id, ...data }) =>
			api.updateRule(str(org_id), str(rule_id), data),
	);
	tool(
		server,
		"kredit_delete_rule",
		`Remove an organization rule. ${PENDING}`,
		{ org_id: z.string(), rule_id: z.string() },
		({ org_id, rule_id }) => api.deleteRule(str(org_id), str(rule_id)),
	);

	// ── agents ──
	tool(
		server,
		"kredit_list_agents",
		"The organization's agents with status, KYA, stats and active version.",
		{ org_id: z.string() },
		({ org_id }) => api.listAgents(str(org_id)),
	);
	tool(
		server,
		"kredit_get_agent",
		"One agent: prompt, tools, rules, guardrails, versions, identity and stats. An agent token may read its own agent.",
		{ agent_id: z.string() },
		({ agent_id }) => api.getAgent(str(agent_id)),
	);
	tool(
		server,
		"kredit_create_agent",
		`Create an agent with its brief (prompt), tools, rules and guardrails. Its first version is pending until a person approves it on the console. ${PENDING}`,
		{
			org_id: z.string(),
			name: z.string().min(1).max(120),
			description: z.string().optional(),
			prompt: z.string().describe("What the agent is for: its brief"),
			tools: z.array(toolSchema).optional(),
			rules: z.array(ruleSchema).optional(),
			guardrails: guardrailsSchema.optional(),
		},
		({ org_id, ...data }) => api.createAgent(str(org_id), data),
	);
	tool(
		server,
		"kredit_update_agent",
		"Rename an agent, change its description, or set status 'frozen' or 'active'. A frozen agent is denied everything. Unfreezing on the console always asks for a passkey.",
		{
			agent_id: z.string(),
			name: z.string().optional(),
			description: z.string().optional(),
			status: z.enum(["active", "frozen"]).optional(),
		},
		({ agent_id, ...data }) => api.updateAgent(str(agent_id), data),
	);
	tool(
		server,
		"kredit_delete_agent",
		`Delete an agent. ${PENDING}`,
		{ agent_id: z.string() },
		({ agent_id }) => api.deleteAgent(str(agent_id)),
	);
	tool(
		server,
		"kredit_propose_version",
		`Propose a new version of an agent's policy: prompt, tools, rules, guardrails. ${PENDING}`,
		{
			agent_id: z.string(),
			prompt: z.string().optional(),
			tools: z.array(toolSchema).optional(),
			rules: z.array(ruleSchema).optional(),
			guardrails: guardrailsSchema.optional(),
			note: z.string().optional().describe("Why this change"),
		},
		({ agent_id, ...data }) => api.proposeVersion(str(agent_id), data),
	);
	tool(
		server,
		"kredit_approve_version",
		"Approve a pending agent version for an environment. Needs a passkey-verified session; over an API key the server refuses.",
		{
			agent_id: z.string(),
			version_id: z.string(),
			environment: z.enum(["sandbox", "production"]).optional(),
		},
		({ agent_id, version_id, environment }) =>
			api.approveVersion(
				str(agent_id),
				str(version_id),
				environment as string | undefined,
			),
	);
	tool(
		server,
		"kredit_reject_version",
		"Reject a pending agent version with a note.",
		{
			agent_id: z.string(),
			version_id: z.string(),
			note: z.string().optional(),
		},
		({ agent_id, version_id, note }) =>
			api.rejectVersion(
				str(agent_id),
				str(version_id),
				note as string | undefined,
			),
	);
	tool(
		server,
		"kredit_promote_agent",
		"Promote the agent's active sandbox version to production. Needs a passkey-verified session.",
		{ agent_id: z.string() },
		({ agent_id }) => api.promoteAgent(str(agent_id)),
	);
	tool(
		server,
		"kredit_verify_agent",
		"Verify the agent's identity (KYA) with a provider. On the console this always asks for a passkey.",
		{
			agent_id: z.string(),
			provider: z.enum(["kredit", "skyfire", "kite"]).optional(),
		},
		({ agent_id, provider }) =>
			api.verifyAgent(str(agent_id), provider as string | undefined),
	);
	tool(
		server,
		"kredit_agent_decisions",
		"The agent's decisions, newest first.",
		{
			agent_id: z.string(),
			limit: z.number().int().min(1).max(500).optional(),
			before: z.string().optional().describe("ISO time: page older than this"),
		},
		({ agent_id, limit, before }) =>
			api.agentDecisions(
				str(agent_id),
				num(limit),
				before as string | undefined,
			),
	);

	// ── agent tokens ──
	tool(
		server,
		"kredit_issue_agent_token",
		"Issue a short-lived token (kat_) for an agent: an hour at most, tied to that agent, returned once. With it the agent may only run kredit_check for itself, read its own agent, and rotate its token. The agent must be KYA verified.",
		{
			agent_id: z.string(),
			ttl_minutes: z.number().int().min(1).max(60).optional(),
		},
		({ agent_id, ttl_minutes }) =>
			api.issueAgentToken(str(agent_id), num(ttl_minutes)),
	);
	tool(
		server,
		"kredit_list_agent_tokens",
		"The agent's tokens: prefix, status, expiry, last use. Never the secret.",
		{ agent_id: z.string() },
		({ agent_id }) => api.listAgentTokens(str(agent_id)),
	);
	tool(
		server,
		"kredit_revoke_agent_token",
		"Revoke one of the agent's tokens.",
		{ agent_id: z.string(), token_id: z.string() },
		({ agent_id, token_id }) =>
			api.revokeAgentToken(str(agent_id), str(token_id)),
	);

	// ── the check ──
	tool(
		server,
		"kredit_check",
		"Ask Kredit whether an agent may act, BEFORE it acts. Say what it wants to do in words; amount, merchant, action and rail are read from the text, and any you state outright are taken as given. Returns outcome allow | deny | review, a score 0-100, a reason in plain English, and nine risk layers (agent identity, business identity, intent, compliance, guardrails and policies, scope, financial, fraud, disputes). A review waits for a person on the console. Every decision is recorded.",
		{
			agent_id: z.string(),
			intent: z
				.string()
				.min(2)
				.max(2000)
				.describe(
					"What the agent wants to do, in words, e.g. 'Buy the Pegasus 42 from nike.com for $131.97 by card'",
				),
			environment: z.enum(["sandbox", "production"]).optional(),
			org_id: z.string().optional(),
			action: z
				.string()
				.optional()
				.describe("e.g. payment.card, api.call, tool.use"),
			amount: z.number().min(0).optional(),
			currency: z.string().optional(),
			merchant: merchantSchema.optional(),
			counterparty: z.string().optional(),
			payment_rail: z
				.enum(["card", "usdc", "skyfire", "kite", "ach", "wire", "crypto"])
				.optional(),
			metadata: z.record(z.string(), z.unknown()).optional(),
		},
		(args) => api.check(args as Json),
	);

	// ── decisions ──
	tool(
		server,
		"kredit_list_decisions",
		"The organization's decisions, newest first, with filters.",
		{
			org_id: z.string(),
			agent_id: z.string().optional(),
			outcome: z.enum(["allow", "deny", "review"]).optional(),
			environment: z.enum(["sandbox", "production"]).optional(),
			limit: z.number().int().min(1).max(500).optional(),
			before: z.string().optional(),
		},
		({ org_id, ...filters }) =>
			api.listDecisions(str(org_id), filters as Record<string, never>),
	);
	tool(
		server,
		"kredit_get_decision",
		"One decision with its layers, review and execution.",
		{ decision_id: z.string() },
		({ decision_id }) => api.getDecision(str(decision_id)),
	);
	tool(
		server,
		"kredit_list_reviews",
		"Decisions waiting for a person. They are approved or rejected on the console with a passkey, not from here.",
		{ org_id: z.string() },
		({ org_id }) => api.listReviews(str(org_id)),
	);
	tool(
		server,
		"kredit_execute_decision",
		"Execute an allowed decision on its rail. Sandbox executions are simulated.",
		{ decision_id: z.string() },
		({ decision_id }) => api.executeDecision(str(decision_id)),
	);

	// ── approvals ──
	tool(
		server,
		"kredit_list_approvals",
		"Policy changes and deletes requested over the API that wait for a person: org and agent deletes, rule changes, settings. A person approves them on the console (Review tab), one by one or all at once.",
		{
			org_id: z.string(),
			status: z
				.enum(["pending", "approved", "rejected"])
				.optional()
				.describe("Default pending"),
		},
		({ org_id, status }) =>
			api.listApprovals(str(org_id), status as string | undefined),
	);

	// ── documents ──
	tool(
		server,
		"kredit_list_documents",
		"The organization's documents: policies, sanctions lists, anything the compliance layer reads.",
		{ org_id: z.string() },
		({ org_id }) => api.listDocuments(str(org_id)),
	);
	tool(
		server,
		"kredit_add_document",
		"Add a document as text or by URL. Tag 'sanctions' to have the compliance layer match merchants and counterparties against it.",
		{
			org_id: z.string(),
			name: z.string(),
			kind: z.enum(["text", "url"]).optional().describe("Default text"),
			content: z.string().optional().describe("For kind text"),
			url: z.string().optional().describe("For kind url: fetched server-side"),
			tags: z.array(z.string()).optional(),
		},
		({ org_id, ...data }) => api.addDocument(str(org_id), data),
	);
	tool(
		server,
		"kredit_search_documents",
		"Search the organization's documents.",
		{ org_id: z.string(), q: z.string() },
		({ org_id, q }) => api.searchDocuments(str(org_id), str(q)),
	);
	tool(
		server,
		"kredit_delete_document",
		"Delete a document.",
		{ document_id: z.string() },
		({ document_id }) => api.deleteDocument(str(document_id)),
	);

	// ── integrations ──
	tool(
		server,
		"kredit_list_integrations",
		"The organization's provider integrations (VGS, Skyfire, Kite, Circle and others): mode, whether connected, and the key fields each needs. Values stay masked.",
		{ org_id: z.string() },
		({ org_id }) => api.listIntegrations(str(org_id)),
	);
	tool(
		server,
		"kredit_update_integration",
		"Set a provider's keys by field name (see kredit_list_integrations for the fields), its mode, or enable it. Fields left out keep their value; an empty string clears one.",
		{
			org_id: z.string(),
			provider: z.string().describe("e.g. vgs"),
			keys: z.record(z.string(), z.string()).optional(),
			enabled: z.boolean().optional(),
			mode: z.enum(["simulated", "sandbox", "live"]).optional(),
		},
		({ org_id, provider, ...data }) =>
			api.updateIntegration(str(org_id), str(provider), data),
	);
	tool(
		server,
		"kredit_test_integration",
		"Test a provider integration with its stored keys.",
		{ org_id: z.string(), provider: z.string() },
		({ org_id, provider }) => api.testIntegration(str(org_id), str(provider)),
	);

	// ── audit and orders ──
	tool(
		server,
		"kredit_audit",
		"The organization's audit trail, newest first: versions, decisions, reviews, approvals, documents, integrations, passkeys, orders.",
		{
			org_id: z.string(),
			limit: z.number().int().min(1).max(1000).optional(),
			before: z.string().optional(),
			action: z
				.string()
				.optional()
				.describe("Filter by action, e.g. decision.deny"),
		},
		({ org_id, limit, before, action }) =>
			api.audit(
				str(org_id),
				num(limit),
				before as string | undefined,
				action as string | undefined,
			),
	);
	tool(
		server,
		"kredit_list_orders",
		"Orders placed or simulated by commerce runs and the demo store.",
		{
			org_id: z.string(),
			limit: z.number().int().min(1).max(500).optional(),
		},
		({ org_id, limit }) => api.listOrders(str(org_id), num(limit)),
	);

	// ── environments and simulations ──
	tool(
		server,
		"kredit_list_environments",
		"The organization's environments (sandbox and production are standard).",
		{ org_id: z.string() },
		({ org_id }) => api.listEnvironments(str(org_id)),
	);
	tool(
		server,
		"kredit_create_environment",
		"Create a named environment.",
		{ org_id: z.string(), name: z.string().min(1).max(80) },
		({ org_id, name }) => api.createEnvironment(str(org_id), str(name)),
	);
	tool(
		server,
		"kredit_delete_environment",
		"Delete an environment that is not standard.",
		{ environment_id: z.string() },
		({ environment_id }) => api.deleteEnvironment(str(environment_id)),
	);
	tool(
		server,
		"kredit_run_simulation",
		"Run a batch of simulated intents through the agents' policies and see how the decisions fall.",
		{
			org_id: z.string(),
			environment_id: z.string().optional(),
			agent_ids: z.array(z.string()).optional(),
			count: z.number().int().min(1).max(500).optional().describe("Default 25"),
			scenario: z
				.enum(["normal", "fraud", "runaway", "mixed"])
				.optional()
				.describe("Default mixed"),
			seed: z.number().int().optional(),
		},
		({ org_id, ...data }) => api.runSimulation(str(org_id), data),
	);
	tool(
		server,
		"kredit_list_simulations",
		"Past simulations with their summaries.",
		{ org_id: z.string() },
		({ org_id }) => api.listSimulations(str(org_id)),
	);
	tool(
		server,
		"kredit_get_simulation",
		"One simulation.",
		{ simulation_id: z.string() },
		({ simulation_id }) => api.getSimulation(str(simulation_id)),
	);
	tool(
		server,
		"kredit_stop_simulation",
		"Stop a running simulation.",
		{ simulation_id: z.string() },
		({ simulation_id }) => api.stopSimulation(str(simulation_id)),
	);

	// ── agentic commerce ──
	tool(
		server,
		"kredit_list_workflows",
		"The organization's commerce workflows (query, search, options, choice, identity, risk, approval, checkout, order), their nodes and bindings.",
		{ org_id: z.string() },
		({ org_id }) => api.listWorkflows(str(org_id)),
	);
	tool(
		server,
		"kredit_update_workflow",
		"Change a workflow's name, default query, agent, bindings or identity checks.",
		{
			workflow_id: z.string(),
			name: z.string().min(1).max(80).optional(),
			query: z.string().min(2).max(300).optional(),
			agent_id: z.string().optional(),
			bindings: z.record(z.string(), z.string()).optional(),
			identity: z.record(z.string(), z.string()).optional(),
		},
		({ workflow_id, ...data }) => api.updateWorkflow(str(workflow_id), data),
	);
	tool(
		server,
		"kredit_start_run",
		"Start a commerce run: the agent searches, ranks options, and the run waits at the choice (choice_mode 'you') or picks itself ('agent'). Pass from_run_id to reuse an earlier run's search and start at the choice. Runs in the background; poll kredit_get_run.",
		{
			org_id: z.string(),
			workflow_id: z.string(),
			query: z.string().min(2).max(300).optional(),
			budget: z.number().positive().optional(),
			choice_mode: z.enum(["you", "agent"]).optional().describe("Default you"),
			from_run_id: z.string().optional(),
		},
		({ org_id, ...data }) => api.startRun(str(org_id), data),
	);
	tool(
		server,
		"kredit_list_runs",
		"Recent commerce runs, latest activity first.",
		{ org_id: z.string(), limit: z.number().int().min(1).optional() },
		({ org_id, limit }) => api.listRuns(str(org_id), num(limit)),
	);
	tool(
		server,
		"kredit_get_run",
		"One run with every node's status and result, the finds, the options, the chosen item, the decision and the order.",
		{ run_id: z.string() },
		({ run_id }) => api.getRun(str(run_id)),
	);
	tool(
		server,
		"kredit_choose_option",
		"Choose an option on a run waiting at the choice. Omit find_id to let the agent take the top one.",
		{ run_id: z.string(), find_id: z.string().optional() },
		({ run_id, find_id }) =>
			api.chooseOption(str(run_id), (find_id as string | undefined) ?? null),
	);
	tool(
		server,
		"kredit_rechoose_option",
		"On a finished, failed or stopped run, choose another of its finds and continue from the choice.",
		{ run_id: z.string(), find_id: z.string() },
		({ run_id, find_id }) => api.rechooseOption(str(run_id), str(find_id)),
	);
	tool(
		server,
		"kredit_stop_run",
		"Stop a run. A review on a run is approved or rejected by a person on the console with a passkey, not from here.",
		{ run_id: z.string() },
		({ run_id }) => api.stopRun(str(run_id)),
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
