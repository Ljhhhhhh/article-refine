import { getSettings, processOnce, isSupportedUrl } from "./api.js";

const MENU_ID_PAGE = "lp-save-page";
const MENU_ID_LINK = "lp-save-link";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: MENU_ID_PAGE,
      title: "Save to Obsidian (LinkProcessingAgent)",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_ID_LINK,
      title: "Save link to Obsidian (LinkProcessingAgent)",
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
    await notify("Cannot save", "Only http(s) URLs are supported.");
    return {
      ok: false,
      error: { code: "INVALID_URL", message: "Only http(s) URLs are supported." }
    };
  }

  const settings = await getSettings();
  if (!settings.serverUrl) {
    await chrome.runtime.openOptionsPage();
    return {
      ok: false,
      error: { code: "NO_SERVER", message: "Server URL is not configured." }
    };
  }

  try {
    await notify("Saving to Obsidian...", url);
    const result = await processOnce(url, overrides, settings);
    if (result.ok && result.obsidian) {
      await notify(
        "Saved to Obsidian",
        `${result.title ?? ""}\n${result.obsidian.relativePath ?? result.obsidian.path ?? ""}`
      );
    } else if (result.ok && result.skipped) {
      await notify("Already in vault", result.existingPath ?? url);
    } else {
      await notify(
        "Save failed",
        result.error?.message ?? "Unknown error from server."
      );
    }
    return result;
  } catch (err) {
    await notify("Save failed", err?.message ?? "Network error.");
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
