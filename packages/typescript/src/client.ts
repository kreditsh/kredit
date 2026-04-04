import { AuthError, KreditError, RiskDenied } from "./errors.js";
import {
  type Agent,
  AgentSchema,
  type CheckResult,
  CheckResultSchema,
  type Org,
  OrgSchema,
  type ScoreResult,
  ScoreResultSchema,
  type Wallet,
  WalletSchema,
} from "./models.js";

const DEFAULT_BASE_URL = "https://api.kredit.sh";
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MAX_RETRIES = 2;

export interface KreditOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

function resolveApiKey(apiKey?: string): string {
  if (apiKey) return apiKey;

  const envKey = process.env.KREDIT_API_KEY;
  if (envKey) return envKey;

  // Node-only: try reading ~/.kredit/config
  try {
    // Dynamic import would be async; for config file fallback we use a sync approach
    // In browser environments this simply won't resolve
    const fs = require("node:fs");
    const path = require("node:path");
    const os = require("node:os");
    const configPath = path.join(os.homedir(), ".kredit", "config");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8") as string;
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("api_key=")) {
          return trimmed.split("=").slice(1).join("=").trim();
        }
        if (trimmed.startsWith("KREDIT_API_KEY=")) {
          return trimmed.split("=").slice(1).join("=").trim();
        }
      }
    }
  } catch {
    // Not in Node or file doesn't exist — that's fine
  }

  throw new AuthError(
    "No API key provided. Pass apiKey, set KREDIT_API_KEY, or add api_key=... to ~/.kredit/config",
  );
}

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/+$/, "");
  const envUrl = process.env.KREDIT_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return DEFAULT_BASE_URL;
}

function safeJson(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object") return body as Record<string, unknown>;
  return {};
}

/** Orgs sub-client. */
class Orgs {
  constructor(private client: Kredit) {}

  /** Create an organization. */
  async create(params: { name: string }): Promise<Org> {
    const data = await this.client._request("POST", "/orgs", {
      body: { name: params.name },
    });
    return OrgSchema.parse(data);
  }

  /** List all organizations. */
  async list(): Promise<Org[]> {
    const data = await this.client._request("GET", "/orgs");
    return (data as unknown[]).map((item) => OrgSchema.parse(item));
  }
}

/** Agents sub-client. */
class Agents {
  constructor(private client: Kredit) {}

  /** Create an agent. Pass either orgId or org (name). */
  async create(params: {
    name: string;
    orgId?: string;
    org?: string;
  }): Promise<Agent> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.orgId) {
      body.org_id = params.orgId;
    } else if (params.org) {
      body.org_name = params.org;
    } else {
      throw new KreditError("Either orgId or org must be provided");
    }
    const data = await this.client._request("POST", "/agents", { body });
    return AgentSchema.parse(data);
  }

  /** List agents for an organization. */
  async list(params: { orgId: string }): Promise<Agent[]> {
    const data = await this.client._request("GET", "/agents", {
      params: { org_id: params.orgId },
    });
    return (data as unknown[]).map((item) => AgentSchema.parse(item));
  }

  /** Get a single agent by ID. */
  async get(params: { agentId: string }): Promise<Agent> {
    const data = await this.client._request(
      "GET",
      `/agents/${params.agentId}`,
    );
    return AgentSchema.parse(data);
  }
}

/** Wallet sub-client. */
class WalletClient {
  constructor(private client: Kredit) {}

  /** Get wallet for an agent. */
  async get(params: { agentId: string }): Promise<Wallet> {
    const data = await this.client._request(
      "GET",
      `/wallets/${params.agentId}`,
    );
    return WalletSchema.parse(data);
  }

  /** Set wallet budget (in cents). */
  async setBudget(params: { agentId: string; budget: number }): Promise<Wallet> {
    const data = await this.client._request(
      "PUT",
      `/wallets/${params.agentId}`,
      { body: { budget: params.budget } },
    );
    return WalletSchema.parse(data);
  }
}

/** Kredit SDK client. */
export class Kredit {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  readonly orgs: Orgs;
  readonly agents: Agents;
  readonly wallet: WalletClient;

  constructor(options: KreditOptions = {}) {
    this.apiKey = resolveApiKey(options.apiKey);
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    this.orgs = new Orgs(this);
    this.agents = new Agents(this);
    this.wallet = new WalletClient(this);
  }

  /** Internal: send an HTTP request with retry and backoff. */
  async _request(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      params?: Record<string, string>;
    },
  ): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        let url = `${this.baseUrl}${path}`;
        if (options?.params) {
          const qs = new URLSearchParams(options.params).toString();
          url += `?${qs}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const resp = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "kredit-typescript/0.1.0",
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);
        return await this.handleResponse(resp);
      } catch (error) {
        // Don't retry client errors (KreditError with 4xx status)
        if (
          error instanceof KreditError &&
          error.statusCode !== undefined &&
          error.statusCode < 500
        ) {
          throw error;
        }

        lastError = error as Error;
        if (attempt < this.maxRetries) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
      }
    }

    if (lastError instanceof KreditError) throw lastError;
    throw new KreditError(
      `Request failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  private async handleResponse(resp: Response): Promise<unknown> {
    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      body = {};
    }

    if (resp.status === 401) {
      const b = safeJson(body);
      throw new AuthError(
        (b.error as string) ?? "Authentication failed",
        b,
      );
    }
    if (resp.status === 403) {
      const b = safeJson(body);
      throw new RiskDenied((b.error as string) ?? "Forbidden", b);
    }
    if (resp.status === 429) {
      throw new KreditError("Rate limited", {
        statusCode: 429,
        body: safeJson(body),
      });
    }
    if (resp.status >= 500) {
      throw new KreditError(`Server error (${resp.status})`, {
        statusCode: resp.status,
        body: safeJson(body),
      });
    }
    if (resp.status >= 400) {
      const b = safeJson(body);
      throw new KreditError(
        (b.error as string) ?? `Request failed (${resp.status})`,
        { statusCode: resp.status, body: b },
      );
    }

    return body;
  }

  /** Run a risk check before executing an action. Hot path -- kept minimal. */
  async check(params: {
    agentId: string;
    action: string;
    estimatedCost: number;
  }): Promise<CheckResult> {
    const data = await this._request("POST", "/check", {
      body: {
        agent_id: params.agentId,
        action: params.action,
        estimated_cost: params.estimatedCost,
      },
    });
    return CheckResultSchema.parse(data);
  }

  /** Report the outcome of an action after completion. */
  async report(params: {
    agentId: string;
    txnId: string;
    outcome: string;
    actualCost: number;
  }): Promise<void> {
    await this._request("POST", "/report", {
      body: {
        agent_id: params.agentId,
        txn_id: params.txnId,
        outcome: params.outcome,
        actual_cost: params.actualCost,
      },
    });
  }

  /** Get the credit score for an agent. */
  async score(params: { agentId: string }): Promise<ScoreResult> {
    const data = await this._request(
      "GET",
      `/agents/${params.agentId}/score`,
    );
    return ScoreResultSchema.parse(data);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
