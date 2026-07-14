import { afterEach, describe, expect, it, vi } from "vitest";
import { Kredit } from "./client.js";

function mockResponse(body: unknown, status = 200): Response {
	return {
		ok: status < 400,
		status,
		json: async () => body,
	} as Response;
}

const SAMPLE_WORKFLOW = {
	id: "wf1",
	sandbox_id: "sb1",
	mode: "sandbox",
	name: "checkout-flow",
	nodes: [
		{
			id: "n1",
			type: "agent",
			label: "root",
			integration: "",
			config: {},
		},
		{
			id: "n2",
			type: "payment",
			label: "charge",
			integration: "stripe",
			config: {},
		},
	],
	edges: [{ from: "n1", to: "n2", condition: null }],
	version: 1,
	created_at: "2026-07-10T00:00:00Z",
	updated_at: "2026-07-10T00:00:00Z",
};

describe("workflows", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const client = new Kredit({ apiKey: "test", baseUrl: "https://api.test" });

	it("list sends sandbox_id (and mode) as query params", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse([SAMPLE_WORKFLOW]));
		const workflows = await client.workflows.list("sb1", "sandbox");
		expect(workflows[0].name).toBe("checkout-flow");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/workflows?");
		expect(url).toContain("sandbox_id=sb1");
		expect(url).toContain("mode=sandbox");
	});

	it("create sends sandbox_id in the body, not as a query param", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_WORKFLOW));
		await client.workflows.create("sb1", {
			name: "checkout-flow",
			nodes: [{ id: "n1", type: "agent", label: "root" }],
			edges: [{ from: "n1", to: "n2" }],
			mode: "sandbox",
		});
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).not.toContain("?");
		const body = JSON.parse(init.body as string);
		expect(body.sandbox_id).toBe("sb1");
		expect(body.name).toBe("checkout-flow");
		expect(body.nodes).toHaveLength(1);
	});

	it("list sends environment_id as a query param when provided", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse([SAMPLE_WORKFLOW]));
		await client.workflows.list("sb1", undefined, "env1");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/workflows?");
		expect(url).toContain("sandbox_id=sb1");
		expect(url).toContain("environment_id=env1");
	});

	it("create sends environment_id in the body when provided", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_WORKFLOW));
		await client.workflows.create("sb1", {
			name: "checkout-flow",
			nodes: [{ id: "n1", type: "agent", label: "root" }],
			edges: [{ from: "n1", to: "n2" }],
			environmentId: "env1",
		});
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(init.body as string);
		expect(body.environment_id).toBe("env1");
		expect(body.sandbox_id).toBe("sb1");
	});

	it("update sends only patched fields via PUT", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_WORKFLOW));
		await client.workflows.update("wf1", { name: "renamed" });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/workflows/wf1");
		expect(init.method).toBe("PUT");
		const body = JSON.parse(init.body as string);
		expect(body).toEqual({ name: "renamed" });
	});

	it("versions returns the version history", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse({
				current: 2,
				history: [{ version: 1, name: "checkout-flow", node_count: 2, saved_at: "x" }],
			}),
		);
		const versions = await client.workflows.versions("wf1");
		expect(versions.current).toBe(2);
		expect(versions.history).toHaveLength(1);
	});

	it("simulate sends seed as a query param", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse({
				workflow_id: "wf1",
				mode: "sandbox",
				node_count: 2,
				blocked_count: 0,
				total_cost: 1.5,
				node_runs: [],
			}),
		);
		const result = await client.workflows.simulate("wf1", 42);
		expect(result.workflow_id).toBe("wf1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/workflows/wf1/simulate?");
		expect(url).toContain("seed=42");
		expect(init.method).toBe("POST");
	});

	it("execute sends seed as a query param via POST", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse({
				id: "run1",
				workflow_id: "wf1",
				sandbox_id: "sb1",
				mode: "sandbox",
				status: "completed",
				node_count: 2,
				blocked_count: 0,
				total_cost: 1.5,
				elapsed_sec: 0.2,
				node_runs: [],
				transaction_ids: [],
				created_at: "2026-07-10T00:00:00Z",
			}),
		);
		const result = await client.workflows.execute("wf1", 42);
		expect(result.id).toBe("run1");
		expect(result.workflow_id).toBe("wf1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/workflows/wf1/execute?");
		expect(url).toContain("seed=42");
		expect(init.method).toBe("POST");
	});

	it("runs lists past runs for a workflow", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse([
				{
					id: "run1",
					workflow_id: "wf1",
					mode: "sandbox",
					status: "completed",
					node_count: 2,
					blocked_count: 0,
					total_cost: 1.5,
					created_at: "2026-07-10T00:00:00Z",
				},
			]),
		);
		const runs = await client.workflows.runs("wf1");
		expect(runs).toHaveLength(1);
		expect(runs[0].id).toBe("run1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/workflows/wf1/runs");
		expect(init.method).toBe("GET");
	});

	it("getRun fetches a single run record", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse({
				id: "run1",
				workflow_id: "wf1",
				sandbox_id: "sb1",
				mode: "sandbox",
				status: "completed",
				node_count: 2,
				blocked_count: 0,
				total_cost: 1.5,
				node_runs: [],
				transaction_ids: [],
				created_at: "2026-07-10T00:00:00Z",
			}),
		);
		const run = await client.workflows.getRun("run1");
		expect(run.id).toBe("run1");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/workflows/runs/run1");
		expect(init.method).toBe("GET");
	});

	it("delete returns ok", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({ ok: true }));
		const result = await client.workflows.delete("wf1");
		expect(result.ok).toBe(true);
	});
});
