import { getSettings, processOnce, isSupportedUrl } from "./api.js";

const MENU_ID_PAGE = "lp-save-page";
const MENU_ID_LINK = "lp-save-link";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: MENU_ID_PAGE,
      title: "保存到 Obsidian (LinkProcessingAgent)",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_ID_LINK,
      title: "保存链接到 Obsidian (LinkProcessingAgent)",
      contexts: ["link"]
    });
  } catch (err) {
    // Menus may already exist on reload.
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

// Popup delegates saves through the service worker so they survive popup close.
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
    return true; // indicates async sendResponse
  }
  return false;
});

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

  try {
    await notify("正在保存到 Obsidian...", url);
    const result = await processOnce(url, overrides, settings);
    if (result.ok && result.obsidian) {
      await notify(
        "已保存到 Obsidian",
        `${result.title ?? ""}\n${result.obsidian.relativePath ?? result.obsidian.path ?? ""}`
      );
    } else if (result.ok && result.skipped) {
      await notify("笔记已存在", result.existingPath ?? url);
    } else {
      await notify(
        "保存失败",
        result.error?.message ?? "服务器返回未知错误。"
      );
    }
    return result;
  } catch (err) {
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
    // Ignore: notifications may be disabled or icon asset missing.
    console.warn("notify:", err?.message ?? err);
  }
}
