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
	listOrgs() {
		return this.request("GET", "/orgs");
	}
	createOrg(name: string) {
		return this.request("POST", "/orgs", { name });
	}
	renameOrg(id: string, name: string) {
		return this.request("PUT", `/orgs/${id}`, { name });
	}
	deleteOrg(id: string) {
		return this.request("DELETE", `/orgs/${id}`);
	}

	// Agents
	listAgents(orgId?: string) {
		return this.request("GET", `/agents${orgId ? `?org_id=${orgId}` : ""}`);
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
	fleetOverview() {
		return this.request("GET", "/fleet/overview");
	}

	// Transactions
	listTransactions(params?: any) {
		const qs = new URLSearchParams();
		if (params?.agent_id) qs.set("agent_id", params.agent_id);
		if (params?.status) qs.set("status", params.status);
		if (params?.limit) qs.set("limit", String(params.limit));
		const q = qs.toString();
		return this.request("GET", `/transactions${q ? `?${q}` : ""}`);
	}

	// Events
	listEvents(agentId: string, eventType?: string) {
		const q = eventType ? `?event_type=${eventType}` : "";
		return this.request("GET", `/agents/${agentId}/events${q}`);
	}
}
