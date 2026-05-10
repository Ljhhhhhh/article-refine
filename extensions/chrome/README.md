# LinkProcessingAgent — Chrome Extension

Save the current tab into your Obsidian vault with one click, a context menu, or a keyboard shortcut. The extension is a thin client for a local HTTP server shipped inside `link-processing-agent`.

## Prerequisites

Run the server alongside your editor:

```bash
pnpm build
node dist/cli/index.js serve --port 8787
# with auth:
node dist/cli/index.js serve --port 8787 --token your-secret
```

The server binds `127.0.0.1` by default and only accepts connections from your own machine.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extensions/chrome/` folder.
4. Pin the extension so its toolbar icon is visible.

## Configure

Click the extension icon → ⚙, or open `chrome://extensions` → Details → Extension options.

- **Server URL** — default `http://127.0.0.1:8787`. The page warns if you point at a non-loopback host.
- **Bearer token** — leave empty unless you started the server with `--token`.
- **Default duplicate policy** — `create` keeps multiple notes, `skip` ignores duplicates, `update` overwrites.
- **Mirror to OSS by default** — only has effect if the server has OSS credentials configured.

Click **Test connection** to verify.

## Usage

- **Popup** — click the toolbar icon → adjust options → **Save to Obsidian**. Live progress streams from the server over SSE.
- **Context menu** — right-click anywhere on a page → *Save to Obsidian*. Right-click a link → *Save link to Obsidian*.
- **Keyboard shortcut** — `Alt+Shift+S` saves the current tab without opening the popup. Customize at `chrome://extensions/shortcuts`.

Notifications show the final vault path on success, or an error message on failure.

## Permissions Explained

| Permission | Why |
|---|---|
| `activeTab` | Read the current tab's URL only when you trigger the action. |
| `contextMenus` | Register the right-click items. |
| `notifications` | Toast the save result from the background worker. |
| `storage` | Persist server URL, token, and defaults locally. |
| `host_permissions: 127.0.0.1, localhost` | Allow `fetch` to the local server from the service worker. |

The extension never talks to anything other than the URL you set.

## Troubleshooting

- **Popup footer says "server: unreachable"** — the serve process is not running, or the URL/port in options does not match.
- **401 Unauthorized** — token mismatch. Either remove `--token` from the server or paste the same token in the extension options.
- **"Unsupported URL"** — the current tab is on a `chrome://`, `file://`, or similar scheme. Only `http(s)` pages are eligible.
- **Server errors streaming back (FETCH_FAILED, LLM_OUTPUT_INVALID, …)** — run `node dist/cli/index.js doctor` to diagnose.

## Icons

Place PNG icons at `icons/16.png`, `icons/48.png`, `icons/128.png` inside `extensions/chrome/`. The extension still works without them, but Chrome will show a generic placeholder.
