import { AuthError, KreditError, RiskDenied } from "./errors.js";
import {
	type Agent,
	AgentSchema,
	type AgentSpend,
	AgentSpendSchema,
	type Chat,
	ChatSchema,
	type CheckResult,
	CheckResultSchema,
	type Environment,
	EnvironmentSchema,
	type FleetOverview,
	FleetOverviewSchema,
	type Gaussian,
	type Org,
	OrgSchema,
	type Prior,
	PriorSchema,
	type Seasonality,
	type ReportResult,
	ReportResultSchema,
	type Rule,
	RuleSchema,
	type ScoreResult,
	ScoreResultSchema,
	type Transaction,
	TransactionSchema,
	type Wallet,
	WalletSchema,
	type Workflow,
	WorkflowSchema,
} from "./models.js";

const DEFAULT_BASE_URL = "https://api.kredit.sh";
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MAX_RETRIES = 2;

export interface KreditOptions {
	apiKey?: string;
	baseUrl?: string;
	timeout?: number;
	maxRetries?: number;
}

function resolveApiKey(apiKey?: string): string {
	if (apiKey) return apiKey;

	const envKey = process.env.KREDIT_API_KEY;
	if (envKey) return envKey;

	// Node-only: try reading ~/.kredit/config
	try {
		// Dynamic import would be async; for config file fallback we use a sync approach
		// In browser environments this simply won't resolve
		const fs = require("node:fs");
		const path = require("node:path");
		const os = require("node:os");
		const configPath = path.join(os.homedir(), ".kredit", "config");
		if (fs.existsSync(configPath)) {
			const content = fs.readFileSync(configPath, "utf-8") as string;
			for (const line of content.split("\n")) {
				const trimmed = line.trim();
				if (trimmed.startsWith("api_key=")) {
					return trimmed.split("=").slice(1).join("=").trim();
				}
				if (trimmed.startsWith("KREDIT_API_KEY=")) {
					return trimmed.split("=").slice(1).join("=").trim();
				}
			}
		}
	} catch {
		// Not in Node or file doesn't exist — that's fine
	}

	throw new AuthError(
		"No API key provided. Pass apiKey, set KREDIT_API_KEY, or add api_key=... to ~/.kredit/config",
	);
}

function resolveBaseUrl(baseUrl?: string): string {
	if (baseUrl) return baseUrl.replace(/\/+$/, "");
	const envUrl = process.env.KREDIT_API_URL;
	if (envUrl) return envUrl.replace(/\/+$/, "");
	return DEFAULT_BASE_URL;
}

function safeJson(body: unknown): Record<string, unknown> {
	if (body && typeof body === "object") return body as Record<string, unknown>;
	return {};
}

/** Orgs sub-client. */
class Orgs {
	constructor(private client: Kredit) {}

	/** Create an organization. */
	async create(params: {
		name: string;
		mode?: string;
		environmentId?: string;
	}): Promise<Org> {
		const body: Record<string, unknown> = { name: params.name };
		if (params.mode !== undefined) body.mode = params.mode;
		if (params.environmentId !== undefined)
			body.environment_id = params.environmentId;
		const data = await this.client._request("POST", "/orgs", { body });
		return OrgSchema.parse(data);
	}

	/** List all organizations. */
	async list(params?: { mode?: string; environmentId?: string }): Promise<Org[]> {
		const reqParams: Record<string, string> = {};
		if (params?.mode !== undefined) reqParams.mode = params.mode;
		if (params?.environmentId !== undefined)
			reqParams.environment_id = params.environmentId;
		const data = await this.client._request("GET", "/orgs", {
			params: reqParams,
		});
		return (data as unknown[]).map((item) => OrgSchema.parse(item));
	}
}

/** Agents sub-client. */
class Agents {
	constructor(private client: Kredit) {}

	/** Create an agent. Pass either orgId or orgName. */
	async create(params: {
		name: string;
		orgId?: string;
		orgName?: string;
		sandboxId?: string;
		mode?: string;
		environmentId?: string;
		priority?: string;
		budgets?: Record<string, unknown>;
	}): Promise<Agent> {
		const body: Record<string, unknown> = { name: params.name };
		if (params.orgId) {
			body.org_id = params.orgId;
		} else if (params.orgName) {
			body.org_name = params.orgName;
		} else {
			throw new KreditError("Either orgId or orgName must be provided");
		}
		if (params.sandboxId) body.sandbox_id = params.sandboxId;
		if (params.mode !== undefined) body.mode = params.mode;
		if (params.environmentId !== undefined)
			body.environment_id = params.environmentId;
		if (params.priority) body.priority = params.priority;
		if (params.budgets) body.budgets = params.budgets;
		const data = await this.client._request("POST", "/agents", { body });
		return AgentSchema.parse(data);
	}

	/** List agents, optionally filtered by organization. */
	async list(params?: {
		orgId?: string;
		mode?: string;
		environmentId?: string;
	}): Promise<Agent[]> {
		const reqParams: Record<string, string> = {};
		if (params?.orgId) reqParams.org_id = params.orgId;
		if (params?.mode !== undefined) reqParams.mode = params.mode;
		if (params?.environmentId !== undefined)
			reqParams.environment_id = params.environmentId;
		const data = await this.client._request("GET", "/agents", {
			params: reqParams,
		});
		return (data as unknown[]).map((item) => AgentSchema.parse(item));
	}

	/** Get a single agent by ID. */
	async get(params: { agentId: string }): Promise<Agent> {
		const data = await this.client._request("GET", `/agents/${params.agentId}`);
		return AgentSchema.parse(data);
	}

	/** Update an agent. */
	async update(params: {
		agentId: string;
		name?: string;
		priority?: string;
		wallet?: Record<string, unknown>;
	}): Promise<Agent> {
		const body: Record<string, unknown> = {};
		if (params.name !== undefined) body.name = params.name;
		if (params.priority !== undefined) body.priority = params.priority;
		if (params.wallet !== undefined) body.wallet = params.wallet;
		const data = await this.client._request(
			"PUT",
			`/agents/${params.agentId}`,
			{ body },
		);
		return AgentSchema.parse(data);
	}

	/** Delete an agent. */
	async delete(params: { agentId: string }): Promise<void> {
		await this.client._request("DELETE", `/agents/${params.agentId}`);
	}
}

/** Rules sub-client. */
class Rules {
	constructor(private client: Kredit) {}

	/** List rules for an agent. */
	async list(params: { agentId: string }): Promise<Rule[]> {
		const data = await this.client._request(
			"GET",
			`/agents/${params.agentId}/rules`,
		);
		return (data as unknown[]).map((item) => RuleSchema.parse(item));
	}

	/** Add a rule to an agent. */
	async add(params: {
		agentId: string;
		name?: string;
		match?: string;
		mode?: string;
		max_cost_per_txn?: number;
		daily_spend_limit?: number;
		hourly_rate_limit?: number;
	}): Promise<Rule> {
		const body: Record<string, unknown> = {};
		if (params.name !== undefined) body.name = params.name;
		if (params.match !== undefined) body.match = params.match;
		if (params.mode !== undefined) body.mode = params.mode;
		if (params.max_cost_per_txn !== undefined)
			body.max_cost_per_txn = params.max_cost_per_txn;
		if (params.daily_spend_limit !== undefined)
			body.daily_spend_limit = params.daily_spend_limit;
		if (params.hourly_rate_limit !== undefined)
			body.hourly_rate_limit = params.hourly_rate_limit;
		const data = await this.client._request(
			"POST",
			`/agents/${params.agentId}/rules`,
			{ body },
		);
		return RuleSchema.parse(data);
	}

	/** Update a rule. */
	async update(params: {
		agentId: string;
		ruleId: string;
		name?: string;
		match?: string;
		max_cost_per_txn?: number;
		daily_spend_limit?: number;
		hourly_rate_limit?: number;
		enabled?: boolean;
	}): Promise<Rule> {
		const { agentId, ruleId, ...body } = params;
		const data = await this.client._request(
			"PUT",
			`/agents/${agentId}/rules/${ruleId}`,
			{ body: body as Record<string, unknown> },
		);
		return RuleSchema.parse(data);
	}

	/** Remove a rule from an agent. */
	async remove(params: { agentId: string; ruleId: string }): Promise<void> {
		await this.client._request(
			"DELETE",
			`/agents/${params.agentId}/rules/${params.ruleId}`,
		);
	}
}

/** Transactions sub-client. */
class Transactions {
	constructor(private client: Kredit) {}

	/** List transactions with optional filters. */
	async list(params?: {
		agentId?: string;
		status?: string;
		riskLevel?: string;
		mode?: string;
		environmentId?: string;
		limit?: number;
		offset?: number;
	}): Promise<Transaction[]> {
		const reqParams: Record<string, string> = {};
		if (params?.agentId) reqParams.agent_id = params.agentId;
		if (params?.mode !== undefined) reqParams.mode = params.mode;
		if (params?.environmentId !== undefined)
			reqParams.environment_id = params.environmentId;
		if (params?.status) reqParams.status = params.status;
		if (params?.riskLevel) reqParams.risk_level = params.riskLevel;
		if (params?.limit !== undefined) reqParams.limit = String(params.limit);
		if (params?.offset !== undefined) reqParams.offset = String(params.offset);
		const data = await this.client._request("GET", "/transactions", {
			params: reqParams,
		});
		return (data as unknown[]).map((item) => TransactionSchema.parse(item));
	}
}

/** Wallet sub-client. */
class WalletClient {
	constructor(private client: Kredit) {}

	/** Get wallet for an agent. */
	async get(params: { agentId: string }): Promise<Wallet> {
		const data = await this.client._request(
			"GET",
			`/wallets/${params.agentId}`,
		);
		return WalletSchema.parse(data);
	}

	/** Update wallet fields (balance, budget, max_per_txn, daily_spend_limit). */
	async update(params: {
		agentId: string;
		balance?: number;
		budget?: number;
		max_per_txn?: number;
		daily_spend_limit?: number;
	}): Promise<Wallet> {
		const body: Record<string, unknown> = {};
		if (params.balance !== undefined) body.balance = params.balance;
		if (params.budget !== undefined) body.budget = params.budget;
		if (params.max_per_txn !== undefined) body.max_per_txn = params.max_per_txn;
		if (params.daily_spend_limit !== undefined)
			body.daily_spend_limit = params.daily_spend_limit;
		const data = await this.client._request(
			"PUT",
			`/wallets/${params.agentId}`,
			{ body },
		);
		return WalletSchema.parse(data);
	}

	/**
	 * Set wallet budget.
	 * @deprecated Use `update()` instead.
	 */
	async setBudget(params: {
		agentId: string;
		budget: number;
	}): Promise<Wallet> {
		return this.update({ agentId: params.agentId, budget: params.budget });
	}
}

/** Sandboxes — environment containers (sandbox | preview | production). */
class Sandboxes {
	constructor(private readonly client: Kredit) {}

	async list(): Promise<any[]> {
		return (await this.client._request("GET", "/sandboxes")) as any[];
	}
	async create(params: { name: string; config?: Record<string, unknown> }): Promise<any> {
		const body: Record<string, unknown> = { name: params.name };
		if (params.config) body.config = params.config;
		return this.client._request("POST", "/sandboxes", { body });
	}
	async get(params: { sandboxId: string }): Promise<any> {
		return this.client._request("GET", `/sandboxes/${params.sandboxId}`);
	}
	async update(params: {
		sandboxId: string;
		name?: string;
		config?: Record<string, unknown>;
	}): Promise<any> {
		const body: Record<string, unknown> = {};
		if (params.name !== undefined) body.name = params.name;
		if (params.config !== undefined) body.config = params.config;
		return this.client._request("PUT", `/sandboxes/${params.sandboxId}`, { body });
	}
	async delete(params: { sandboxId: string }): Promise<void> {
		await this.client._request("DELETE", `/sandboxes/${params.sandboxId}`);
	}
	async copy(params: { sandboxId: string; name: string }): Promise<any> {
		return this.client._request("POST", `/sandboxes/${params.sandboxId}/copy`, {
			body: { name: params.name },
		});
	}
	async promotePreview(params: { sandboxId: string }): Promise<any> {
		return this.client._request("POST", `/sandboxes/${params.sandboxId}/promote/preview`);
	}
	async promoteProduction(params: { previewSandboxId: string }): Promise<any> {
		return this.client._request(
			"POST",
			`/sandboxes/${params.previewSandboxId}/promote/production`,
		);
	}
	async versions(params: { sandboxId: string }): Promise<any> {
		return this.client._request("GET", `/sandboxes/${params.sandboxId}/versions`);
	}
	async switch(params: { sandboxId: string; version: number }): Promise<any> {
		return this.client._request(
			"POST",
			`/sandboxes/${params.sandboxId}/switch/${params.version}`,
		);
	}
	async deploy(params: {
		sandboxId: string;
		fromMode: string;
		toMode: string;
		include?: string[];
		sourceSimulationId?: string;
	}): Promise<any> {
		const body: Record<string, unknown> = {
			from_mode: params.fromMode,
			to_mode: params.toMode,
			include: params.include ?? ["orgs", "agents", "rules"],
		};
		if (params.sourceSimulationId !== undefined)
			body.source_simulation_id = params.sourceSimulationId;
		return this.client._request(
			"POST",
			`/sandboxes/${params.sandboxId}/deploy`,
			{ body },
		);
	}
}

/** Trust simulations on a sandbox. */
class Simulations {
	constructor(private readonly client: Kredit) {}

	async run(params: {
		sandboxId: string;
		mode?: "predictive" | "realtime";
		period?: string;
		durationSec?: number;
		monthlyBudget?: number;
		seed?: number;
		stream?: boolean;
		name?: string;
	}): Promise<any> {
		const body: Record<string, unknown> = {
			sandbox_id: params.sandboxId,
			mode: params.mode ?? "predictive",
			period: params.period ?? "1mo",
			duration_sec: params.durationSec ?? 60,
			monthly_budget: params.monthlyBudget ?? 0,
			seed: params.seed ?? 42,
		};
		if (params.stream !== undefined) body.stream = params.stream;
		if (params.name !== undefined) body.name = params.name;
		return this.client._request("POST", "/simulations/run", { body });
	}
	async list(params?: { sandboxId?: string }): Promise<any[]> {
		const q = params?.sandboxId ? { sandbox_id: params.sandboxId } : undefined;
		return (await this.client._request("GET", "/simulations", { params: q })) as any[];
	}
	async get(params: { simulationId: string }): Promise<any> {
		return this.client._request("GET", `/simulations/${params.simulationId}`);
	}

	/** Stop a running (streaming) simulation. Returns `{ ok, stopped }`. */
	async stop(params: { simulationId: string }): Promise<any> {
		return this.client._request(
			"POST",
			`/simulations/${params.simulationId}/stop`,
		);
	}

	/**
	 * Stream events from a running simulation as they occur.
	 *
	 * Yields each Server-Sent Event as a parsed object — `{ type: "action", … }`
	 * events, `{ type: "ping" }` keepalives, and a final
	 * `{ type: "done", total_actions: N }` event, after which the generator ends.
	 */
	async *stream(params: {
		simulationId: string;
	}): AsyncGenerator<any, void, unknown> {
		yield* this.client._stream(`/simulations/${params.simulationId}/stream`);
	}
}

/** Partner integrations. */
class Integrations {
	constructor(private readonly client: Kredit) {}

	async list(params?: { sandboxId?: string }): Promise<any> {
		const q = params?.sandboxId ? { sandbox_id: params.sandboxId } : undefined;
		return this.client._request("GET", "/integrations", { params: q });
	}
}

/** Action verbs: intent / execute / scoreTrust / optimize. */
class Actions {
	constructor(private readonly client: Kredit) {}

	async intent(params: {
		agentId: string;
		action: string;
		estimatedCost?: number;
	}): Promise<any> {
		return this.client._request("POST", "/actions/intent", {
			body: {
				agent_id: params.agentId,
				action: params.action,
				estimated_cost: params.estimatedCost ?? 0,
			},
		});
	}
	async execute(params: {
		agentId: string;
		action: string;
		provider?: string;
		estimatedCost?: number;
		type?: string;
	}): Promise<any> {
		const body: Record<string, unknown> = {
			agent_id: params.agentId,
			action: params.action,
			estimated_cost: params.estimatedCost ?? 0,
			type: params.type ?? "api_call",
		};
		if (params.provider) body.provider = params.provider;
		return this.client._request("POST", "/actions/execute", { body });
	}
	async run(params: {
		agentId: string;
		action: string;
		provider?: string;
		estimatedCost?: number;
		type?: string;
		outcome?: string;
	}): Promise<any> {
		const body: Record<string, unknown> = {
			agent_id: params.agentId,
			action: params.action,
			estimated_cost: params.estimatedCost ?? 0,
			type: params.type ?? "api_call",
			outcome: params.outcome ?? "success",
		};
		if (params.provider) body.provider = params.provider;
		return this.client._request("POST", "/actions/run", { body });
	}
	async scoreTrust(params: { agentId: string }): Promise<any> {
		return this.client._request("POST", "/actions/score", {
			body: { agent_id: params.agentId },
		});
	}
	async optimize(params: {
		sandboxId: string;
		period?: string;
		apply?: boolean;
	}): Promise<any> {
		return this.client._request("POST", "/actions/optimize", {
			body: {
				sandbox_id: params.sandboxId,
				period: params.period ?? "1mo",
				apply: params.apply ?? true,
			},
		});
	}
}

/** Priors sub-client — distributions that drive simulations. */
class Priors {
	constructor(private client: Kredit) {}

	/** List priors for a sandbox, optionally filtered by mode. */
	async list(
		sandboxId: string,
		mode?: string,
		environmentId?: string,
	): Promise<Prior[]> {
		const reqParams: Record<string, string> = { sandbox_id: sandboxId };
		if (mode !== undefined) reqParams.mode = mode;
		if (environmentId !== undefined) reqParams.environment_id = environmentId;
		const data = await this.client._request("GET", "/priors", {
			params: reqParams,
		});
		return (data as unknown[]).map((item) => PriorSchema.parse(item));
	}

	/** Create a prior in a sandbox. `sandbox_id` is sent as a query param. */
	async create(
		sandboxId: string,
		params: {
			name: string;
			frequency: Gaussian;
			cost: Gaussian;
			seasonality: Seasonality;
			transitions?: Record<string, number>;
			source?: string;
			mode?: string;
			environmentId?: string;
			workflowId?: string;
		},
	): Promise<Prior> {
		const body: Record<string, unknown> = {
			name: params.name,
			frequency: params.frequency,
			cost: params.cost,
			seasonality: params.seasonality,
		};
		if (params.transitions !== undefined) body.transitions = params.transitions;
		if (params.source !== undefined) body.source = params.source;
		if (params.mode !== undefined) body.mode = params.mode;
		if (params.environmentId !== undefined)
			body.environment_id = params.environmentId;
		if (params.workflowId !== undefined) body.workflow_id = params.workflowId;
		const data = await this.client._request("POST", "/priors", {
			body,
			params: { sandbox_id: sandboxId },
		});
		return PriorSchema.parse(data);
	}

	/** Update a prior. */
	async update(
		priorId: string,
		patch: {
			name?: string;
			frequency?: Gaussian;
			cost?: Gaussian;
			transitions?: Record<string, number>;
			seasonality?: Seasonality;
		},
	): Promise<Prior> {
		const body: Record<string, unknown> = {};
		if (patch.name !== undefined) body.name = patch.name;
		if (patch.frequency !== undefined) body.frequency = patch.frequency;
		if (patch.cost !== undefined) body.cost = patch.cost;
		if (patch.transitions !== undefined) body.transitions = patch.transitions;
		if (patch.seasonality !== undefined) body.seasonality = patch.seasonality;
		const data = await this.client._request("PUT", `/priors/${priorId}`, {
			body,
		});
		return PriorSchema.parse(data);
	}

	/** Delete a prior. */
	async delete(priorId: string): Promise<void> {
		await this.client._request("DELETE", `/priors/${priorId}`);
	}

	/** Ready-made seasonality presets keyed by name (24x7, weekday, business-hours). */
	async presets(): Promise<Record<string, Seasonality>> {
		const data = await this.client._request("GET", "/priors/presets");
		return data as Record<string, Seasonality>;
	}
}

/** Node spec accepted when creating or updating a workflow. */
export interface WorkflowNodeInput {
	id: string;
	type: string; // agent | llm | api | tool | payment
	label: string;
	integration?: string;
	config?: Record<string, unknown>;
}

/** Edge spec accepted when creating or updating a workflow. */
export interface WorkflowEdgeInput {
	from: string;
	to: string;
	condition?: string;
}

/** Workflows sub-client — agent graphs (nodes + edges) per sandbox. */
class Workflows {
	constructor(private client: Kredit) {}

	/** List workflows for a sandbox, optionally filtered by mode. `sandbox_id` is a query param. */
	async list(
		sandboxId: string,
		mode?: string,
		environmentId?: string,
	): Promise<Workflow[]> {
		const reqParams: Record<string, string> = { sandbox_id: sandboxId };
		if (mode !== undefined) reqParams.mode = mode;
		if (environmentId !== undefined) reqParams.environment_id = environmentId;
		const data = await this.client._request("GET", "/workflows", {
			params: reqParams,
		});
		return (data as unknown[]).map((item) => WorkflowSchema.parse(item));
	}

	/** Create a workflow. `sandbox_id` is sent in the body. */
	async create(
		sandboxId: string,
		params: {
			name: string;
			nodes: WorkflowNodeInput[];
			edges: WorkflowEdgeInput[];
			mode?: string;
			environmentId?: string;
		},
	): Promise<Workflow> {
		const body: Record<string, unknown> = {
			sandbox_id: sandboxId,
			name: params.name,
			nodes: params.nodes,
			edges: params.edges,
		};
		if (params.mode !== undefined) body.mode = params.mode;
		if (params.environmentId !== undefined)
			body.environment_id = params.environmentId;
		const data = await this.client._request("POST", "/workflows", { body });
		return WorkflowSchema.parse(data);
	}

	/** Get a single workflow by ID. */
	async get(id: string): Promise<Workflow> {
		const data = await this.client._request("GET", `/workflows/${id}`);
		return WorkflowSchema.parse(data);
	}

	/** Update a workflow's name, nodes, and/or edges. */
	async update(
		id: string,
		patch: {
			name?: string;
			nodes?: WorkflowNodeInput[];
			edges?: WorkflowEdgeInput[];
		},
	): Promise<Workflow> {
		const body: Record<string, unknown> = {};
		if (patch.name !== undefined) body.name = patch.name;
		if (patch.nodes !== undefined) body.nodes = patch.nodes;
		if (patch.edges !== undefined) body.edges = patch.edges;
		const data = await this.client._request("PUT", `/workflows/${id}`, { body });
		return WorkflowSchema.parse(data);
	}

	/** Delete a workflow. Returns `{ ok: true }`. */
	async delete(id: string): Promise<any> {
		return this.client._request("DELETE", `/workflows/${id}`);
	}

	/** Version history for a workflow — `{ current, history: [...] }`. */
	async versions(id: string): Promise<any> {
		return this.client._request("GET", `/workflows/${id}/versions`);
	}

	/** Simulate a workflow run. Returns node runs, blocked count, and total cost. */
	async simulate(id: string, seed?: number): Promise<any> {
		const params: Record<string, string> = {};
		if (seed !== undefined) params.seed = String(seed);
		return this.client._request("POST", `/workflows/${id}/simulate`, {
			params,
		});
	}

	/**
	 * Execute the workflow for real through the trusted path, settled per mode.
	 * Returns the run record — `{ id, workflow_id, sandbox_id, mode, status,
	 * node_count, blocked_count, total_cost, elapsed_sec, node_runs, transaction_ids,
	 * created_at }`.
	 */
	async execute(id: string, seed?: number): Promise<any> {
		const params: Record<string, string> = {};
		if (seed !== undefined) params.seed = String(seed);
		return this.client._request("POST", `/workflows/${id}/execute`, {
			params,
		});
	}

	/** List past runs for a workflow, newest first. */
	async runs(id: string): Promise<any[]> {
		return (await this.client._request(
			"GET",
			`/workflows/${id}/runs`,
		)) as any[];
	}

	/** Get a single run record by its run id (the full run record). */
	async getRun(runId: string): Promise<any> {
		return this.client._request("GET", `/workflows/runs/${runId}`);
	}
}

/** Environments sub-client — a sandbox contains environments (modes + simulations). */
class Environments {
	constructor(private client: Kredit) {}

	/** List environments for a sandbox. `sandbox_id` is a query param. */
	async list(sandboxId: string): Promise<Environment[]> {
		const data = await this.client._request("GET", "/environments", {
			params: { sandbox_id: sandboxId },
		});
		return (data as unknown[]).map((item) => EnvironmentSchema.parse(item));
	}

	/** Create an environment. `sandbox_id` is sent in the body. */
	async create(
		sandboxId: string,
		params: { mode: string; name?: string; simulationId?: string },
	): Promise<Environment> {
		const body: Record<string, unknown> = {
			sandbox_id: sandboxId,
			mode: params.mode,
		};
		if (params.name !== undefined) body.name = params.name;
		if (params.simulationId !== undefined)
			body.simulation_id = params.simulationId;
		const data = await this.client._request("POST", "/environments", { body });
		return EnvironmentSchema.parse(data);
	}

	/** Get a single environment by ID. */
	async get(id: string): Promise<Environment> {
		const data = await this.client._request("GET", `/environments/${id}`);
		return EnvironmentSchema.parse(data);
	}

	/** Delete an environment. Standard/mode environments cannot be deleted (400). */
	async delete(id: string): Promise<void> {
		await this.client._request("DELETE", `/environments/${id}`);
	}
}

/** Chats sub-client — assistant conversations, optionally scoped to a sandbox. */
class Chats {
	constructor(private client: Kredit) {}

	/** List chats, optionally filtered by sandbox. `sandbox_id` is a query param. */
	async list(sandboxId?: string): Promise<Chat[]> {
		const params = sandboxId !== undefined ? { sandbox_id: sandboxId } : undefined;
		const data = await this.client._request("GET", "/chats", { params });
		return (data as unknown[]).map((item) => ChatSchema.parse(item));
	}

	/** Create a chat. All fields sent in the body. */
	async create(params?: {
		sandboxId?: string;
		mode?: string;
		environmentId?: string;
		simulationId?: string;
		title?: string;
	}): Promise<Chat> {
		const body: Record<string, unknown> = {};
		if (params?.sandboxId !== undefined) body.sandbox_id = params.sandboxId;
		if (params?.mode !== undefined) body.mode = params.mode;
		if (params?.environmentId !== undefined)
			body.environment_id = params.environmentId;
		if (params?.simulationId !== undefined)
			body.simulation_id = params.simulationId;
		if (params?.title !== undefined) body.title = params.title;
		const data = await this.client._request("POST", "/chats", { body });
		return ChatSchema.parse(data);
	}

	/** Get a single chat by ID, including its messages. */
	async get(id: string): Promise<Chat> {
		const data = await this.client._request("GET", `/chats/${id}`);
		return ChatSchema.parse(data);
	}

	/** Delete a chat. Returns `{ ok: true }`. */
	async delete(id: string): Promise<any> {
		return this.client._request("DELETE", `/chats/${id}`);
	}
}

/** Kredit SDK client. */
export class Kredit {
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly maxRetries: number;

	readonly orgs: Orgs;
	readonly agents: Agents;
	readonly wallet: WalletClient;
	readonly rules: Rules;
	readonly transactions: Transactions;
	readonly sandboxes: Sandboxes;
	readonly simulations: Simulations;
	readonly integrations: Integrations;
	readonly actions: Actions;
	readonly priors: Priors;
	readonly workflows: Workflows;
	readonly environments: Environments;
	readonly chats: Chats;

	constructor(options: KreditOptions = {}) {
		this.apiKey = resolveApiKey(options.apiKey);
		this.baseUrl = resolveBaseUrl(options.baseUrl);
		this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
		this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

		this.orgs = new Orgs(this);
		this.agents = new Agents(this);
		this.wallet = new WalletClient(this);
		this.rules = new Rules(this);
		this.transactions = new Transactions(this);
		this.sandboxes = new Sandboxes(this);
		this.simulations = new Simulations(this);
		this.integrations = new Integrations(this);
		this.actions = new Actions(this);
		this.priors = new Priors(this);
		this.workflows = new Workflows(this);
		this.environments = new Environments(this);
		this.chats = new Chats(this);
	}

	/** Internal: send an HTTP request with retry and backoff. */
	async _request(
		method: string,
		path: string,
		options?: {
			body?: Record<string, unknown>;
			params?: Record<string, string>;
		},
	): Promise<unknown> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				let url = `${this.baseUrl}${path}`;
				if (options?.params) {
					const qs = new URLSearchParams(options.params).toString();
					url += `?${qs}`;
				}

				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), this.timeout);

				const resp = await fetch(url, {
					method,
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
						"User-Agent": "kredit-typescript/0.7.11",
					},
					body: options?.body ? JSON.stringify(options.body) : undefined,
					signal: controller.signal,
				});

				clearTimeout(timer);
				return await this.handleResponse(resp);
			} catch (error) {
				// Don't retry client errors (KreditError with 4xx status)
				if (
					error instanceof KreditError &&
					error.statusCode !== undefined &&
					error.statusCode < 500
				) {
					throw error;
				}

				lastError = error as Error;
				if (attempt < this.maxRetries) {
					await sleep(500 * 2 ** attempt);
					continue;
				}
			}
		}

		if (lastError instanceof KreditError) throw lastError;
		throw new KreditError(
			`Request failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
		);
	}

	/**
	 * Internal: stream Server-Sent Events from `path`, yielding parsed `data:`
	 * objects. Reuses the client base url + auth header. Ends after a `done`
	 * event. No request timeout is applied — streams are long-lived.
	 */
	async *_stream(path: string): AsyncGenerator<any, void, unknown> {
		const url = `${this.baseUrl}${path}`;
		const resp = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				Accept: "text/event-stream",
				"User-Agent": "kredit-typescript/0.7.11",
			},
		});

		if (!resp.ok || !resp.body) {
			await this.handleResponse(resp);
			return;
		}

		const reader = resp.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let sep: number;
				// SSE events are separated by a blank line (double newline).
				while ((sep = buffer.indexOf("\n\n")) !== -1) {
					const rawEvent = buffer.slice(0, sep);
					buffer = buffer.slice(sep + 2);

					for (const line of rawEvent.split("\n")) {
						if (!line.startsWith("data:")) continue;
						const payload = line.slice(5).trim();
						if (!payload) continue;
						let event: any;
						try {
							event = JSON.parse(payload);
						} catch {
							continue;
						}
						yield event;
						if (event?.type === "done") return;
					}
				}
			}
		} finally {
			await reader.cancel().catch(() => {});
		}
	}

	private async handleResponse(resp: Response): Promise<unknown> {
		let body: unknown;
		try {
			body = await resp.json();
		} catch {
			body = {};
		}

		if (resp.status === 401) {
			const b = safeJson(body);
			throw new AuthError((b.error as string) ?? "Authentication failed", b);
		}
		if (resp.status === 403) {
			const b = safeJson(body);
			throw new RiskDenied((b.error as string) ?? "Forbidden", b);
		}
		if (resp.status === 429) {
			throw new KreditError("Rate limited", {
				statusCode: 429,
				body: safeJson(body),
			});
		}
		if (resp.status >= 500) {
			throw new KreditError(`Server error (${resp.status})`, {
				statusCode: resp.status,
				body: safeJson(body),
			});
		}
		if (resp.status >= 400) {
			const b = safeJson(body);
			throw new KreditError(
				(b.error as string) ?? `Request failed (${resp.status})`,
				{ statusCode: resp.status, body: b },
			);
		}

		return body;
	}

	/** Run a risk check before executing an action. Hot path -- kept minimal. */
	async check(params: {
		agentId: string;
		action: string;
		estimatedCost: number;
		type?: string;
		metadata?: Record<string, unknown>;
	}): Promise<CheckResult> {
		const body: Record<string, unknown> = {
			agent_id: params.agentId,
			action: params.action,
			estimated_cost: params.estimatedCost,
		};
		if (params.type) body.type = params.type;
		if (params.metadata) body.metadata = params.metadata;
		const data = await this._request("POST", "/check", { body });
		return CheckResultSchema.parse(data);
	}

	/** Report the outcome of an action after completion. */
	async report(params: {
		transactionId: string;
		outcome: "success" | "failure" | "partial";
		actualCost?: number;
	}): Promise<ReportResult> {
		const body: Record<string, unknown> = {
			transaction_id: params.transactionId,
			outcome: params.outcome,
		};
		if (params.actualCost !== undefined) body.actual_cost = params.actualCost;
		const data = await this._request("POST", "/report", { body });
		return ReportResultSchema.parse(data);
	}

	/** Get the credit score for an agent. */
	async score(params: { agentId: string }): Promise<ScoreResult> {
		const data = await this._request("GET", `/agents/${params.agentId}/score`);
		return ScoreResultSchema.parse(data);
	}

	/** Get fleet overview. */
	async fleet(params?: {
		mode?: string;
		environmentId?: string;
	}): Promise<FleetOverview> {
		const reqParams: Record<string, string> = {};
		if (params?.mode !== undefined) reqParams.mode = params.mode;
		if (params?.environmentId !== undefined)
			reqParams.environment_id = params.environmentId;
		const data = await this._request("GET", "/fleet/overview", {
			params: reqParams,
		});
		return FleetOverviewSchema.parse(data);
	}

	/** Get spend summary for an agent. */
	async spend(params: { agentId: string }): Promise<AgentSpend> {
		const data = await this._request("GET", `/agents/${params.agentId}/spend`);
		return AgentSpendSchema.parse(data);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
