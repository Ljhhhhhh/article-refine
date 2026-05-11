import { getSettings, setSettings, checkHealth, isSupportedUrl } from "./api.js";

const $ = (id) => document.getElementById(id);

const STEP_LABELS = {
  fetching: "抓取中…",
  extracting: "提取中…",
  saving: "保存中…",
  mirroring: "同步中…"
};

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await getSettings();

  $("title").textContent = tab?.title ?? "—";
  $("url").textContent = truncateUrl(tab?.url);
  $("ossEnabled").checked = settings.ossEnabled !== false;

  if (!tab?.url || !isSupportedUrl(tab.url)) {
    $("save").disabled = true;
    $("save").querySelector(".btn-text").textContent = "不支持的链接";
  }

  initTabs();

  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("ossEnabled").addEventListener("change", (e) =>
    setSettings({ ossEnabled: e.target.checked })
  );

  $("save").addEventListener("click", () => onSave(tab?.url));
  $("saveManual").addEventListener("click", () => onManualSave());
  $("manualUrl").addEventListener("input", () => {
    $("manualError").hidden = true;
  });

  checkHealth(settings)
    .then((h) => {
      $("health").dataset.ok = h.ok ? "1" : "0";
      $("health").textContent = h.ok ? "已连接" : "服务不可用";
    })
    .catch(() => {
      $("health").dataset.ok = "0";
      $("health").textContent = "无法连接";
    });

  // Load tasks from background
  loadTasks();

  // Listen for real-time task updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "task-update") {
      updateTaskInList(msg.task);
    }
  });
}

// ── Tabs ──
function initTabs() {
  const tabs = document.querySelectorAll(".tab-item");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      contents.forEach((c) => {
        c.hidden = c.dataset.tabContent !== target;
      });
    });
  });
}

// ── Tasks ──
let currentTasks = [];

function loadTasks() {
  chrome.runtime.sendMessage({ type: "get-tasks" }, (tasks) => {
    if (chrome.runtime.lastError || !tasks) return;
    currentTasks = tasks;
    renderTasks();
  });
}

function updateTaskInList(task) {
  const idx = currentTasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    currentTasks[idx] = task;
  } else {
    currentTasks.push(task);
  }
  renderTasks();
}

function renderTasks() {
  const section = $("taskSection");
  const list = $("taskList");

  if (currentTasks.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  // Sort: processing first, then by updatedAt desc
  const sorted = [...currentTasks].sort((a, b) => {
    const order = { processing: 0, pending: 1, done: 2, skipped: 3, failed: 4 };
    const da = order[a.status] ?? 5;
    const db = order[b.status] ?? 5;
    if (da !== db) return da - db;
    return b.updatedAt - a.updatedAt;
  });

  list.innerHTML = sorted.map(renderTaskItem).join("");
}

function renderTaskItem(task) {
  const icon = getTaskIcon(task);
  const info = getTaskInfo(task);
  return `<div class="task-item" data-task-id="${task.id}">
    <div class="task-status-icon">${icon}</div>
    <div class="task-info">
      <div class="task-url">${escapeHtml(truncateUrl(task.url))}</div>
      ${info}
    </div>
  </div>`;
}

function getTaskIcon(task) {
  switch (task.status) {
    case "processing":
    case "pending":
      return '<div class="spinner"></div>';
    case "done":
      return `<svg class="icon-done" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    case "skipped":
      return `<svg class="icon-skip" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    case "failed":
      return `<svg class="icon-fail" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    default:
      return "";
  }
}

function getTaskInfo(task) {
  if (task.status === "processing" && task.step) {
    return `<div class="task-step">${escapeHtml(STEP_LABELS[task.step] ?? task.step)}</div>`;
  }
  if (task.status === "done" && task.result) {
    return `<div class="task-result">${escapeHtml(task.result.title ?? task.result.path ?? "")}</div>`;
  }
  if (task.status === "skipped" && task.result) {
    return `<div class="task-result">已存在</div>`;
  }
  if (task.status === "failed" && task.error) {
    return `<div class="task-result" style="color:var(--red)">${escapeHtml(task.error)}</div>`;
  }
  return "";
}

// ── Save ──
function onSave(url) {
  if (!url || !isSupportedUrl(url)) return;
  const overrides = { oss: $("ossEnabled").checked };
  chrome.runtime.sendMessage({ type: "save", url, overrides });
  // Don't close popup — let user see task progress
}

function onManualSave() {
  const url = $("manualUrl").value.trim();
  if (!url) {
    showManualError("请输入链接。");
    return;
  }
  if (!isSupportedUrl(url)) {
    showManualError("仅支持 http/https 链接。");
    return;
  }
  const overrides = { oss: $("ossEnabled").checked };
  chrome.runtime.sendMessage({ type: "save", url, overrides });
  $("manualUrl").value = "";
  // Don't close popup — let user see task progress
}

function showManualError(msg) {
  const el = $("manualError");
  el.textContent = msg;
  el.hidden = false;
}

// ── Utils ──
function truncateUrl(url) {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main();
