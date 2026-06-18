import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Agent } from "../index.js";
import { checkAuth, isLocalhostBind } from "./auth.js";
import { UrlLock } from "./url-lock.js";

export type HttpServerOptions = {
  agent: Agent;
  host: string;
  port: number;
  token?: string;
  allowNonLocal?: boolean;
  onLog?: (event: { level: "info" | "warn" | "error"; message: string }) => void;
};

export function createHttpServer(opts: HttpServerOptions): Server {
  if (!isLocalhostBind(opts.host) && !opts.allowNonLocal) {
    throw new Error(
      `Refusing to bind ${opts.host}. Pass --allow-non-local to expose the server beyond loopback.`
    );
  }

  const lock = new UrlLock();

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, opts, lock);
    } catch (err) {
      writeJson(res, 500, {
        ok: false,
        command: "server",
        error: {
          code: "HTTP_SERVER_FAILED",
          message: err instanceof Error ? err.message : "Unknown server error.",
          retryable: false
        }
      });
    }
  });
  return server;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  opts: HttpServerOptions,
  lock: UrlLock
): Promise<void> {
  // CORS preflight — extensions need this when calling from a service worker.
  if (req.method === "OPTIONS") {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }
  setCors(res);

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

  if (req.method === "GET" && url.pathname === "/v1/healthz") {
    return writeJson(res, 200, { ok: true, name: "guan", version: "0.1.0" });
  }

  const auth = checkAuth(req, { token: opts.token });
  if (!auth.ok) {
    return writeJson(res, auth.status, {
      ok: false,
      error: { code: "UNAUTHORIZED", message: auth.message, retryable: false }
    });
  }

  if (req.method === "GET" && url.pathname === "/v1/settings") {
    const settings = opts.agent.getSettings();
    return writeJson(res, 200, {
      ok: true,
      settings: settings.llm,
      persistence: settings.persistence
    });
  }

  if (req.method === "PUT" && url.pathname === "/v1/settings") {
    const body = await readJson(req);
    if (!body || typeof body !== "object") {
      return badRequest(res, "Request body must be a JSON object.");
    }
    const patch = body.llm as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== "object") {
      return badRequest(res, "Field `llm` is required.");
    }
    const dryRun = url.searchParams.get("dryRun") === "1";

    try {
      const result = await opts.agent.updateSettings(
        patch as Parameters<typeof opts.agent.updateSettings>[0],
        dryRun
      );
      return writeJson(res, result.ok ? 200 : 400, result);
    } catch (err) {
      return writeJson(res, 500, {
        ok: false,
        error: {
          code: "SETTINGS_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Settings update failed.",
          retryable: false
        }
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/v1/doctor") {
    const result = await opts.agent.doctor();
    return writeJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/v1/route") {
    const body = await readJson(req);
    if (!body || typeof body.url !== "string") {
      return badRequest(res, "Field `url` is required.");
    }
    const result = opts.agent.route(body.url);
    return writeJson(res, result.ok ? 200 : 400, result);
  }

  if (req.method === "POST" && url.pathname === "/v1/inspect") {
    const body = await readJson(req);
    if (!body || typeof body.url !== "string") {
      return badRequest(res, "Field `url` is required.");
    }
    const result = await opts.agent.inspect(body.url);
    return writeJson(res, result.ok ? 200 : 500, result);
  }

  if (req.method === "POST" && url.pathname === "/v1/process") {
    const body = await readJson(req);
    if (!body || typeof body.url !== "string") {
      return badRequest(res, "Field `url` is required.");
    }
    const targetUrl = body.url as string;
    const duplicatePolicy = body.duplicatePolicy as "create" | "skip" | "update" | undefined;
    const oss = typeof body.oss === "boolean" ? (body.oss as boolean) : undefined;
    const useSse = url.searchParams.get("stream") === "1";

    if (!useSse) {
      const result = await lock.run(targetUrl, () =>
        opts.agent.process(targetUrl, { duplicatePolicy, oss })
      );
      return writeJson(res, result.ok ? 200 : 500, result);
    }

    // SSE streaming: emit progress, then final result, then close.
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await lock.run(targetUrl, () =>
        opts.agent.process(targetUrl, {
          duplicatePolicy,
          oss,
          onProgress: (step) => send("progress", { step })
        })
      );
      send("result", result);
    } catch (err) {
      send("error", {
        code: "HTTP_SERVER_FAILED",
        message: err instanceof Error ? err.message : "process failed"
      });
    } finally {
      res.end();
    }
    return;
  }

  writeJson(res, 404, {
    ok: false,
    error: { code: "NOT_FOUND", message: `No route: ${req.method} ${url.pathname}` }
  });
}

function setCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function badRequest(res: ServerResponse, message: string): void {
  writeJson(res, 400, {
    ok: false,
    error: { code: "INVALID_OPTIONS", message, retryable: false }
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
