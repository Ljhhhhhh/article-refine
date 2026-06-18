import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AddressInfo } from "node:net";
import { createHttpServer } from "../../src/server/http.js";
import type { Agent, AgentSettingsUpdateResult, LlmSettingsPatch } from "../../src/index.js";

type TestServer = { close: () => Promise<void>; port: number };

function mockAgent(): Agent {
  return {
    config: {} as Agent["config"],
    configPath: "/tmp/config.yaml",
    route: (url: string) =>
      ({
        ok: true,
        command: "route",
        sourceUrl: url,
        linkType: "general",
        capability: { status: "stable", canProcess: true, canInspect: true, label: "x", notes: [] }
      }) as unknown as ReturnType<Agent["route"]>,
    inspect: async (url: string) =>
      ({
        ok: true,
        command: "inspect",
        sourceUrl: url,
        linkType: "general",
        wordCount: 10,
        contentType: "综合",
        recommendedTags: []
      }) as unknown as Awaited<ReturnType<Agent["inspect"]>>,
    process: async (url: string) =>
      ({
        ok: true,
        command: "process",
        sourceUrl: url,
        linkType: "general",
        contentType: "综合",
        title: "t",
        obsidian: { path: "/tmp/t.md", relativePath: "t.md", tags: [] }
      }) as unknown as Awaited<ReturnType<Agent["process"]>>,
    doctor: async () => ({ ok: true, checks: [] }),
    close: async () => {},
    getSettings: () => ({
      llm: {
        provider: "mock",
        model: "mock",
        apiKeyConfigured: false,
        longContentThreshold: 32000
      },
      persistence: {
        loadedConfigFile: false,
        configPath: "/tmp/config.yaml",
        canPersist: false
      }
    }),
    updateSettings: async (_patch: LlmSettingsPatch, _dryRun?: boolean): Promise<AgentSettingsUpdateResult> => ({
      ok: true,
      settings: {
        llm: {
          provider: "mock",
          model: "mock",
          apiKeyConfigured: false,
          longContentThreshold: 32000
        }
      },
      persistence: { persisted: false, configPath: "/tmp/config.yaml", loadedConfigFile: false }
    })
  };
}

async function startTestServer(agent: Agent, token?: string): Promise<TestServer> {
  const http = createHttpServer({ agent, host: "127.0.0.1", port: 0, token });
  await new Promise<void>((resolve) =>
    http.listen(0, "127.0.0.1", () => resolve())
  );
  const port = (http.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => http.close(() => r()))
  };
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer(mockAgent());
});

afterEach(async () => {
  await server.close();
});

describe("HTTP server", () => {
  test("GET /v1/healthz returns ok", async () => {
    const r = await request(server.port, "GET", "/v1/healthz");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, name: "guan" });
  });

  test("POST /v1/route returns RouteResult", async () => {
    const r = await request(server.port, "POST", "/v1/route", { url: "https://example.com" });
    expect(r.status).toBe(200);
    expect((r.body as Record<string, unknown>).ok).toBe(true);
    expect((r.body as Record<string, unknown>).command).toBe("route");
  });

  test("POST /v1/inspect returns InspectResult", async () => {
    const r = await request(server.port, "POST", "/v1/inspect", { url: "https://example.com" });
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  test("POST /v1/process missing url returns 400", async () => {
    const r = await request(server.port, "POST", "/v1/process", {});
    expect(r.status).toBe(400);
    expect((r.body as { error: { code: string } }).error.code).toBe("INVALID_OPTIONS");
  });

  test("POST /v1/process returns ProcessResult", async () => {
    const r = await request(server.port, "POST", "/v1/process", { url: "https://example.com" });
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  test("GET /v1/doctor returns checks", async () => {
    const r = await request(server.port, "GET", "/v1/doctor");
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  test("unknown path returns 404", async () => {
    const r = await request(server.port, "GET", "/v1/unknown");
    expect(r.status).toBe(404);
  });

  test("CORS preflight returns 204 with allow headers", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/v1/process`, {
      method: "OPTIONS"
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("enforces bearer token when configured", async () => {
    await server.close();
    server = await startTestServer(mockAgent(), "secret");

    const denied = await request(server.port, "POST", "/v1/route", {
      url: "https://example.com"
    });
    expect(denied.status).toBe(401);

    const ok = await request(
      server.port,
      "POST",
      "/v1/route",
      { url: "https://example.com" },
      { authorization: "Bearer secret" }
    );
    expect(ok.status).toBe(200);
  });

  test("refuses to bind non-loopback without allowNonLocal", () => {
    expect(() =>
      createHttpServer({ agent: mockAgent(), host: "0.0.0.0", port: 0 })
    ).toThrow(/Refusing to bind/);
  });

  test("GET /v1/settings returns sanitized settings", async () => {
    const r = await request(server.port, "GET", "/v1/settings");
    expect(r.status).toBe(200);
    const body = r.body as { ok: boolean; settings: { model: string }; persistence: { canPersist: boolean } };
    expect(body.ok).toBe(true);
    expect(body.settings.model).toBe("mock");
    expect(body.persistence).toBeDefined();
  });

  test("GET /v1/settings requires auth when token is configured", async () => {
    await server.close();
    server = await startTestServer(mockAgent(), "secret");

    const denied = await request(server.port, "GET", "/v1/settings");
    expect(denied.status).toBe(401);

    const ok = await request(server.port, "GET", "/v1/settings", undefined, {
      authorization: "Bearer secret"
    });
    expect(ok.status).toBe(200);
  });

  test("PUT /v1/settings with valid patch returns 200", async () => {
    const r = await request(server.port, "PUT", "/v1/settings", {
      llm: { model: "new-model" }
    });
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  test("PUT /v1/settings with missing llm field returns 400", async () => {
    const r = await request(server.port, "PUT", "/v1/settings", {});
    expect(r.status).toBe(400);
  });

  test("PUT /v1/settings with ?dryRun=1 returns 200 without persisting", async () => {
    const r = await request(server.port, "PUT", "/v1/settings?dryRun=1", {
      llm: { model: "dry-run-model" }
    });
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  test("PUT /v1/settings requires auth when token is configured", async () => {
    await server.close();
    server = await startTestServer(mockAgent(), "secret");

    const denied = await request(server.port, "PUT", "/v1/settings", { llm: { model: "x" } });
    expect(denied.status).toBe(401);

    const ok = await request(
      server.port,
      "PUT",
      "/v1/settings",
      { llm: { model: "x" } },
      { authorization: "Bearer secret" }
    );
    expect(ok.status).toBe(200);
  });

  test("CORS preflight includes PUT in allowed methods", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/v1/settings`, {
      method: "OPTIONS"
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("PUT");
  });
});
