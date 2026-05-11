// Shared fetch client for the local LinkProcessingAgent HTTP server.
// Imported by both the background service worker and the popup.

const DEFAULT_SETTINGS = {
  serverUrl: "http://127.0.0.1:8787",
  token: "",
  duplicatePolicy: "create",
  ossEnabled: true
};

export async function getSettings() {
  const raw = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...raw };
}

export async function setSettings(patch) {
  const current = await getSettings();
  await chrome.storage.local.set({ ...current, ...patch });
}

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function trimBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

export async function checkHealth(settings) {
  const s = settings ?? (await getSettings());
  const res = await fetch(`${trimBase(s.serverUrl)}/v1/healthz`, {
    headers: authHeaders(s.token)
  });
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
  return res.json();
}

export async function route(url, settings) {
  const s = settings ?? (await getSettings());
  const res = await fetch(`${trimBase(s.serverUrl)}/v1/route`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(s.token) },
    body: JSON.stringify({ url })
  });
  return res.json();
}

export async function processOnce(url, overrides = {}, settings) {
  const s = settings ?? (await getSettings());
  const body = {
    url,
    duplicatePolicy: overrides.duplicatePolicy ?? s.duplicatePolicy,
    oss: overrides.oss ?? s.ossEnabled
  };
  const res = await fetch(`${trimBase(s.serverUrl)}/v1/process`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(s.token) },
    body: JSON.stringify(body)
  });
  return res.json();
}

/**
 * Stream /v1/process via SSE. Calls onEvent({ type, data }) for each event.
 * Resolves with the final ProcessResult, rejects on transport error or missing result.
 */
export async function processStreaming(url, overrides, settings, onEvent) {
  const s = settings ?? (await getSettings());
  const body = JSON.stringify({
    url,
    duplicatePolicy: overrides?.duplicatePolicy ?? s.duplicatePolicy,
    oss: overrides?.oss ?? s.ossEnabled
  });
  const res = await fetch(`${trimBase(s.serverUrl)}/v1/process?stream=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...authHeaders(s.token)
    },
    body
  });
  if (!res.ok || !res.body) {
    throw new Error(`process failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalResult = null;
  let errorPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evt = parseSseChunk(chunk);
      if (!evt) continue;
      onEvent?.(evt);
      if (evt.type === "result") finalResult = evt.data;
      else if (evt.type === "error") errorPayload = evt.data;
    }
  }

  if (finalResult) return finalResult;
  if (errorPayload) {
    const err = new Error(errorPayload.message || "process failed");
    err.code = errorPayload.code;
    throw err;
  }
  throw new Error("Stream ended without a result event.");
}

function parseSseChunk(chunk) {
  let event = "message";
  let dataLine = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return null;
  try {
    return { type: event, data: JSON.parse(dataLine) };
  } catch {
    return { type: event, data: dataLine };
  }
}

export function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getServiceSettings(serverUrl, token) {
  const res = await fetch(`${trimBase(serverUrl)}/v1/settings`, {
    headers: authHeaders(token)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `GET /v1/settings failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateServiceSettings(llm, serverUrl, token, dryRun = false) {
  const qs = dryRun ? "?dryRun=1" : "";
  const res = await fetch(`${trimBase(serverUrl)}/v1/settings${qs}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ llm })
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error?.message || `PUT /v1/settings failed: HTTP ${res.status}`);
  }
  return body;
}
