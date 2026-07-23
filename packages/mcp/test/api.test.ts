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
				wallet_balance: 500.0,
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
			expect(result.risk_level).toBe("low");
			expect(result.transaction_id).toBe("txn_123");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/check");
			expect(opts.method).toBe("POST");
			expect(opts.headers.Authorization).toBe("Bearer kr_live_test");
			expect(JSON.parse(opts.body)).toEqual({
				agent_id: "agent_1",
				action: "openai.chat",
				estimated_cost: 5.0,
			});
		});
	});

	describe("report", () => {
		it("sends POST /report with correct body", async () => {
			const body = {
				transaction_id: "txn_123",
				outcome: "success",
				new_score: 755,
				agent_status: "active",
			};
			const fetchMock = mockFetch(body);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.report({
				transaction_id: "txn_123",
				outcome: "success",
				actual_cost: 4.8,
			});

			expect(result.new_score).toBe(755);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/report");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				transaction_id: "txn_123",
				outcome: "success",
				actual_cost: 4.8,
			});
		});
	});

	describe("getAgent", () => {
		it("sends GET /agents/:id", async () => {
			const body = {
				id: "agent_1",
				name: "test-agent",
				org_id: "org_1",
				status: "active",
				priority: "normal",
				wallet: {
					balance: 500.0,
					budget: 1000.0,
					max_per_txn: 0,
					daily_spend_limit: 0,
				},
				credit: {
					score: 750,
					task_success_rate: 0.95,
					cost_efficiency: 0.88,
					violation_count: 0,
					total_tasks: 42,
				},
				rules: [],
			};
			const fetchMock = mockFetch(body);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.getAgent("agent_1");

			expect(result.id).toBe("agent_1");
			expect(result.credit.score).toBe(750);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/agents/agent_1");
			expect(opts.method).toBe("GET");
		});
	});

	describe("listAgents", () => {
		it("sends GET /agents without org_id", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listAgents();

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/agents");
		});

		it("sends GET /agents?org_id=... with org_id", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listAgents("org_42");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/agents?org_id=org_42");
		});

		it("includes mode and environment_id when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listAgents("org_42", "production", "env_9");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(
				"https://api.kredit.sh/agents?org_id=org_42&mode=production&environment_id=env_9",
			);
		});
	});

	describe("listOrgs", () => {
		it("sends GET /orgs without params", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listOrgs();

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs");
		});

		it("includes mode and environment_id when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listOrgs("preview", "env_3");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(
				"https://api.kredit.sh/orgs?mode=preview&environment_id=env_3",
			);
		});
	});

	describe("createOrg", () => {
		it("includes mode and environment_id in the body when provided", async () => {
			const fetchMock = mockFetch({ id: "org_1", name: "acme" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createOrg("acme", "preview", "env_7");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/orgs");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				name: "acme",
				mode: "preview",
				environment_id: "env_7",
			});
		});
	});

	describe("listPriors", () => {
		it("sends GET /priors with sandbox_id as a query param", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listPriors("sbx_1");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors?sandbox_id=sbx_1");
		});

		it("includes mode when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listPriors("sbx_1", "simulation");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(
				"https://api.kredit.sh/priors?sandbox_id=sbx_1&mode=simulation",
			);
		});

		it("includes environment_id when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listPriors("sbx_1", undefined, "env_2");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(
				"https://api.kredit.sh/priors?sandbox_id=sbx_1&environment_id=env_2",
			);
		});
	});

	describe("createPrior", () => {
		it("sends POST /priors with sandbox_id as a query param and body", async () => {
			const body = { id: "prior_1", name: "openai.chat" };
			const fetchMock = mockFetch(body, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.createPrior("sbx_1", {
				name: "openai.chat",
				frequency: { mean: 100, variance: 100 },
				cost: { mean: 2, variance: 0.5 },
			});

			expect(result.id).toBe("prior_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors?sandbox_id=sbx_1");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				name: "openai.chat",
				frequency: { mean: 100, variance: 100 },
				cost: { mean: 2, variance: 0.5 },
			});
		});

		it("passes environment_id through in the body when provided", async () => {
			const fetchMock = mockFetch({ id: "prior_2" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createPrior("sbx_1", {
				name: "openai.chat",
				frequency: { mean: 100, variance: 100 },
				cost: { mean: 2, variance: 0.5 },
				environment_id: "env_5",
			});

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors?sandbox_id=sbx_1");
			expect(JSON.parse(opts.body).environment_id).toBe("env_5");
		});
	});

	describe("updatePrior", () => {
		it("sends PUT /priors/:id with body", async () => {
			const fetchMock = mockFetch({ id: "prior_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.updatePrior("prior_1", { name: "renamed" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors/prior_1");
			expect(opts.method).toBe("PUT");
			expect(JSON.parse(opts.body)).toEqual({ name: "renamed" });
		});
	});

	describe("deletePrior", () => {
		it("sends DELETE /priors/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.deletePrior("prior_1");

			expect(result.ok).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors/prior_1");
			expect(opts.method).toBe("DELETE");
		});
	});

	describe("getPriorPresets", () => {
		it("sends GET /priors/presets", async () => {
			const fetchMock = mockFetch({ "24x7": { dow: [], hour: [] } });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.getPriorPresets();

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/priors/presets");
			expect(opts.method).toBe("GET");
		});
	});

	describe("listWorkflows", () => {
		it("sends GET /workflows with sandbox_id as a query param", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listWorkflows("sbx_1");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows?sandbox_id=sbx_1");
		});

		it("includes mode when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listWorkflows("sbx_1", "simulation");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(
				"https://api.kredit.sh/workflows?sandbox_id=sbx_1&mode=simulation",
			);
		});

		it("includes environment_id when provided", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listWorkflows("sbx_1", undefined, "env_4");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(
				"https://api.kredit.sh/workflows?sandbox_id=sbx_1&environment_id=env_4",
			);
		});
	});

	describe("createWorkflow", () => {
		it("sends POST /workflows with sandbox_id in the body", async () => {
			const body = { id: "wf_1", name: "flow" };
			const fetchMock = mockFetch(body, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.createWorkflow({
				sandbox_id: "sbx_1",
				name: "flow",
				nodes: [{ id: "n1", type: "agent", label: "Start" }],
				edges: [],
			});

			expect(result.id).toBe("wf_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				sandbox_id: "sbx_1",
				name: "flow",
				nodes: [{ id: "n1", type: "agent", label: "Start" }],
				edges: [],
			});
		});

		it("passes environment_id through in the body when provided", async () => {
			const fetchMock = mockFetch({ id: "wf_2" }, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.createWorkflow({
				sandbox_id: "sbx_1",
				name: "flow",
				nodes: [{ id: "n1", type: "agent", label: "Start" }],
				edges: [],
				environment_id: "env_6",
			});

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows");
			expect(JSON.parse(opts.body).environment_id).toBe("env_6");
		});
	});

	describe("getWorkflow", () => {
		it("sends GET /workflows/:id", async () => {
			const fetchMock = mockFetch({ id: "wf_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.getWorkflow("wf_1");

			expect(result.id).toBe("wf_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1");
			expect(opts.method).toBe("GET");
		});
	});

	describe("updateWorkflow", () => {
		it("sends PUT /workflows/:id with body", async () => {
			const fetchMock = mockFetch({ id: "wf_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.updateWorkflow("wf_1", { name: "renamed" });

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1");
			expect(opts.method).toBe("PUT");
			expect(JSON.parse(opts.body)).toEqual({ name: "renamed" });
		});
	});

	describe("deleteWorkflow", () => {
		it("sends DELETE /workflows/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.deleteWorkflow("wf_1");

			expect(result.ok).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1");
			expect(opts.method).toBe("DELETE");
		});
	});

	describe("simulateWorkflow", () => {
		it("sends POST /workflows/:id/simulate without seed", async () => {
			const fetchMock = mockFetch({ workflow_id: "wf_1", node_runs: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.simulateWorkflow("wf_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1/simulate");
			expect(opts.method).toBe("POST");
		});

		it("includes seed as a query param when provided", async () => {
			const fetchMock = mockFetch({ workflow_id: "wf_1", node_runs: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.simulateWorkflow("wf_1", 42);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1/simulate?seed=42");
		});
	});

	describe("executeWorkflow", () => {
		it("sends POST /workflows/:id/execute without seed", async () => {
			const fetchMock = mockFetch({ id: "run_1", node_runs: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.executeWorkflow("wf_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1/execute");
			expect(opts.method).toBe("POST");
		});

		it("includes seed as a query param when provided", async () => {
			const fetchMock = mockFetch({ id: "run_1", node_runs: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.executeWorkflow("wf_1", 42);

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1/execute?seed=42");
		});
	});

	describe("listWorkflowRuns", () => {
		it("sends GET /workflows/:id/runs", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listWorkflowRuns("wf_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/wf_1/runs");
			expect(opts.method).toBe("GET");
		});
	});

	describe("getWorkflowRun", () => {
		it("sends GET /workflows/runs/:run_id", async () => {
			const fetchMock = mockFetch({ id: "run_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.getWorkflowRun("run_1");

			expect(result.id).toBe("run_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/workflows/runs/run_1");
			expect(opts.method).toBe("GET");
		});
	});

	describe("listEnvironments", () => {
		it("sends GET /environments with sandbox_id as a query param", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listEnvironments("sbx_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments?sandbox_id=sbx_1");
			expect(opts.method).toBe("GET");
		});
	});

	describe("createEnvironment", () => {
		it("sends POST /environments with body", async () => {
			const body = { id: "env_1", mode: "simulation" };
			const fetchMock = mockFetch(body, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.createEnvironment({
				sandbox_id: "sbx_1",
				mode: "simulation",
				simulation_id: "sim_1",
			});

			expect(result.id).toBe("env_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				sandbox_id: "sbx_1",
				mode: "simulation",
				simulation_id: "sim_1",
			});
		});
	});

	describe("getEnvironment", () => {
		it("sends GET /environments/:id", async () => {
			const fetchMock = mockFetch({ id: "env_1" });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.getEnvironment("env_1");

			expect(result.id).toBe("env_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments/env_1");
			expect(opts.method).toBe("GET");
		});
	});

	describe("deleteEnvironment", () => {
		it("sends DELETE /environments/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.deleteEnvironment("env_1");

			expect(result.ok).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/environments/env_1");
			expect(opts.method).toBe("DELETE");
		});
	});

	describe("listChats", () => {
		it("sends GET /chats without sandbox_id", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listChats();

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/chats");
		});

		it("sends GET /chats?sandbox_id=... with sandbox_id", async () => {
			const fetchMock = mockFetch([]);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			await api.listChats("sbx_1");

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/chats?sandbox_id=sbx_1");
		});
	});

	describe("createChat", () => {
		it("sends POST /chats with body", async () => {
			const body = { id: "chat_1", title: "hello" };
			const fetchMock = mockFetch(body, 201);
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.createChat({
				sandbox_id: "sbx_1",
				mode: "simulation",
				title: "hello",
			});

			expect(result.id).toBe("chat_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/chats");
			expect(opts.method).toBe("POST");
			expect(JSON.parse(opts.body)).toEqual({
				sandbox_id: "sbx_1",
				mode: "simulation",
				title: "hello",
			});
		});
	});

	describe("getChat", () => {
		it("sends GET /chats/:id", async () => {
			const fetchMock = mockFetch({ id: "chat_1", messages: [] });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.getChat("chat_1");

			expect(result.id).toBe("chat_1");

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/chats/chat_1");
			expect(opts.method).toBe("GET");
		});
	});

	describe("deleteChat", () => {
		it("sends DELETE /chats/:id", async () => {
			const fetchMock = mockFetch({ ok: true });
			vi.stubGlobal("fetch", fetchMock);

			const api = new KreditAPI(config);
			const result = await api.deleteChat("chat_1");

			expect(result.ok).toBe(true);

			const [url, opts] = fetchMock.mock.calls[0];
			expect(url).toBe("https://api.kredit.sh/chats/chat_1");
			expect(opts.method).toBe("DELETE");
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
	});
});
