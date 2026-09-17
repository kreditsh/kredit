import type { Config } from "./config.js";

const TIMEOUT_MS = 10_000;
/** The check runs nine risk layers; seeding builds a whole demo organization. */
const SLOW_TIMEOUT_MS = 30_000;

/** Every request says where it came from, so policy changes made here are recorded as MCP-sourced. */
const SOURCE_HEADER = "X-Kredit-Source";
const SOURCE = "mcp";

export type Json = Record<string, unknown>;
export type Window =
	| "txn"
	| "sec"
	| "min"
	| "hr"
	| "day"
	| "wk"
	| "mo"
	| "quarter"
	| "year";

/** A failed request: the HTTP status and the server's `detail` when it gave one. */
export class KreditError extends Error {
	readonly status: number;
	readonly detail: string;
	constructor(status: number, detail: string) {
		super(`${status}: ${detail}`);
		this.name = "KreditError";
		this.status = status;
		this.detail = detail;
	}
}

interface RequestOptions {
	timeoutMs?: number;
}

/** Build a `?a=1&b=2` suffix from defined values (empty string when none). */
function qs(params: Record<string, unknown>): string {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
	}
	const s = sp.toString();
	return s ? `?${s}` : "";
}

function detailOf(text: string, statusText: string): string {
	try {
		const parsed = JSON.parse(text);
		if (parsed && typeof parsed === "object" && "detail" in parsed) {
			const d = (parsed as { detail: unknown }).detail;
			return typeof d === "string" ? d : JSON.stringify(d);
		}
	} catch {
		// not JSON: fall through to the raw text
	}
	return text || statusText || "request failed";
}

/**
 * The Kredit API. Paths are at the root of the API host. Authenticates with
 * an API key (kr_live_) or an agent token (kat_). An agent token may only
 * check its own intents, read its own agent, and rotate its own token.
 */
export class KreditAPI {
	private baseUrl: string;
	private apiKey: string;

	constructor(config: Config) {
		this.baseUrl = config.apiUrl.replace(/\/+$/, "");
		this.apiKey = config.apiKey;
	}

	async request(
		method: string,
		path: string,
		body?: unknown,
		opts: RequestOptions = {},
	): Promise<Json> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			[SOURCE_HEADER]: SOURCE,
		};
		if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			opts.timeoutMs ?? TIMEOUT_MS,
		);
		try {
			const res = await fetch(url, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal,
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new KreditError(res.status, detailOf(text, res.statusText));
			}
			if (res.status === 204) return {};
			return (await res.json()) as Json;
		} finally {
			clearTimeout(timeout);
		}
	}

	// ── session ──
	session() {
		return this.request("GET", "/session");
	}

	// ── organizations ──
	listOrgs() {
		return this.request("GET", "/orgs");
	}
	getOrg(orgId: string) {
		return this.request("GET", `/orgs/${orgId}`);
	}
	createOrg(data: Json) {
		return this.request("POST", "/orgs", data);
	}
	updateOrg(orgId: string, data: Json) {
		return this.request("PUT", `/orgs/${orgId}`, data);
	}
	deleteOrg(orgId: string) {
		return this.request("DELETE", `/orgs/${orgId}`);
	}
	orgSummary(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/summary`);
	}
	/** Idempotent: the demo organization with its agents, documents and workflows. */
	seed() {
		return this.request("POST", "/seed", undefined, {
			timeoutMs: SLOW_TIMEOUT_MS,
		});
	}

	// ── organization rules ──
	listRules(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/rules`);
	}
	addRule(orgId: string, data: Json) {
		return this.request("POST", `/orgs/${orgId}/rules`, data);
	}
	updateRule(orgId: string, ruleId: string, data: Json) {
		return this.request("PUT", `/orgs/${orgId}/rules/${ruleId}`, data);
	}
	deleteRule(orgId: string, ruleId: string) {
		return this.request("DELETE", `/orgs/${orgId}/rules/${ruleId}`);
	}

	// ── agents ──
	listAgents(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/agents`);
	}
	getAgent(agentId: string) {
		return this.request("GET", `/agents/${agentId}`);
	}
	createAgent(orgId: string, data: Json) {
		return this.request("POST", `/orgs/${orgId}/agents`, data);
	}
	updateAgent(agentId: string, data: Json) {
		return this.request("PUT", `/agents/${agentId}`, data);
	}
	deleteAgent(agentId: string) {
		return this.request("DELETE", `/agents/${agentId}`);
	}
	proposeVersion(agentId: string, data: Json) {
		return this.request("POST", `/agents/${agentId}/versions`, data);
	}
	approveVersion(agentId: string, versionId: string, environment?: string) {
		return this.request(
			"POST",
			`/agents/${agentId}/versions/${versionId}/approve`,
			environment ? { environment } : {},
		);
	}
	rejectVersion(agentId: string, versionId: string, note?: string) {
		return this.request(
			"POST",
			`/agents/${agentId}/versions/${versionId}/reject`,
			note ? { note } : {},
		);
	}
	promoteAgent(agentId: string) {
		return this.request("POST", `/agents/${agentId}/promote`, {
			environment: "production",
		});
	}
	verifyAgent(agentId: string, provider?: string) {
		return this.request(
			"POST",
			`/agents/${agentId}/verify-identity`,
			provider ? { provider } : {},
		);
	}
	agentDecisions(agentId: string, limit?: number, before?: string) {
		return this.request(
			"GET",
			`/agents/${agentId}/decisions${qs({ limit, before })}`,
		);
	}

	// ── agent tokens ──
	issueAgentToken(agentId: string, ttlMinutes?: number) {
		return this.request(
			"POST",
			`/agents/${agentId}/tokens`,
			ttlMinutes ? { ttl_minutes: ttlMinutes } : {},
		);
	}
	listAgentTokens(agentId: string) {
		return this.request("GET", `/agents/${agentId}/tokens`);
	}
	revokeAgentToken(agentId: string, tokenId: string) {
		return this.request("DELETE", `/agents/${agentId}/tokens/${tokenId}`);
	}

	// ── the check ──
	check(data: Json) {
		return this.request(
			"POST",
			"/check",
			{ ...data, source: "mcp" },
			{ timeoutMs: SLOW_TIMEOUT_MS },
		);
	}

	// ── decisions ──
	listDecisions(
		orgId: string,
		filters: {
			agent_id?: string;
			outcome?: string;
			environment?: string;
			limit?: number;
			before?: string;
		} = {},
	) {
		return this.request("GET", `/orgs/${orgId}/decisions${qs(filters)}`);
	}
	getDecision(decisionId: string) {
		return this.request("GET", `/decisions/${decisionId}`);
	}
	listReviews(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/reviews`);
	}
	executeDecision(decisionId: string) {
		return this.request("POST", `/decisions/${decisionId}/execute`, {});
	}

	// ── approvals (policy changes waiting for a person) ──
	listApprovals(orgId: string, status?: string) {
		return this.request("GET", `/orgs/${orgId}/approvals${qs({ status })}`);
	}

	// ── documents ──
	listDocuments(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/documents`);
	}
	addDocument(orgId: string, data: Json) {
		return this.request("POST", `/orgs/${orgId}/documents`, data, {
			timeoutMs: SLOW_TIMEOUT_MS,
		});
	}
	searchDocuments(orgId: string, q: string) {
		return this.request("GET", `/orgs/${orgId}/documents/search${qs({ q })}`);
	}
	deleteDocument(docId: string) {
		return this.request("DELETE", `/documents/${docId}`);
	}

	// ── integrations ──
	listIntegrations(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/integrations`);
	}
	updateIntegration(orgId: string, provider: string, data: Json) {
		return this.request("PUT", `/orgs/${orgId}/integrations/${provider}`, data);
	}
	testIntegration(orgId: string, provider: string) {
		return this.request(
			"POST",
			`/orgs/${orgId}/integrations/${provider}/test`,
			{},
			{ timeoutMs: SLOW_TIMEOUT_MS },
		);
	}

	// ── audit and orders ──
	audit(orgId: string, limit?: number, before?: string, action?: string) {
		return this.request(
			"GET",
			`/orgs/${orgId}/audit${qs({ limit, before, action })}`,
		);
	}
	listOrders(orgId: string, limit?: number) {
		return this.request("GET", `/orgs/${orgId}/orders${qs({ limit })}`);
	}

	// ── environments and simulations ──
	listEnvironments(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/environments`);
	}
	createEnvironment(orgId: string, name: string) {
		return this.request("POST", `/orgs/${orgId}/environments`, { name });
	}
	deleteEnvironment(envId: string) {
		return this.request("DELETE", `/environments/${envId}`);
	}
	runSimulation(orgId: string, data: Json) {
		return this.request("POST", `/orgs/${orgId}/simulations/run`, data, {
			timeoutMs: SLOW_TIMEOUT_MS,
		});
	}
	listSimulations(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/simulations`);
	}
	getSimulation(simId: string) {
		return this.request("GET", `/simulations/${simId}`);
	}
	stopSimulation(simId: string) {
		return this.request("POST", `/simulations/${simId}/stop`, {});
	}

	// ── agentic commerce ──
	listWorkflows(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/commerce/workflows`);
	}
	updateWorkflow(workflowId: string, data: Json) {
		return this.request("PUT", `/commerce/workflows/${workflowId}`, data);
	}
	startRun(orgId: string, data: Json) {
		return this.request("POST", `/orgs/${orgId}/commerce/runs`, data);
	}
	listRuns(orgId: string, limit?: number) {
		return this.request("GET", `/orgs/${orgId}/commerce/runs${qs({ limit })}`);
	}
	getRun(runId: string) {
		return this.request("GET", `/commerce/runs/${runId}`);
	}
	chooseOption(runId: string, findId: string | null) {
		return this.request("POST", `/commerce/runs/${runId}/choose`, {
			find_id: findId,
		});
	}
	rechooseOption(runId: string, findId: string) {
		return this.request("POST", `/commerce/runs/${runId}/rechoose`, {
			find_id: findId,
		});
	}
	stopRun(runId: string) {
		return this.request("POST", `/commerce/runs/${runId}/stop`, {});
	}
}
