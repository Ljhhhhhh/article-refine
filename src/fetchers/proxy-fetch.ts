import { ProxyAgent, fetch as undiciFetch } from "undici";

let cachedAgent: ProxyAgent | undefined;

function getProxyAgent(): ProxyAgent | undefined {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.https_proxy ?? process.env.http_proxy;
  if (!proxyUrl) return undefined;
  if (!cachedAgent) {
    cachedAgent = new ProxyAgent(proxyUrl);
  }
  return cachedAgent;
}

export function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const agent = getProxyAgent();
  if (!agent) return fetch(url, init);
  return undiciFetch(url, { ...init, dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}
