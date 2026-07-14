import { afterEach, describe, expect, it, vi } from "vitest";
import { Kredit } from "./client.js";

function mockResponse(body: unknown, status = 200): Response {
	return {
		ok: status < 400,
		status,
		json: async () => body,
	} as Response;
}

const SAMPLE_CHAT = {
	id: "c1",
	sandbox_id: "sb1",
	mode: "sandbox",
	simulation_id: null,
	title: "New chat",
	messages: [
		{
			id: "m1",
			chat_id: "c1",
			role: "assistant",
			content: "hi",
			tool_calls: [],
			components: [
				{ type: "chart", ref_id: "r1", title: "Spend", data: { x: 1 } },
			],
			created_at: "2026-07-10T00:00:00Z",
		},
	],
	created_at: "2026-07-10T00:00:00Z",
	updated_at: "2026-07-10T00:00:00Z",
};

describe("chats", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const client = new Kredit({ apiKey: "test", baseUrl: "https://api.test" });

	it("list sends sandbox_id as a query param when provided", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse([SAMPLE_CHAT]));
		const chats = await client.chats.list("sb1");
		expect(chats[0].title).toBe("New chat");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/chats?");
		expect(url).toContain("sandbox_id=sb1");
	});

	it("list without a sandbox omits the query string", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse([SAMPLE_CHAT]));
		await client.chats.list();
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/chats");
		expect(url).not.toContain("?");
	});

	it("create sends all fields in the body, not the query string", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse(SAMPLE_CHAT));
		await client.chats.create({
			sandboxId: "sb1",
			mode: "sandbox",
			simulationId: "sim1",
			title: "New chat",
		});
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/chats");
		expect(url).not.toContain("?");
		const body = JSON.parse(init.body as string);
		expect(body.sandbox_id).toBe("sb1");
		expect(body.mode).toBe("sandbox");
		expect(body.simulation_id).toBe("sim1");
		expect(body.title).toBe("New chat");
	});

	it("get returns the chat with parsed messages and components", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			mockResponse(SAMPLE_CHAT),
		);
		const chat = await client.chats.get("c1");
		expect(chat.messages[0].components[0].type).toBe("chart");
		expect(chat.messages[0].role).toBe("assistant");
	});

	it("delete issues a DELETE request", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(mockResponse({ ok: true }));
		await client.chats.delete("c1");
		const init = fetchMock.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe("DELETE");
		const url = fetchMock.mock.calls[0][0] as string;
		expect(url).toContain("/chats/c1");
	});
});
