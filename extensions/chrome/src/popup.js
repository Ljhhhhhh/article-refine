import { getSettings, setSettings, checkHealth, isSupportedUrl } from "./api.js";

const $ = (id) => document.getElementById(id);

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

  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("ossEnabled").addEventListener("change", (e) =>
    setSettings({ ossEnabled: e.target.checked })
  );

  $("save").addEventListener("click", () => onSave(tab?.url));

  checkHealth(settings)
    .then((h) => {
      $("health").dataset.ok = h.ok ? "1" : "0";
      $("health").textContent = h.ok ? "已连接" : "服务不可用";
    })
    .catch(() => {
      $("health").dataset.ok = "0";
      $("health").textContent = "无法连接";
    });
}

function truncateUrl(url) {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function onSave(url) {
  if (!url || !isSupportedUrl(url)) return;
  const overrides = { oss: $("ossEnabled").checked };
  chrome.runtime.sendMessage({ type: "save", url, overrides });
  window.close();
}

main();
