import { afterEach, describe, expect, it, vi } from "vitest";
import { Kredit } from "./client.js";

function mockResponse(body: unknown, status = 200): Response {
	return {
		ok: status < 400,
		status,
		json: async () => body,
	} as Response;
}

const SAMPLE_ENV = {
	id: "e1",
	sandbox_id: "sb1",
	user_id: "u1",
	kind: "development",
	name: "Development",
	simulation_id: null,
	parent_environment_id: null,
	active: true,
	created_at: "2026-07-10T00:00:00Z",
	updated_at: "2026-07-10T00:00:00Z",
};

describe("environments", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const client = new Kredit({ apiKey: "test", baseUrl: "https://api.test" });

	it("list sends sandbox_id as a query param", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse([SAMPLE_ENV]));
		const envs = await client.environments.list("sb1");
		expect(envs[0].kind).toBe("development");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/environments?");
		expect(url).toContain("sandbox_id=sb1");
	});

	it("create sends sandbox_id, kind, and simulation_id in the body", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_ENV));
		await client.environments.create("sb1", {
			kind: "simulation-run",
			name: "Run 1",
			simulationId: "sim1",
		});
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/environments");
		expect(url).not.toContain("?");
		const body = JSON.parse(init.body as string);
		expect(body.sandbox_id).toBe("sb1");
		expect(body.kind).toBe("simulation-run");
		expect(body.name).toBe("Run 1");
		expect(body.simulation_id).toBe("sim1");
	});

	it("get fetches by id with no query string", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_ENV));
		const env = await client.environments.get("e1");
		expect(env.id).toBe("e1");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/environments/e1");
		expect(url).not.toContain("?");
	});

	it("delete issues a DELETE request", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse({ ok: true }));
		await client.environments.delete("e1");
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe("DELETE");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/environments/e1");
	});
});
