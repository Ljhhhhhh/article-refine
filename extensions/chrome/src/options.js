import { getSettings, setSettings, checkHealth } from "./api.js";

const $ = (id) => document.getElementById(id);

async function init() {
  const s = await getSettings();
  $("serverUrl").value = s.serverUrl;
  $("token").value = s.token ?? "";
  $("duplicatePolicy").value = s.duplicatePolicy;
  $("ossEnabled").checked = s.ossEnabled !== false;
  updateHostHint();

  $("serverUrl").addEventListener("input", updateHostHint);
  $("save").addEventListener("click", onSave);
  $("test").addEventListener("click", onTest);
}

function updateHostHint() {
  const raw = $("serverUrl").value;
  const hint = $("hostHint");
  try {
    const u = new URL(raw);
    const isLocal = ["127.0.0.1", "::1", "localhost"].includes(u.hostname);
    hint.textContent = isLocal
      ? "Loopback binding. Recommended and safe."
      : "⚠ Non-loopback host. Only use if you trust the network and set a bearer token.";
    hint.className = isLocal ? "hint" : "hint warn";
  } catch {
    hint.textContent = "Enter a valid URL (e.g. http://127.0.0.1:8787).";
    hint.className = "hint warn";
  }
}

async function onSave() {
  const trimmed = $("serverUrl").value.replace(/\/+$/, "");
  await setSettings({
    serverUrl: trimmed,
    token: $("token").value,
    duplicatePolicy: $("duplicatePolicy").value,
    ossEnabled: $("ossEnabled").checked
  });
  setStatus("Saved.", "ok");
}

async function onTest() {
  setStatus("Testing...", "");
  try {
    const h = await checkHealth({
      serverUrl: $("serverUrl").value,
      token: $("token").value
    });
    setStatus(`Connected: ${JSON.stringify(h)}`, "ok");
  } catch (err) {
    setStatus(`Failed: ${err.message}`, "bad");
  }
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

init();
