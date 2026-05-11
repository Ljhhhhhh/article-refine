import { getSettings, setSettings, checkHealth } from "./api.js";

const $ = (id) => document.getElementById(id);

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

init();
