import { getSettings, setSettings, checkHealth, getServiceSettings, updateServiceSettings } from "./api.js";

const $ = (id) => document.getElementById(id);

const PROVIDER_URLS = {
  siliconflow: "https://api.siliconflow.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  "custom-openai-compatible": ""
};

let baseUrlManuallyEdited = false;

// ── Sidebar navigation ──
function initNav() {
  const navItems = document.querySelectorAll(".nav-item");
  const panels = document.querySelectorAll(".panel");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.section;

      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      panels.forEach((p) => {
        p.hidden = p.id !== `section-${target}`;
      });
    });
  });
}

// ── Settings ──
async function init() {
  initNav();

  const s = await getSettings();
  $("serverUrl").value = s.serverUrl;
  $("token").value = s.token ?? "";
  $("duplicatePolicy").value = s.duplicatePolicy;
  $("ossEnabled").checked = s.ossEnabled !== false;
  updateHostHint();

  $("serverUrl").addEventListener("input", updateHostHint);
  $("save").addEventListener("click", onSave);
  $("test").addEventListener("click", onTest);
  $("toggleToken").addEventListener("click", onToggleToken);

  initModelSection();
}

function updateHostHint() {
  const raw = $("serverUrl").value;
  const hint = $("hostHint");
  try {
    const u = new URL(raw);
    const isLocal = ["127.0.0.1", "::1", "localhost"].includes(u.hostname);
    hint.textContent = isLocal
      ? "本地回环地址，推荐且安全。"
      : "非本地地址，请确保网络安全并设置 Token。";
    hint.className = isLocal ? "hint" : "hint warn";
  } catch {
    hint.textContent = "请输入有效的 URL（如 http://127.0.0.1:8787…）。";
    hint.className = "hint warn";
  }
}

function onToggleToken() {
  const input = $("token");
  const btn = $("toggleToken");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  btn.querySelector(".icon-eye").style.display = isPassword ? "none" : "";
  btn.querySelector(".icon-eye-off").style.display = isPassword ? "" : "none";
}

async function onSave() {
  const trimmed = $("serverUrl").value.replace(/\/+$/, "");
  await setSettings({
    serverUrl: trimmed,
    token: $("token").value,
    duplicatePolicy: $("duplicatePolicy").value,
    ossEnabled: $("ossEnabled").checked
  });
  setStatus("已保存。", "ok");
}

async function onTest() {
  setStatus("测试连接中…", "");
  try {
    await checkHealth({
      serverUrl: $("serverUrl").value,
      token: $("token").value
    });
    setStatus("连接成功", "ok");
  } catch (err) {
    setStatus(`连接失败：${err.message}`, "bad");
  }
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

// ── Model section ──
async function initModelSection() {
  const localSettings = await getSettings();

  try {
    const result = await getServiceSettings(localSettings.serverUrl, localSettings.token);
    if (result.ok && result.settings) {
      const llm = result.settings;
      $("modelProvider").value = llm.modelProvider || "custom-openai-compatible";
      $("llmBaseUrl").value = llm.baseUrl || "";
      $("llmModel").value = llm.model || "";
      $("llmDraftModel").value = llm.draftModel || "";
      $("llmReviseModel").value = llm.reviseModel || "";
      $("llmLongContentThreshold").value = llm.longContentThreshold || 32000;
      updateApiKeyHint(llm.apiKeyConfigured);
    }
  } catch (err) {
    setModelStatus("无法加载模型配置：" + err.message, "bad");
  }

  $("modelProvider").addEventListener("change", onProviderChange);
  $("llmBaseUrl").addEventListener("input", () => { baseUrlManuallyEdited = true; });
  $("saveModel").addEventListener("click", onSaveModel);
  $("testModel").addEventListener("click", onTestModel);
  $("toggleApiKey").addEventListener("click", onToggleApiKey);
}

function onProviderChange() {
  const provider = $("modelProvider").value;
  const defaultUrl = PROVIDER_URLS[provider];
  const currentUrl = $("llmBaseUrl").value.trim();
  const isKnownDefault = Object.values(PROVIDER_URLS).includes(currentUrl);
  if (!baseUrlManuallyEdited || currentUrl === "" || isKnownDefault) {
    $("llmBaseUrl").value = defaultUrl;
    baseUrlManuallyEdited = false;
  }
}

async function onSaveModel() {
  const localSettings = await getSettings();
  const llm = buildLlmPatch();
  if (!llm) return;

  setModelStatus("保存中…", "");
  try {
    const result = await updateServiceSettings(llm, localSettings.serverUrl, localSettings.token);
    if (result.ok) {
      const persistNote = result.persistence?.persisted
        ? "已写入配置文件。"
        : "已生效（未持久化，重启后需重新配置）。";
      setModelStatus("保存成功。" + persistNote, "ok");
      updateApiKeyHint(true);
    } else {
      setModelStatus("保存失败：" + (result.error?.message || "未知错误"), "bad");
    }
  } catch (err) {
    setModelStatus("保存失败：" + err.message, "bad");
  }
}

async function onTestModel() {
  const localSettings = await getSettings();
  const llm = buildLlmPatch();
  if (!llm) return;

  setModelStatus("测试中…", "");
  try {
    const result = await updateServiceSettings(llm, localSettings.serverUrl, localSettings.token, true);
    if (result.ok) {
      setModelStatus("测试通过，配置有效。", "ok");
    } else {
      setModelStatus("测试失败：" + (result.error?.message || "未知错误"), "bad");
    }
  } catch (err) {
    setModelStatus("测试失败：" + err.message, "bad");
  }
}

function buildLlmPatch() {
  const model = $("llmModel").value.trim();
  if (!model) {
    setModelStatus("默认模型不能为空。", "bad");
    return null;
  }
  const baseUrl = $("llmBaseUrl").value.trim();
  if (baseUrl && !baseUrl.startsWith("http")) {
    setModelStatus("Base URL 必须以 http:// 或 https:// 开头。", "bad");
    return null;
  }

  const patch = {
    modelProvider: $("modelProvider").value,
    model,
    baseUrl: baseUrl || undefined,
    draftModel: $("llmDraftModel").value.trim() || undefined,
    reviseModel: $("llmReviseModel").value.trim() || undefined,
    longContentThreshold: parseInt($("llmLongContentThreshold").value, 10) || 32000
  };

  const apiKey = $("llmApiKey").value.trim();
  if (apiKey) {
    patch.apiKey = apiKey;
  }

  return patch;
}

function updateApiKeyHint(configured) {
  const hint = $("apiKeyHint");
  hint.textContent = configured ? "已配置（不显示明文）" : "未配置";
  hint.className = configured ? "hint" : "hint warn";
}

function setModelStatus(text, kind) {
  const el = $("modelStatus");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function onToggleApiKey() {
  const input = $("llmApiKey");
  const btn = $("toggleApiKey");
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  btn.querySelector(".icon-eye").style.display = isPassword ? "none" : "";
  btn.querySelector(".icon-eye-off").style.display = isPassword ? "" : "none";
}

init();
