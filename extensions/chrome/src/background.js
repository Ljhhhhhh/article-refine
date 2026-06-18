import { getSettings, processStreaming, isSupportedUrl } from "./api.js";

const MENU_ID_PAGE = "lp-save-page";
const MENU_ID_LINK = "lp-save-link";
const MAX_TASKS = 20;
const STORAGE_KEY = "lp-tasks";

// ── Task store ──
let tasks = new Map();

async function loadTasks() {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY);
    const arr = raw[STORAGE_KEY] ?? [];
    tasks = new Map(arr.map((t) => [t.id, t]));
  } catch {
    tasks = new Map();
  }
}

async function persistTasks() {
  const arr = [...tasks.values()].slice(-MAX_TASKS);
  tasks = new Map(arr.map((t) => [t.id, t]));
  await chrome.storage.local.set({ [STORAGE_KEY]: arr });
}

function createTask(url, title) {
  const task = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title: title ?? "",
    status: "pending",
    step: null,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  tasks.set(task.id, task);
  return task;
}

function updateTask(id, patch) {
  const task = tasks.get(id);
  if (!task) return;
  Object.assign(task, patch, { updatedAt: Date.now() });
  broadcastUpdate(task);
}

function broadcastUpdate(task) {
  try {
    chrome.runtime.sendMessage({ type: "task-update", task }).catch(() => {});
  } catch {
    // popup may not be open
  }
}

// ── Context menus ──
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: MENU_ID_PAGE,
      title: "保存到 Obsidian（观 Guan）",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_ID_LINK,
      title: "保存链接到 Obsidian（观 Guan）",
      contexts: ["link"]
    });
  } catch (err) {
    console.warn("contextMenus.create:", err?.message ?? err);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url =
    info.menuItemId === MENU_ID_LINK ? info.linkUrl : info.pageUrl ?? tab?.url;
  if (url) await runSave(url);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save_current_tab") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) await runSave(tab.url);
});

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "save") {
    runSave(msg.url, msg.overrides)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: { code: "EXTENSION_ERROR", message: err?.message ?? "unknown" }
        })
      );
    return true;
  }
  if (msg?.type === "get-tasks") {
    sendResponse([...tasks.values()]);
    return false;
  }
  return false;
});

// ── Core save logic ──
async function runSave(url, overrides = {}) {
  if (!isSupportedUrl(url)) {
    await notify("无法保存", "仅支持 http/https 链接。");
    return {
      ok: false,
      error: { code: "INVALID_URL", message: "仅支持 http/https 链接。" }
    };
  }

  const settings = await getSettings();
  if (!settings.serverUrl) {
    await chrome.runtime.openOptionsPage();
    return {
      ok: false,
      error: { code: "NO_SERVER", message: "未配置服务器地址。" }
    };
  }

  const task = createTask(url);
  broadcastUpdate(task);

  try {
    updateTask(task.id, { status: "processing", step: "fetching" });

    const result = await processStreaming(url, overrides, settings, (evt) => {
      if (evt.type === "progress" && evt.data?.step) {
        updateTask(task.id, { step: evt.data.step });
      }
    });

    if (result.ok && result.obsidian) {
      updateTask(task.id, {
        status: "done",
        step: null,
        result: {
          title: result.title,
          path: result.obsidian.relativePath ?? result.obsidian.path
        }
      });
      await notify(
        "已保存到 Obsidian",
        `${result.title ?? ""}\n${result.obsidian.relativePath ?? result.obsidian.path ?? ""}`
      );
    } else if (result.ok && result.skipped) {
      updateTask(task.id, {
        status: "skipped",
        step: null,
        result: { existingPath: result.existingPath }
      });
      await notify("笔记已存在", result.existingPath ?? url);
    } else {
      updateTask(task.id, {
        status: "failed",
        step: null,
        error: result.error?.message ?? "服务器返回未知错误。"
      });
      await notify(
        "保存失败",
        result.error?.message ?? "服务器返回未知错误。"
      );
    }

    await persistTasks();
    return result;
  } catch (err) {
    updateTask(task.id, {
      status: "failed",
      step: null,
      error: err?.message ?? "网络错误。"
    });
    await persistTasks();
    await notify("保存失败", err?.message ?? "网络错误。");
    return {
      ok: false,
      error: { code: "NETWORK", message: err?.message ?? "Network error." }
    };
  }
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/128.png"),
      title,
      message: String(message ?? "").slice(0, 400),
      priority: 0
    });
  } catch (err) {
    console.warn("notify:", err?.message ?? err);
  }
}

// ── Init ──
loadTasks();
