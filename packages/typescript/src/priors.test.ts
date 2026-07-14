import { afterEach, describe, expect, it, vi } from "vitest";
import { Kredit } from "./client.js";

function mockResponse(body: unknown, status = 200): Response {
	return {
		ok: status < 400,
		status,
		json: async () => body,
	} as Response;
}

const SAMPLE_PRIOR = {
	id: "p1",
	sandbox_id: "sb1",
	mode: "sandbox",
	name: "checkout",
	workflow_id: "",
	frequency: { mean: 4, variance: 2 },
	cost: { mean: 2, variance: 1 },
	transitions: {},
	seasonality: { dow: [], hour: [] },
	source: "manual",
	created_at: "2026-07-10T00:00:00Z",
	updated_at: "2026-07-10T00:00:00Z",
};

describe("priors", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const client = new Kredit({ apiKey: "test", baseUrl: "https://api.test" });

	it("list sends sandbox_id (and mode) as query params", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse([SAMPLE_PRIOR]));
		const priors = await client.priors.list("sb1", "sandbox");
		expect(priors[0].name).toBe("checkout");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/priors?");
		expect(url).toContain("sandbox_id=sb1");
		expect(url).toContain("mode=sandbox");
	});

	it("create sends sandbox_id as a query param, not in the body", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_PRIOR));
		await client.priors.create("sb1", {
			name: "checkout",
			frequency: { mean: 4, variance: 2 },
			cost: { mean: 2, variance: 1 },
			seasonality: { dow: [], hour: [] },
			workflowId: "wf1",
		});
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/priors?");
		expect(url).toContain("sandbox_id=sb1");
		const body = JSON.parse(init.body as string);
		expect(body.sandbox_id).toBeUndefined();
		expect(body.workflow_id).toBe("wf1");
	});

	it("presets returns the preset map", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse({ "24x7": { dow: [], hour: [] } }),
		);
		const presets = await client.priors.presets();
		expect(presets["24x7"]).toBeDefined();
	});
});
