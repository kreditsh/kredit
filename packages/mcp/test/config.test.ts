import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.KREDIT_API_KEY;
    delete process.env.KREDIT_API_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses defaults when no env or flags", () => {
    const config = resolveConfig([]);
    expect(config.apiKey).toBe("");
    expect(config.apiUrl).toBe("https://api.kredit.sh");
  });

  it("reads from env vars", () => {
    process.env.KREDIT_API_KEY = "kr_live_test123";
    process.env.KREDIT_API_URL = "http://localhost:8000";
    const config = resolveConfig([]);
    expect(config.apiKey).toBe("kr_live_test123");
    expect(config.apiUrl).toBe("http://localhost:8000");
  });

  it("reads --api-key=VALUE flag", () => {
    const config = resolveConfig(["serve", "--api-key=kr_live_flag"]);
    expect(config.apiKey).toBe("kr_live_flag");
  });

  it("reads --api-key VALUE flag (space-separated)", () => {
    const config = resolveConfig(["serve", "--api-key", "kr_live_spaced"]);
    expect(config.apiKey).toBe("kr_live_spaced");
  });

  it("reads --api-url=VALUE flag", () => {
    const config = resolveConfig(["serve", "--api-url=http://local:9000"]);
    expect(config.apiUrl).toBe("http://local:9000");
  });

  it("CLI flags override env vars", () => {
    process.env.KREDIT_API_KEY = "kr_live_env";
    process.env.KREDIT_API_URL = "http://env-url";
    const config = resolveConfig([
      "serve",
      "--api-key=kr_live_cli",
      "--api-url=http://cli-url",
    ]);
    expect(config.apiKey).toBe("kr_live_cli");
    expect(config.apiUrl).toBe("http://cli-url");
  });
});
