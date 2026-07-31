import { describe, it, expect, vi, beforeEach } from "vitest";
import { KreditAPI } from "../src/api.js";

function mockFetch(responseBody: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		json: () => Promise.resolve(responseBody),
		text: () => Promise.resolve(JSON.stringify(responseBody)),
	});
}

describe("KreditAPI", () => {
	const config = {
		apiKey: "kr_live_test",
		apiUrl: "https://api.kredit.sh",
	};

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("check", () => {
		it("sends POST /check with correct body and headers", async () => {
			const body = {
				transaction_id: "txn_123",
				status: "allowed",
				risk_level: "low",
				block_reason: null,
				agent_status: "active",
				credit_score: 750,
			};
			const fetchMock = mockFetch(body);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.check({
				agent_id: "agent_1",
				action: "openai.chat",
				estimated_cost: 5.0,
			});

			expect(result.status).toBe("allowed");
			expect(result.credit_score).toBe(750);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/check");
			expect(opts.method).toBe("POST");
			expect(opts.headers["Authorization"]).toBe("Bearer kr_live_test");
			expect(JSON.parse(opts.body)).toEqual({
				agent_id: "agent_1",
				action: "openai.chat",
				estimated_cost: 5.0,
			});
		});
	});

	describe("report", () => {
		it("sends POST /report with correct body", async () => {
			const fetchMock = mockFetch({ ok: true, credit_score: 760 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.report({
				transaction_id: "txn_123",
				outcome: "success",
				actual_cost: 4.2,
			});

			expect(result.ok).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/report");
			expect(opts.method).toBe("POST");
		});
	});

	// ── Organizations (the top-level tenant) ──

	describe("listOrgs", () => {
		it("sends GET /orgs", async () => {
			const fetchMock = mockFetch([{ id: "org_1", active: true }]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.listOrgs();

			expect(result[0].active).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs");
			expect(opts.method).toBe("GET");
		});
	});

	describe("createOrg", () => {
		it("sends POST /orgs with the name", async () => {
			const fetchMock = mockFetch({ id: "org_1", name: "acme" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.createOrg("acme");

			expect(result.id).toBe("org_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs");
			expect(JSON.parse(opts.body)).toEqual({ name: "acme" });
		});

		it("includes config in the body when provided", async () => {
			const fetchMock = mockFetch({ id: "org_1" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createOrg("acme", { auto_load_rules: false });

			const [, opts] = fetchMock.mock.calls[0];
			expect(JSON.parse(opts.body)).toEqual({
				name: "acme",
				config: { auto_load_rules: false },
			});
		});
	});

	describe("activateOrg", () => {
		it("sends POST /orgs/:id/activate", async () => {
			const fetchMock = mockFetch({ id: "org_1", active: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.activateOrg("org_1");

			expect(result.active).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs/org_1/activate");
			expect(opts.method).toBe("POST");
		});
	});

	describe("updateOrg / deleteOrg / resetOrg", () => {
		it("sends PUT /orgs/:id with body", async () => {
			const fetchMock = mockFetch({ id: "org_1", name: "renamed" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.updateOrg("org_1", { name: "renamed" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs/org_1");
			expect(opts.method).toBe("PUT");
			expect(JSON.parse(opts.body)).toEqual({ name: "renamed" });
		});

		it("sends DELETE /orgs/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.deleteOrg("org_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs/org_1");
			expect(opts.method).toBe("DELETE");
		});

		it("sends POST /orgs/:id/reset", async () => {
			const fetchMock = mockFetch({ ok: true, agents_reset: 3 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.resetOrg("org_1");

			expect(result.agents_reset).toBe(3);
			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/orgs/org_1/reset",
			);
		});
	});

	describe("org versions", () => {
		it("sends GET /orgs/:id/versions", async () => {
			const fetchMock = mockFetch({ current: 2, versions: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.orgVersions("org_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/orgs/org_1/versions",
			);
		});

		it("sends POST /orgs/:id/restore/:version", async () => {
			const fetchMock = mockFetch({ id: "org_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.restoreOrgVersion("org_1", 3);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs/org_1/restore/3");
			expect(opts.method).toBe("POST");
		});
	});

	// ── Pilot ──

	describe("pilot", () => {
		it("seeds an existing org via POST /orgs/:id/pilot", async () => {
			const fetchMock = mockFetch({ ok: true, environment_id: "env_9" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.runPilot("org_1", { agent_count: 5 });

			expect(result.environment_id).toBe("env_9");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs/org_1/pilot");
			expect(JSON.parse(opts.body)).toEqual({ agent_count: 5 });
		});

		it("bootstraps a fresh org via POST /pilot", async () => {
			const fetchMock = mockFetch({ ok: true, org_id: "org_new" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.pilotBootstrap({ agent_count: 10 });

			expect(result.org_id).toBe("org_new");
			expect(fetchMock.mock.calls[0][0]).toBe("https://api.kredit.sh/pilot");
		});
	});

	// ── Guardrail rules ──

	describe("org rules", () => {
		it("sends GET /orgs/:id/rules", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listOrgRules("org_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/orgs/org_1/rules",
			);
		});

		it("sends POST /orgs/:id/rules with the rule scope", async () => {
			const fetchMock = mockFetch({ id: "rule_1" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.addOrgRule("org_1", {
				name: "Payment cap",
				type: "payment",
				spend: { amount: 500, window: "day" },
				environment_id: "env_1",
				agent_id: "agent_1",
			});

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs/org_1/rules");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				name: "Payment cap",
				type: "payment",
				spend: { amount: 500, window: "day" },
				environment_id: "env_1",
				agent_id: "agent_1",
			});
		});

		it("sends PUT and DELETE /orgs/:id/rules/:ruleId", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.updateOrgRule("org_1", "rule_1", { enabled: false });
			await api.deleteOrgRule("org_1", "rule_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/orgs/org_1/rules/rule_1",
			);
			expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
			expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
		});
	});

	// ── Agents ──

	describe("listAgents", () => {
		it("sends GET /agents without params", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listAgents();

			expect(fetchMock.mock.calls[0][0]).toBe("https://api.kredit.sh/agents");
		});

		it("sends GET /agents?org_id=... with org_id", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listAgents("org_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/agents?org_id=org_1",
			);
		});

		it("includes mode, environment_id and status when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listAgents("org_1", "sandbox", "env_1", "active");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("org_id=org_1");
			expect(url).toContain("mode=sandbox");
			expect(url).toContain("environment_id=env_1");
			expect(url).toContain("status=active");
		});
	});

	describe("createAgent", () => {
		it("sends POST /agents with the budget convenience", async () => {
			const fetchMock = mockFetch({ id: "agent_1" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createAgent({
				name: "checkout-bot",
				org_id: "org_1",
				priority: "critical",
				budget: 8000,
				budget_window: "mo",
			});

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/agents");
			expect(JSON.parse(opts.body)).toEqual({
				name: "checkout-bot",
				org_id: "org_1",
				priority: "critical",
				budget: 8000,
				budget_window: "mo",
			});
		});
	});

	describe("getAgent", () => {
		it("sends GET /agents/:id", async () => {
			const fetchMock = mockFetch({ id: "agent_1", org_id: "org_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.getAgent("agent_1");

			expect(result.org_id).toBe("org_1");
			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/agents/agent_1",
			);
		});
	});

	describe("publishAgent", () => {
		it("sends POST /agents/:id/publish", async () => {
			const fetchMock = mockFetch({ id: "agent_1", is_published: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.publishAgent("agent_1");

			expect(result.is_published).toBe(true);
			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/agents/agent_1/publish",
			);
		});
	});

	// ── Fleet & transactions ──

	describe("fleetOverview", () => {
		it("scopes by org, mode and environment", async () => {
			const fetchMock = mockFetch({ total_agents: 3 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.fleetOverview("org_1", "sandbox", "env_1");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("/fleet/overview?");
			expect(url).toContain("org_id=org_1");
			expect(url).toContain("mode=sandbox");
			expect(url).toContain("environment_id=env_1");
		});

		it("sends no query string when unscoped", async () => {
			const fetchMock = mockFetch({ total_agents: 0 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.fleetOverview();

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/fleet/overview",
			);
		});
	});

	describe("listTransactions", () => {
		it("passes org, agent, simulation and status filters", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listTransactions({
				org_id: "org_1",
				agent_id: "agent_1",
				simulation_id: "sim_1",
				status: "blocked",
				limit: 10,
			});

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("org_id=org_1");
			expect(url).toContain("agent_id=agent_1");
			expect(url).toContain("simulation_id=sim_1");
			expect(url).toContain("status=blocked");
			expect(url).toContain("limit=10");
		});
	});

	// ── Environments ──

	describe("listEnvironments", () => {
		it("sends GET /environments?org_id=...", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listEnvironments("org_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/environments?org_id=org_1",
			);
		});
	});

	describe("createEnvironment", () => {
		it("sends POST /environments with org_id and mode", async () => {
			const fetchMock = mockFetch({ id: "env_1", mode: "sandbox" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.createEnvironment({
				org_id: "org_1",
				mode: "sandbox",
				name: "exp-a",
			});

			expect(result.mode).toBe("sandbox");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments");
			expect(JSON.parse(opts.body)).toEqual({
				org_id: "org_1",
				mode: "sandbox",
				name: "exp-a",
			});
		});
	});

	describe("environmentBundle", () => {
		it("sends GET /environments/:id/bundle", async () => {
			const fetchMock = mockFetch({ org_id: "org_1", agents: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.environmentBundle("env_1");

			expect(result.org_id).toBe("org_1");
			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/environments/env_1/bundle",
			);
		});
	});

	describe("cloneEnvironment", () => {
		it("sends POST /environments/:id/clone", async () => {
			const fetchMock = mockFetch({ id: "env_2", mode: "sandbox" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.cloneEnvironment("env_1");

			expect(result.id).toBe("env_2");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments/env_1/clone");
			expect(opts.method).toBe("POST");
		});
	});

	describe("environment promote / go-live / versions", () => {
		it("sends POST /environments/:id/promote-to-mode/:mode", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.promoteEnvironmentToMode("env_1", "production");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/environments/env_1/promote-to-mode/production",
			);
		});

		it("sends POST /environments/:id/go-live", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.goLiveEnvironment("env_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/environments/env_1/go-live",
			);
		});

		it("sends GET versions and POST restore", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.environmentVersions("env_1");
			await api.restoreEnvironment("env_1", 2);

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/environments/env_1/versions",
			);
			expect(fetchMock.mock.calls[1][0]).toBe(
				"https://api.kredit.sh/environments/env_1/restore/2",
			);
		});
	});

	describe("deleteEnvironment", () => {
		it("sends DELETE /environments/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.deleteEnvironment("env_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments/env_1");
			expect(opts.method).toBe("DELETE");
		});
	});

	// ── Simulations ──

	describe("simulations", () => {
		it("sends POST /simulations/run with org and environment scope", async () => {
			const fetchMock = mockFetch(
				{ id: "sim_1", environment_id: "env_9" },
				201,
			);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.runSimulation({
				org_id: "org_1",
				environment_id: "env_1",
				mode: "realtime",
				stream: true,
			});

			expect(result.environment_id).toBe("env_9");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/simulations/run");
			expect(JSON.parse(opts.body)).toEqual({
				org_id: "org_1",
				environment_id: "env_1",
				mode: "realtime",
				stream: true,
			});
		});

		it("sends GET /simulations?org_id=... when scoped", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listSimulations("org_1");
			await api.listSimulations();

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/simulations?org_id=org_1",
			);
			expect(fetchMock.mock.calls[1][0]).toBe(
				"https://api.kredit.sh/simulations",
			);
		});

		it("sends POST /simulations/:id/stop", async () => {
			const fetchMock = mockFetch({ ok: true, stopped: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.stopSimulation("sim_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/simulations/sim_1/stop",
			);
		});
	});

	// ── Priors ──

	describe("listPriors", () => {
		it("sends GET /priors with no scope", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listPriors();

			expect(fetchMock.mock.calls[0][0]).toBe("https://api.kredit.sh/priors");
		});

		it("includes org_id, mode and environment_id when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listPriors("org_1", "sandbox", "env_1");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("org_id=org_1");
			expect(url).toContain("mode=sandbox");
			expect(url).toContain("environment_id=env_1");
		});
	});

	describe("createPrior", () => {
		it("sends POST /priors?org_id=... with the body", async () => {
			const fetchMock = mockFetch({ id: "prior_1" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createPrior("org_1", {
				name: "openai.chat",
				frequency: { mean: 6, variance: 6 },
				cost: { mean: 3, variance: 0.75 },
			});

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors?org_id=org_1");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body).name).toBe("openai.chat");
		});

		it("omits the query string when org_id is undefined", async () => {
			const fetchMock = mockFetch({ id: "prior_1" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createPrior(undefined, { name: "openai.chat" });

			expect(fetchMock.mock.calls[0][0]).toBe("https://api.kredit.sh/priors");
		});
	});

	describe("updatePrior / deletePrior / presets", () => {
		it("sends PUT /priors/:id", async () => {
			const fetchMock = mockFetch({ id: "prior_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.updatePrior("prior_1", { name: "renamed" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors/prior_1");
			expect(opts.method).toBe("PUT");
		});

		it("sends DELETE /priors/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.deletePrior("prior_1");

			expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
		});

		it("sends GET /priors/presets", async () => {
			const fetchMock = mockFetch({ "24x7": { dow: [], hour: [] } });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.getPriorPresets();

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/priors/presets",
			);
		});
	});

	// ── Workflows ──

	describe("listWorkflows", () => {
		it("sends GET /workflows?org_id=... when scoped", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listWorkflows("org_1");
			await api.listWorkflows();

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/workflows?org_id=org_1",
			);
			expect(fetchMock.mock.calls[1][0]).toBe("https://api.kredit.sh/workflows");
		});
	});

	describe("createWorkflow", () => {
		it("sends POST /workflows with org_id in the body", async () => {
			const fetchMock = mockFetch({ id: "wf_1" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createWorkflow({
				org_id: "org_1",
				name: "demo",
				nodes: [{ id: "n1", type: "llm", label: "LLM" }],
				edges: [],
			});

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows");
			expect(JSON.parse(opts.body).org_id).toBe("org_1");
		});
	});

	describe("simulateWorkflow / executeWorkflow", () => {
		it("sends POST /workflows/:id/simulate without params", async () => {
			const fetchMock = mockFetch({ node_count: 2 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.simulateWorkflow("wf_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/workflows/wf_1/simulate",
			);
		});

		it("includes seed and environment_id as query params", async () => {
			const fetchMock = mockFetch({ node_count: 2 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.simulateWorkflow("wf_1", 5, "env_1");
			await api.executeWorkflow("wf_1", 7, "env_2");

			const simUrl = fetchMock.mock.calls[0][0];
			expect(simUrl).toContain("seed=5");
			expect(simUrl).toContain("environment_id=env_1");

			const execUrl = fetchMock.mock.calls[1][0];
			expect(execUrl).toContain("/workflows/wf_1/execute?");
			expect(execUrl).toContain("seed=7");
			expect(execUrl).toContain("environment_id=env_2");
		});
	});

	describe("workflow runs", () => {
		it("sends GET /workflows/:id/runs and /workflows/runs/:runId", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listWorkflowRuns("wf_1");
			await api.getWorkflowRun("run_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/workflows/wf_1/runs",
			);
			expect(fetchMock.mock.calls[1][0]).toBe(
				"https://api.kredit.sh/workflows/runs/run_1",
			);
		});
	});

	// ── Chats & integrations ──

	describe("listChats", () => {
		it("sends GET /chats with and without org_id", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listChats();
			await api.listChats("org_1");

			expect(fetchMock.mock.calls[0][0]).toBe("https://api.kredit.sh/chats");
			expect(fetchMock.mock.calls[1][0]).toBe(
				"https://api.kredit.sh/chats?org_id=org_1",
			);
		});
	});

	describe("getChat / deleteChat", () => {
		it("sends GET and DELETE /chats/:id", async () => {
			const fetchMock = mockFetch({ id: "chat_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.getChat("chat_1");
			await api.deleteChat("chat_1");

			expect(fetchMock.mock.calls[0][0]).toBe(
				"https://api.kredit.sh/chats/chat_1",
			);
			expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
		});
	});

	describe("listIntegrations", () => {
		it("scopes by org and environment", async () => {
			const fetchMock = mockFetch({ integrations: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listIntegrations("org_1", "env_1");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toContain("org_id=org_1");
			expect(url).toContain("environment_id=env_1");
		});
	});

	// ── Action verbs ──

	describe("optimize", () => {
		it("sends POST /actions/optimize with org_id", async () => {
			const fetchMock = mockFetch({ changes: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.optimize({ org_id: "org_1", period: "1mo", apply: true });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/actions/optimize");
			expect(JSON.parse(opts.body)).toEqual({
				org_id: "org_1",
				period: "1mo",
				apply: true,
			});
		});
	});

	describe("scoreTrust", () => {
		it("sends POST /actions/score with the agent id", async () => {
			const fetchMock = mockFetch({ score: 720 });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.scoreTrust("agent_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/actions/score");
			expect(JSON.parse(opts.body)).toEqual({ agent_id: "agent_1" });
		});
	});

	describe("error handling", () => {
		it("throws on non-ok response", async () => {
			const fetchMock = mockFetch({ error: "unauthorized" }, 401);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await expect(
				api.check({
					agent_id: "a",
					action: "x",
					estimated_cost: 0,
				}),
			).rejects.toThrow("401");
		});

		it("surfaces the status and body of a 404", async () => {
			const fetchMock = mockFetch({ detail: "Organization not found" }, 404);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await expect(api.getOrg("org_missing")).rejects.toThrow(/404/);
		});
	});
});
