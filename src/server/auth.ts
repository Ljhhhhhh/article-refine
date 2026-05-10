import type { IncomingMessage } from "node:http";

export type AuthConfig = {
  token?: string;
};

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export function checkAuth(req: IncomingMessage, config: AuthConfig): AuthResult {
  if (!config.token) return { ok: true };

  const header = req.headers["authorization"];
  if (!header || Array.isArray(header)) {
    return { ok: false, status: 401, message: "Missing Authorization header." };
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== config.token) {
    return { ok: false, status: 401, message: "Invalid bearer token." };
  }
  return { ok: true };
}

export function isLocalhostBind(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}
