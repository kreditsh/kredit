import type { Config } from "./config.js";

const TIMEOUT_MS = 5_000;

/** Build a `?a=1&b=2` suffix from defined values (empty string when none). */
function qs(params: Record<string, unknown>): string {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
	}
	const s = sp.toString();
	return s ? `?${s}` : "";
}

/**
 * The Kredit REST surface.
 *
 * Organizations are the top-level tenant: they own agents, environments,
 * workflows and rules. `org_id` is optional on every org-scoped call — the
 * server falls back to the user's ACTIVATED organization (see `activateOrg`).
 * Mode lives on environments, never on the organization.
 */
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

	// ── Organizations (the top-level tenant) ──
	listOrgs() {
		return this.request("GET", "/orgs");
	}
	createOrg(name: string, config?: unknown) {
		return this.request("POST", "/orgs", {
			name,
			...(config ? { config } : {}),
		});
	}
	getOrg(id: string) {
		return this.request("GET", `/orgs/${id}`);
	}
	updateOrg(id: string, data: any) {
		return this.request("PUT", `/orgs/${id}`, data);
	}
	deleteOrg(id: string) {
		return this.request("DELETE", `/orgs/${id}`);
	}
	/** Point this API key (and the kredit agent) at one organization. */
	activateOrg(id: string) {
		return this.request("POST", `/orgs/${id}/activate`);
	}
	resetOrg(id: string) {
		return this.request("POST", `/orgs/${id}/reset`);
	}
	orgActivity(id: string) {
		return this.request("GET", `/orgs/${id}/activity`);
	}
	orgVersions(id: string) {
		return this.request("GET", `/orgs/${id}/versions`);
	}
	restoreOrgVersion(id: string, version: number) {
		return this.request("POST", `/orgs/${id}/restore/${version}`);
	}
	/** Seed a pilot fleet + guardrails in an org and start a live run. */
	runPilot(orgId: string, data: any) {
		return this.request("POST", `/orgs/${orgId}/pilot`, data);
	}
	/** One call: fresh organization + fleet + guardrails + live pilot run. */
	pilotBootstrap(data: any) {
		return this.request("POST", "/pilot", data);
	}

	// ── Guardrail rules (env-owned, org-scoped store) ──
	listOrgRules(orgId: string) {
		return this.request("GET", `/orgs/${orgId}/rules`);
	}
	addOrgRule(orgId: string, rule: any) {
		return this.request("POST", `/orgs/${orgId}/rules`, rule);
	}
	updateOrgRule(orgId: string, ruleId: string, data: any) {
		return this.request("PUT", `/orgs/${orgId}/rules/${ruleId}`, data);
	}
	deleteOrgRule(orgId: string, ruleId: string) {
		return this.request("DELETE", `/orgs/${orgId}/rules/${ruleId}`);
	}

	// ── Agents ──
	listAgents(
		orgId?: string,
		mode?: string,
		environmentId?: string,
		status?: string,
	) {
		return this.request(
			"GET",
			`/agents${qs({ org_id: orgId, mode, environment_id: environmentId, status })}`,
		);
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
	/** Publish a draft agent so it may act outside sandbox environments. */
	publishAgent(id: string) {
		return this.request("POST", `/agents/${id}/publish`);
	}

	// ── Per-agent match-pattern rules ──
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

	// ── Check & Report ──
	check(data: any) {
		return this.request("POST", "/check", data);
	}
	report(data: any) {
		return this.request("POST", "/report", data);
	}

	// ── Score & Spend ──
	getScore(agentId: string) {
		return this.request("GET", `/agents/${agentId}/score`);
	}
	getSpend(agentId: string) {
		return this.request("GET", `/agents/${agentId}/spend`);
	}

	// ── Fleet ──
	fleetOverview(orgId?: string, mode?: string, environmentId?: string) {
		return this.request(
			"GET",
			`/fleet/overview${qs({ org_id: orgId, mode, environment_id: environmentId })}`,
		);
	}

	// ── Transactions ──
	listTransactions(params?: any) {
		return this.request(
			"GET",
			`/transactions${qs({
				org_id: params?.org_id,
				agent_id: params?.agent_id,
				status: params?.status,
				risk_level: params?.risk_level,
				limit: params?.limit,
				mode: params?.mode,
				environment_id: params?.environment_id,
				simulation_id: params?.simulation_id,
			})}`,
		);
	}

	// ── Events ──
	listEvents(agentId: string, eventType?: string) {
		return this.request(
			"GET",
			`/agents/${agentId}/events${qs({ event_type: eventType })}`,
		);
	}

	// ── Environments (mode lives here: sandbox | preview | production) ──
	listEnvironments(orgId: string) {
		return this.request("GET", `/environments${qs({ org_id: orgId })}`);
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
	/** The full environment manifest: fleet, rules, priors, audit, activity. */
	environmentBundle(id: string) {
		return this.request("GET", `/environments/${id}/bundle`);
	}
	/** Copy an environment's whole state into a fresh sandbox-mode clone. */
	cloneEnvironment(id: string) {
		return this.request("POST", `/environments/${id}/clone`);
	}
	resetEnvironment(id: string) {
		return this.request("POST", `/environments/${id}/reset`);
	}
	/** Make this environment the org's live/default API target. */
	goLiveEnvironment(id: string) {
		return this.request("POST", `/environments/${id}/go-live`);
	}
	promoteEnvironmentToMode(id: string, mode: string) {
		return this.request("POST", `/environments/${id}/promote-to-mode/${mode}`);
	}
	promoteEnvironmentTo(sourceId: string, targetId: string) {
		return this.request("POST", `/environments/${sourceId}/promote-to/${targetId}`);
	}
	environmentVersions(id: string) {
		return this.request("GET", `/environments/${id}/versions`);
	}
	snapshotEnvironment(id: string, reason?: string) {
		return this.request("POST", `/environments/${id}/snapshot${qs({ reason })}`);
	}
	restoreEnvironment(id: string, version: number) {
		return this.request("POST", `/environments/${id}/restore/${version}`);
	}

	// ── Simulations ──
	runSimulation(data: any) {
		return this.request("POST", "/simulations/run", data);
	}
	listSimulations(orgId?: string) {
		return this.request("GET", `/simulations${qs({ org_id: orgId })}`);
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
	listPriors(orgId?: string, mode?: string, environmentId?: string) {
		return this.request(
			"GET",
			`/priors${qs({ org_id: orgId, mode, environment_id: environmentId })}`,
		);
	}
	createPrior(orgId: string | undefined, data: any) {
		return this.request("POST", `/priors${qs({ org_id: orgId })}`, data);
	}
	updatePrior(priorId: string, data: any) {
		return this.request("PUT", `/priors/${priorId}`, data);
	}
	deletePrior(priorId: string) {
		return this.request("DELETE", `/priors/${priorId}`);
	}

	// ── Workflows (org-level definitions; the env is chosen at run time) ──
	listWorkflows(orgId?: string) {
		return this.request("GET", `/workflows${qs({ org_id: orgId })}`);
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
	simulateWorkflow(id: string, seed?: number, environmentId?: string) {
		return this.request(
			"POST",
			`/workflows/${id}/simulate${qs({ seed, environment_id: environmentId })}`,
		);
	}
	executeWorkflow(id: string, seed?: number, environmentId?: string) {
		return this.request(
			"POST",
			`/workflows/${id}/execute${qs({ seed, environment_id: environmentId })}`,
		);
	}
	listWorkflowRuns(id: string) {
		return this.request("GET", `/workflows/${id}/runs`);
	}
	getWorkflowRun(runId: string) {
		return this.request("GET", `/workflows/runs/${runId}`);
	}

	// ── Chats ──
	listChats(orgId?: string) {
		return this.request("GET", `/chats${qs({ org_id: orgId })}`);
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
	listIntegrations(orgId?: string, environmentId?: string) {
		return this.request(
			"GET",
			`/integrations${qs({ org_id: orgId, environment_id: environmentId })}`,
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
