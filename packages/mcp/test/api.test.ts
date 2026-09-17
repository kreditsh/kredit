import { beforeEach, describe, expect, it, vi } from "vitest";
import { KreditAPI, KreditError } from "../src/api.js";

function mockFetch(responseBody: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		json: () => Promise.resolve(responseBody),
		text: () => Promise.resolve(JSON.stringify(responseBody)),
	});
}

const config = { apiKey: "kr_live_test", apiUrl: "https://api.kredit.sh/" };

/** Run one API call against a mocked fetch and return what was sent. */
async function sent(
	call: (api: KreditAPI) => Promise<unknown>,
	response: unknown = { ok: true },
) {
	const fetchMock = mockFetch(response);
	vi.stubGlobal("fetch", fetchMock);
	const result = await call(new KreditAPI(config));
	const [url, opts] = fetchMock.mock.calls[0];
	return {
		result,
		url: url as string,
		method: opts.method as string,
		headers: opts.headers as Record<string, string>,
		body: opts.body ? JSON.parse(opts.body) : undefined,
	};
}

describe("KreditAPI", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("request", () => {
		it("sends the bearer key, the MCP source header, and JSON", async () => {
			const r = await sent((api) => api.createOrg({ name: "Acme" }), {
				id: "o1",
			});
			expect(r.url).toBe("https://api.kredit.sh/orgs");
			expect(r.method).toBe("POST");
			expect(r.headers.Authorization).toBe("Bearer kr_live_test");
			expect(r.headers["X-Kredit-Source"]).toBe("mcp");
			expect(r.headers["Content-Type"]).toBe("application/json");
			expect(r.body).toEqual({ name: "Acme" });
			expect(r.result).toEqual({ id: "o1" });
		});

		it("sends no body on GET", async () => {
			const r = await sent((api) => api.listOrgs(), []);
			expect(r.method).toBe("GET");
			expect(r.body).toBeUndefined();
		});

		it("works with an agent token too", async () => {
			const fetchMock = mockFetch({ outcome: "allow" });
			vi.stubGlobal("fetch", fetchMock);
			const api = new KreditAPI({ ...config, apiKey: "kat_abc" });
			await api.check({ agent_id: "a1", intent: "buy shoes for $120" });
			expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
				"Bearer kat_abc",
			);
		});

		it("raises a KreditError carrying the status and the server's detail", async () => {
			vi.stubGlobal("fetch", mockFetch({ detail: "the agent is frozen" }, 403));
			const api = new KreditAPI(config);
			const err = await api.getAgent("a1").catch((e) => e);
			expect(err).toBeInstanceOf(KreditError);
			expect(err.status).toBe(403);
			expect(err.detail).toBe("the agent is frozen");
			expect(err.message).toBe("403: the agent is frozen");
		});

		it("falls back to the raw text when the error is not JSON", async () => {
			vi.stubGlobal("fetch", {
				...mockFetch({}, 502),
			});
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					status: 502,
					statusText: "Bad Gateway",
					text: () => Promise.resolve("upstream down"),
					json: () => Promise.reject(new Error("no json")),
				}),
			);
			const api = new KreditAPI(config);
			const err = await api.listOrgs().catch((e) => e);
			expect(err.status).toBe(502);
			expect(err.detail).toBe("upstream down");
		});
	});

	describe("check", () => {
		it("posts the text intent to /check and marks the source mcp", async () => {
			const r = await sent(
				(api) =>
					api.check({
						agent_id: "a1",
						intent: "Buy the Pegasus 42 from nike.com for $131.97",
						environment: "sandbox",
					}),
				{ outcome: "review", score: 85 },
			);
			expect(r.url).toBe("https://api.kredit.sh/check");
			expect(r.method).toBe("POST");
			expect(r.body).toEqual({
				agent_id: "a1",
				intent: "Buy the Pegasus 42 from nike.com for $131.97",
				environment: "sandbox",
				source: "mcp",
			});
			expect(r.result).toEqual({ outcome: "review", score: 85 });
		});
	});

	describe("organizations and rules", () => {
		it("reads, updates, deletes and summarizes an organization", async () => {
			expect((await sent((a) => a.getOrg("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1",
			);
			const upd = await sent((a) =>
				a.updateOrg("o1", { settings: { place_orders: true } }),
			);
			expect(upd.method).toBe("PUT");
			expect(upd.body).toEqual({ settings: { place_orders: true } });
			const del = await sent((a) => a.deleteOrg("o1"));
			expect(del.method).toBe("DELETE");
			expect(del.url).toBe("https://api.kredit.sh/orgs/o1");
			expect((await sent((a) => a.orgSummary("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/summary",
			);
			expect((await sent((a) => a.seed())).url).toBe(
				"https://api.kredit.sh/seed",
			);
		});

		it("manages organization rules under /orgs/{id}/rules", async () => {
			const add = await sent((a) =>
				a.addRule("o1", {
					name: "Daily budget",
					spend: { amount: 500, window: "day" },
					on_hit: "deny",
				}),
			);
			expect(add.url).toBe("https://api.kredit.sh/orgs/o1/rules");
			expect(add.method).toBe("POST");
			expect(add.body.spend).toEqual({ amount: 500, window: "day" });
			const upd = await sent((a) =>
				a.updateRule("o1", "r1", { on_hit: "review" }),
			);
			expect(upd.url).toBe("https://api.kredit.sh/orgs/o1/rules/r1");
			expect(upd.method).toBe("PUT");
			const del = await sent((a) => a.deleteRule("o1", "r1"));
			expect(del.method).toBe("DELETE");
			expect((await sent((a) => a.listRules("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/rules",
			);
		});
	});

	describe("agents", () => {
		it("creates an agent under its organization with policy", async () => {
			const r = await sent((a) =>
				a.createAgent("o1", {
					name: "Shopping agent",
					prompt: "Buy running shoes",
					guardrails: { allowed_merchants: ["nike.com"] },
				}),
			);
			expect(r.url).toBe("https://api.kredit.sh/orgs/o1/agents");
			expect(r.body.guardrails.allowed_merchants).toEqual(["nike.com"]);
		});

		it("updates, freezes, deletes and reads decisions", async () => {
			const frz = await sent((a) => a.updateAgent("a1", { status: "frozen" }));
			expect(frz.url).toBe("https://api.kredit.sh/agents/a1");
			expect(frz.method).toBe("PUT");
			expect(frz.body).toEqual({ status: "frozen" });
			expect((await sent((a) => a.deleteAgent("a1"))).method).toBe("DELETE");
			const dec = await sent((a) => a.agentDecisions("a1", 10, "2026-01-01"));
			expect(dec.url).toBe(
				"https://api.kredit.sh/agents/a1/decisions?limit=10&before=2026-01-01",
			);
		});

		it("proposes, approves, rejects, promotes and verifies", async () => {
			const prop = await sent((a) =>
				a.proposeVersion("a1", { prompt: "new brief", note: "tighter" }),
			);
			expect(prop.url).toBe("https://api.kredit.sh/agents/a1/versions");
			const appr = await sent((a) => a.approveVersion("a1", "ver_2", "sandbox"));
			expect(appr.url).toBe(
				"https://api.kredit.sh/agents/a1/versions/ver_2/approve",
			);
			expect(appr.body).toEqual({ environment: "sandbox" });
			const rej = await sent((a) => a.rejectVersion("a1", "ver_2", "no"));
			expect(rej.url).toBe(
				"https://api.kredit.sh/agents/a1/versions/ver_2/reject",
			);
			expect(rej.body).toEqual({ note: "no" });
			const prom = await sent((a) => a.promoteAgent("a1"));
			expect(prom.url).toBe("https://api.kredit.sh/agents/a1/promote");
			expect(prom.body).toEqual({ environment: "production" });
			const ver = await sent((a) => a.verifyAgent("a1", "kredit"));
			expect(ver.url).toBe("https://api.kredit.sh/agents/a1/verify-identity");
			expect(ver.body).toEqual({ provider: "kredit" });
		});
	});

	describe("agent tokens", () => {
		it("issues, lists and revokes", async () => {
			const iss = await sent((a) => a.issueAgentToken("a1", 30), {
				token: "kat_x",
			});
			expect(iss.url).toBe("https://api.kredit.sh/agents/a1/tokens");
			expect(iss.body).toEqual({ ttl_minutes: 30 });
			const noTtl = await sent((a) => a.issueAgentToken("a1"));
			expect(noTtl.body).toEqual({});
			expect((await sent((a) => a.listAgentTokens("a1"))).method).toBe("GET");
			const rev = await sent((a) => a.revokeAgentToken("a1", "t1"));
			expect(rev.url).toBe("https://api.kredit.sh/agents/a1/tokens/t1");
			expect(rev.method).toBe("DELETE");
		});
	});

	describe("decisions, reviews, approvals", () => {
		it("lists decisions with filters in the query string", async () => {
			const r = await sent((a) =>
				a.listDecisions("o1", { outcome: "deny", limit: 5 }),
			);
			expect(r.url).toBe(
				"https://api.kredit.sh/orgs/o1/decisions?outcome=deny&limit=5",
			);
		});
		it("reads one, the review queue, and executes", async () => {
			expect((await sent((a) => a.getDecision("d1"))).url).toBe(
				"https://api.kredit.sh/decisions/d1",
			);
			expect((await sent((a) => a.listReviews("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/reviews",
			);
			const ex = await sent((a) => a.executeDecision("d1"));
			expect(ex.url).toBe("https://api.kredit.sh/decisions/d1/execute");
			expect(ex.method).toBe("POST");
		});
		it("lists pending approvals by default", async () => {
			expect((await sent((a) => a.listApprovals("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/approvals",
			);
			expect((await sent((a) => a.listApprovals("o1", "approved"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/approvals?status=approved",
			);
		});
	});

	describe("documents and integrations", () => {
		it("adds, searches and deletes documents", async () => {
			const add = await sent((a) =>
				a.addDocument("o1", {
					name: "Sanctions",
					kind: "text",
					content: "Acme Corp",
					tags: ["sanctions"],
				}),
			);
			expect(add.url).toBe("https://api.kredit.sh/orgs/o1/documents");
			expect(add.body.tags).toEqual(["sanctions"]);
			const s = await sent((a) => a.searchDocuments("o1", "acme corp"));
			expect(s.url).toBe(
				"https://api.kredit.sh/orgs/o1/documents/search?q=acme+corp",
			);
			expect((await sent((a) => a.deleteDocument("doc1"))).url).toBe(
				"https://api.kredit.sh/documents/doc1",
			);
		});
		it("updates and tests an integration by provider", async () => {
			const upd = await sent((a) =>
				a.updateIntegration("o1", "vgs", {
					keys: { vault_id: "tnt", username: "u", password: "p" },
					mode: "sandbox",
				}),
			);
			expect(upd.url).toBe("https://api.kredit.sh/orgs/o1/integrations/vgs");
			expect(upd.method).toBe("PUT");
			expect(upd.body.keys.vault_id).toBe("tnt");
			const t = await sent((a) => a.testIntegration("o1", "vgs"));
			expect(t.url).toBe("https://api.kredit.sh/orgs/o1/integrations/vgs/test");
			expect(t.method).toBe("POST");
		});
	});

	describe("audit, orders, environments, simulations", () => {
		it("builds the query strings", async () => {
			expect(
				(await sent((a) => a.audit("o1", 20, undefined, "decision.deny"))).url,
			).toBe(
				"https://api.kredit.sh/orgs/o1/audit?limit=20&action=decision.deny",
			);
			expect((await sent((a) => a.listOrders("o1", 3))).url).toBe(
				"https://api.kredit.sh/orgs/o1/orders?limit=3",
			);
			expect((await sent((a) => a.listEnvironments("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/environments",
			);
			const env = await sent((a) => a.createEnvironment("o1", "staging"));
			expect(env.body).toEqual({ name: "staging" });
			expect((await sent((a) => a.deleteEnvironment("e1"))).url).toBe(
				"https://api.kredit.sh/environments/e1",
			);
		});
		it("runs, lists, reads and stops simulations", async () => {
			const run = await sent((a) =>
				a.runSimulation("o1", { count: 10, scenario: "fraud" }),
			);
			expect(run.url).toBe("https://api.kredit.sh/orgs/o1/simulations/run");
			expect(run.body).toEqual({ count: 10, scenario: "fraud" });
			expect((await sent((a) => a.listSimulations("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/simulations",
			);
			expect((await sent((a) => a.getSimulation("s1"))).url).toBe(
				"https://api.kredit.sh/simulations/s1",
			);
			expect((await sent((a) => a.stopSimulation("s1"))).url).toBe(
				"https://api.kredit.sh/simulations/s1/stop",
			);
		});
	});

	describe("agentic commerce", () => {
		it("lists and updates workflows", async () => {
			expect((await sent((a) => a.listWorkflows("o1"))).url).toBe(
				"https://api.kredit.sh/orgs/o1/commerce/workflows",
			);
			const upd = await sent((a) =>
				a.updateWorkflow("w1", { query: "running shoes under $150" }),
			);
			expect(upd.url).toBe("https://api.kredit.sh/commerce/workflows/w1");
			expect(upd.method).toBe("PUT");
		});
		it("starts a run, reuses a search, chooses, rechooses, stops", async () => {
			const start = await sent((a) =>
				a.startRun("o1", {
					workflow_id: "w1",
					choice_mode: "you",
					from_run_id: "r0",
				}),
			);
			expect(start.url).toBe("https://api.kredit.sh/orgs/o1/commerce/runs");
			expect(start.body.from_run_id).toBe("r0");
			expect((await sent((a) => a.listRuns("o1", 5))).url).toBe(
				"https://api.kredit.sh/orgs/o1/commerce/runs?limit=5",
			);
			expect((await sent((a) => a.getRun("r1"))).url).toBe(
				"https://api.kredit.sh/commerce/runs/r1",
			);
			const choose = await sent((a) => a.chooseOption("r1", null));
			expect(choose.url).toBe("https://api.kredit.sh/commerce/runs/r1/choose");
			expect(choose.body).toEqual({ find_id: null });
			const re = await sent((a) => a.rechooseOption("r1", "f2"));
			expect(re.url).toBe("https://api.kredit.sh/commerce/runs/r1/rechoose");
			expect(re.body).toEqual({ find_id: "f2" });
			expect((await sent((a) => a.stopRun("r1"))).url).toBe(
				"https://api.kredit.sh/commerce/runs/r1/stop",
			);
		});
	});
});
