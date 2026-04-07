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
        actual_cost: 4.80,
      });

      expect(result.new_score).toBe(755);

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.kredit.sh/report");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual({
        transaction_id: "txn_123",
        outcome: "success",
        actual_cost: 4.80,
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
        wallet: { balance: 500.0, budget: 1000.0, max_per_txn: 0, daily_spend_limit: 0 },
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
  });

  describe("error handling", () => {
    it("throws on non-ok response", async () => {
      const fetchMock = mockFetch({ error: "unauthorized" }, 401);
      vi.stubGlobal("fetch", fetchMock);

      const api = new KreditAPI(config);
      await expect(api.check({
        agent_id: "a",
        action: "x",
        estimated_cost: 0,
      })).rejects.toThrow("401");
    });
  });
});
