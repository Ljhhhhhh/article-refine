import {
  getSettings,
  setSettings,
  checkHealth,
  processStreaming,
  isSupportedUrl
} from "./api.js";

const $ = (id) => document.getElementById(id);

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await getSettings();

  $("title").textContent = tab?.title ?? "—";
  $("url").textContent = tab?.url ?? "—";
  $("duplicatePolicy").value = settings.duplicatePolicy;
  $("ossEnabled").checked = settings.ossEnabled !== false;

  if (!tab?.url || !isSupportedUrl(tab.url)) {
    $("save").disabled = true;
    $("save").textContent = "Unsupported URL";
  }

  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("duplicatePolicy").addEventListener("change", (e) =>
    setSettings({ duplicatePolicy: e.target.value })
  );
  $("ossEnabled").addEventListener("change", (e) =>
    setSettings({ ossEnabled: e.target.checked })
  );

  $("save").addEventListener("click", () => onSave(tab?.url));

  checkHealth(settings)
    .then((h) => {
      $("health").textContent = `server: ${h.ok ? "ok" : "down"} (${settings.serverUrl})`;
      $("health").classList.toggle("bad", !h.ok);
    })
    .catch((err) => {
      $("health").textContent = `server: unreachable (${err.message})`;
      $("health").classList.add("bad");
    });
}

async function onSave(url) {
  if (!url || !isSupportedUrl(url)) return;
  const saveBtn = $("save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  showStatus("starting", "");
  $("result").hidden = true;

  const overrides = {
    duplicatePolicy: $("duplicatePolicy").value,
    oss: $("ossEnabled").checked
  };

  try {
    const result = await processStreaming(url, overrides, undefined, (evt) => {
      if (evt.type === "progress") showStatus(evt.data.step, "");
      else if (evt.type === "error") showStatus("error", evt.data.message);
    });
    renderResult(result);
  } catch (err) {
    renderResult({
      ok: false,
      error: { code: err.code ?? "NETWORK", message: err.message }
    });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save to Obsidian";
  }
}

function showStatus(step, detail) {
  const labels = {
    starting: "Starting...",
    fetching: "Fetching content...",
    preparing: "Compressing long content...",
    drafting: "Drafting note (pass 1)...",
    extracting: "Extracting...",
    revising: "Revising (pass 2)...",
    saving: "Saving to vault...",
    mirroring: "Mirroring to OSS...",
    error: "Error"
  };
  $("status").hidden = false;
  $("statusStep").textContent = labels[step] ?? step;
  $("statusDetail").textContent = detail ?? "";
}

function renderResult(result) {
  const el = $("result");
  el.hidden = false;
  el.innerHTML = "";

  if (result.ok && result.obsidian) {
    el.append(
      div("ok", "✓ Saved"),
      div("title", result.title ?? ""),
      div("path", result.obsidian.relativePath ?? result.obsidian.path ?? "")
    );
    if (result.oss?.uploaded) {
      el.append(div("oss", `OSS: ${result.oss.url}`));
    } else if (result.oss && !result.oss.uploaded) {
      el.append(div("warn", `OSS: ${result.oss.error?.message ?? "upload failed"}`));
    }
    return;
  }

  if (result.ok && result.skipped) {
    el.append(
      div("warn", "↷ Already in vault"),
      div("path", result.existingPath ?? "")
    );
    return;
  }

  const err = result.error ?? { code: "UNKNOWN", message: "unknown" };
  el.append(div("bad", `✗ ${err.code}`), div("message", err.message ?? ""));
}

function div(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}

main();
