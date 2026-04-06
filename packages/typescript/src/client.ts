import { AuthError, KreditError, RiskDenied } from "./errors.js";
import {
	type Agent,
	AgentSchema,
	type AgentSpend,
	AgentSpendSchema,
	type CheckResult,
	CheckResultSchema,
	type FleetOverview,
	FleetOverviewSchema,
	type Org,
	OrgSchema,
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
	async create(params: { name: string }): Promise<Org> {
		const data = await this.client._request("POST", "/orgs", {
			body: { name: params.name },
		});
		return OrgSchema.parse(data);
	}

	/** List all organizations. */
	async list(): Promise<Org[]> {
		const data = await this.client._request("GET", "/orgs");
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
	}): Promise<Agent> {
		const body: Record<string, unknown> = { name: params.name };
		if (params.orgId) {
			body.org_id = params.orgId;
		} else if (params.orgName) {
			body.org_name = params.orgName;
		} else {
			throw new KreditError("Either orgId or orgName must be provided");
		}
		const data = await this.client._request("POST", "/agents", { body });
		return AgentSchema.parse(data);
	}

	/** List agents, optionally filtered by organization. */
	async list(params?: { orgId?: string }): Promise<Agent[]> {
		const reqParams: Record<string, string> = {};
		if (params?.orgId) reqParams.org_id = params.orgId;
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
		max_cost_per_txn?: number;
		daily_spend_limit?: number;
		hourly_rate_limit?: number;
	}): Promise<Rule> {
		const body: Record<string, unknown> = {};
		if (params.name !== undefined) body.name = params.name;
		if (params.match !== undefined) body.match = params.match;
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
		limit?: number;
		offset?: number;
	}): Promise<Transaction[]> {
		const reqParams: Record<string, string> = {};
		if (params?.agentId) reqParams.agent_id = params.agentId;
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
						"User-Agent": "kredit-typescript/0.6.0",
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
	async fleet(): Promise<FleetOverview> {
		const data = await this._request("GET", "/fleet/overview");
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
