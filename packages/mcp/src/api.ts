import type { Config } from "./config.js";

const TIMEOUT_MS = 5_000;

export class KreditAPI {
	private baseUrl: string;
	private apiKey: string;

	constructor(config: Config) {
		this.baseUrl = config.apiUrl.replace(/\/+$/, "");
		this.apiKey = config.apiKey;
	}

	async request(method: string, path: string, body?: unknown): Promise<any> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

		try {
			const res = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(`${res.status} ${res.statusText}: ${text}`);
			}
			return await res.json();
		} finally {
			clearTimeout(timeout);
		}
	}

	// Orgs
	listOrgs(mode?: string, environmentId?: string) {
		const qs = new URLSearchParams();
		if (mode) qs.set("mode", mode);
		if (environmentId) qs.set("environment_id", environmentId);
		const q = qs.toString();
		return this.request("GET", `/orgs${q ? `?${q}` : ""}`);
	}
	createOrg(name: string, mode?: string, environmentId?: string) {
		return this.request("POST", "/orgs", {
			name,
			...(mode ? { mode } : {}),
			...(environmentId ? { environment_id: environmentId } : {}),
		});
	}
	renameOrg(id: string, name: string) {
		return this.request("PUT", `/orgs/${id}`, { name });
	}
	deleteOrg(id: string) {
		return this.request("DELETE", `/orgs/${id}`);
	}

	// Agents
	listAgents(orgId?: string, mode?: string, environmentId?: string) {
		const qs = new URLSearchParams();
		if (orgId) qs.set("org_id", orgId);
		if (mode) qs.set("mode", mode);
		if (environmentId) qs.set("environment_id", environmentId);
		const q = qs.toString();
		return this.request("GET", `/agents${q ? `?${q}` : ""}`);
	}
	createAgent(data: any) {
		return this.request("POST", "/agents", data);
	}
	getAgent(id: string) {
		return this.request("GET", `/agents/${id}`);
	}
	updateAgent(id: string, data: any) {
		return this.request("PUT", `/agents/${id}`, data);
	}
	deleteAgent(id: string) {
		return this.request("DELETE", `/agents/${id}`);
	}

	// Rules
	listRules(agentId: string) {
		return this.request("GET", `/agents/${agentId}/rules`);
	}
	addRule(agentId: string, rule: any) {
		return this.request("POST", `/agents/${agentId}/rules`, rule);
	}
	updateRule(agentId: string, ruleId: string, data: any) {
		return this.request("PUT", `/agents/${agentId}/rules/${ruleId}`, data);
	}
	deleteRule(agentId: string, ruleId: string) {
		return this.request("DELETE", `/agents/${agentId}/rules/${ruleId}`);
	}

	// Check & Report
	check(data: any) {
		return this.request("POST", "/check", data);
	}
	report(data: any) {
		return this.request("POST", "/report", data);
	}

	// Score & Spend
	getScore(agentId: string) {
		return this.request("GET", `/agents/${agentId}/score`);
	}
	getSpend(agentId: string) {
		return this.request("GET", `/agents/${agentId}/spend`);
	}

	// Wallet
	getWallet(agentId: string) {
		return this.request("GET", `/wallets/${agentId}`);
	}
	updateWallet(agentId: string, data: any) {
		return this.request("PUT", `/wallets/${agentId}`, data);
	}

	// Fleet
	fleetOverview(mode?: string, environmentId?: string) {
		const qs = new URLSearchParams();
		if (mode) qs.set("mode", mode);
		if (environmentId) qs.set("environment_id", environmentId);
		const q = qs.toString();
		return this.request("GET", `/fleet/overview${q ? `?${q}` : ""}`);
	}

	// Transactions
	listTransactions(params?: any) {
		const qs = new URLSearchParams();
		if (params?.agent_id) qs.set("agent_id", params.agent_id);
		if (params?.status) qs.set("status", params.status);
		if (params?.limit) qs.set("limit", String(params.limit));
		if (params?.mode) qs.set("mode", params.mode);
		if (params?.environment_id) qs.set("environment_id", params.environment_id);
		const q = qs.toString();
		return this.request("GET", `/transactions${q ? `?${q}` : ""}`);
	}

	// Events
	listEvents(agentId: string, eventType?: string) {
		const q = eventType ? `?event_type=${eventType}` : "";
		return this.request("GET", `/agents/${agentId}/events${q}`);
	}

	// ── Sandboxes (environment containers) ──
	listSandboxes() {
		return this.request("GET", "/sandboxes");
	}
	createSandbox(data: any) {
		return this.request("POST", "/sandboxes", data);
	}
	getSandbox(id: string) {
		return this.request("GET", `/sandboxes/${id}`);
	}
	updateSandbox(id: string, data: any) {
		return this.request("PUT", `/sandboxes/${id}`, data);
	}
	deleteSandbox(id: string) {
		return this.request("DELETE", `/sandboxes/${id}`);
	}
	copySandbox(id: string, name: string) {
		return this.request("POST", `/sandboxes/${id}/copy`, { name });
	}
	promotePreview(id: string) {
		return this.request("POST", `/sandboxes/${id}/promote/preview`);
	}
	promoteProduction(id: string) {
		return this.request("POST", `/sandboxes/${id}/promote/production`);
	}
	sandboxVersions(id: string) {
		return this.request("GET", `/sandboxes/${id}/versions`);
	}
	switchVersion(id: string, version: number) {
		return this.request("POST", `/sandboxes/${id}/switch/${version}`);
	}
	deployMode(id: string, data: any) {
		return this.request("POST", `/sandboxes/${id}/deploy`, data);
	}

	// ── Simulations ──
	runSimulation(data: any) {
		return this.request("POST", "/simulations/run", data);
	}
	listSimulations(sandboxId?: string) {
		return this.request(
			"GET",
			`/simulations${sandboxId ? `?sandbox_id=${sandboxId}` : ""}`,
		);
	}
	getSimulation(id: string) {
		return this.request("GET", `/simulations/${id}`);
	}
	stopSimulation(id: string) {
		return this.request("POST", `/simulations/${id}/stop`);
	}

	// ── Priors ──
	getPriorPresets() {
		return this.request("GET", "/priors/presets");
	}
	listPriors(sandboxId: string, mode?: string, environmentId?: string) {
		const qs = new URLSearchParams();
		qs.set("sandbox_id", sandboxId);
		if (mode) qs.set("mode", mode);
		if (environmentId) qs.set("environment_id", environmentId);
		return this.request("GET", `/priors?${qs.toString()}`);
	}
	createPrior(sandboxId: string, data: any) {
		return this.request(
			"POST",
			`/priors?sandbox_id=${encodeURIComponent(sandboxId)}`,
			data,
		);
	}
	updatePrior(priorId: string, data: any) {
		return this.request("PUT", `/priors/${priorId}`, data);
	}
	deletePrior(priorId: string) {
		return this.request("DELETE", `/priors/${priorId}`);
	}

	// ── Workflows ──
	listWorkflows(sandboxId: string, mode?: string, environmentId?: string) {
		const qs = new URLSearchParams();
		qs.set("sandbox_id", sandboxId);
		if (mode) qs.set("mode", mode);
		if (environmentId) qs.set("environment_id", environmentId);
		return this.request("GET", `/workflows?${qs.toString()}`);
	}
	createWorkflow(data: any) {
		return this.request("POST", "/workflows", data);
	}
	getWorkflow(id: string) {
		return this.request("GET", `/workflows/${id}`);
	}
	updateWorkflow(id: string, data: any) {
		return this.request("PUT", `/workflows/${id}`, data);
	}
	deleteWorkflow(id: string) {
		return this.request("DELETE", `/workflows/${id}`);
	}
	simulateWorkflow(id: string, seed?: number) {
		return this.request(
			"POST",
			`/workflows/${id}/simulate${seed !== undefined ? `?seed=${seed}` : ""}`,
		);
	}
	executeWorkflow(id: string, seed?: number) {
		return this.request(
			"POST",
			`/workflows/${id}/execute${seed !== undefined ? `?seed=${seed}` : ""}`,
		);
	}
	listWorkflowRuns(id: string) {
		return this.request("GET", `/workflows/${id}/runs`);
	}
	getWorkflowRun(runId: string) {
		return this.request("GET", `/workflows/runs/${runId}`);
	}

	// ── Environments ──
	listEnvironments(sandboxId: string) {
		return this.request(
			"GET",
			`/environments?sandbox_id=${encodeURIComponent(sandboxId)}`,
		);
	}
	createEnvironment(data: any) {
		return this.request("POST", "/environments", data);
	}
	getEnvironment(id: string) {
		return this.request("GET", `/environments/${id}`);
	}
	deleteEnvironment(id: string) {
		return this.request("DELETE", `/environments/${id}`);
	}

	// ── Chats ──
	listChats(sandboxId?: string) {
		return this.request(
			"GET",
			`/chats${sandboxId ? `?sandbox_id=${encodeURIComponent(sandboxId)}` : ""}`,
		);
	}
	createChat(data: any) {
		return this.request("POST", "/chats", data);
	}
	getChat(id: string) {
		return this.request("GET", `/chats/${id}`);
	}
	deleteChat(id: string) {
		return this.request("DELETE", `/chats/${id}`);
	}

	// ── Integrations ──
	listIntegrations(sandboxId?: string) {
		return this.request(
			"GET",
			`/integrations${sandboxId ? `?sandbox_id=${sandboxId}` : ""}`,
		);
	}

	// ── Action verbs ──
	actionIntent(data: any) {
		return this.request("POST", "/actions/intent", data);
	}
	executeAction(data: any) {
		return this.request("POST", "/actions/execute", data);
	}
	run(data: any) {
		return this.request("POST", "/actions/run", data);
	}
	scoreTrust(agentId: string) {
		return this.request("POST", "/actions/score", { agent_id: agentId });
	}
	optimize(data: any) {
		return this.request("POST", "/actions/optimize", data);
	}
}
