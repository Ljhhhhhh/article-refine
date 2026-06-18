# 观（Guan）Raycast 扩展

在 Raycast 中输入链接，一步保存到 Obsidian。扩展直接调用本地 Guan CLI，不依赖 HTTP 服务。

## 准备

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm dev -- doctor
```

“源码运行”会执行：

```bash
node --import tsx /Users/guanmo/Documents/projects/linkProcessing/src/cli/index.ts process <url> --json
```

默认“构建产物”会执行：

```bash
node /Users/guanmo/Documents/projects/linkProcessing/dist/cli/index.js process <url> --json
```

## 本地调试

```bash
cd extensions/raycast
npm install
npm run dev
```

在 Raycast 中运行 **保存链接到 Obsidian**，粘贴 URL，然后按 Enter。

## 偏好设置

- **项目路径**：当前仓库的绝对路径。
- **运行方式**：执行过 `pnpm build` 后使用 `dist`；开发时可切到 `source`。
- **重复链接**：对应默认新建、`--skip-existing` 或 `--update-existing`。
- **同步到 OSS**：关闭后会追加 `--no-oss`。
- **Node 路径**：可选覆盖项。留空则使用 Raycast 自带 Node 运行时。
- **超时秒数**：CLI 进程最长运行时间。

## 排障

- 如果 Raycast 提示 `spawn node ENOENT`，清空 **Node 路径**，或填入真实的 node 绝对路径。
- 如果源码运行无法解析 `tsx`，在仓库根目录运行 `pnpm install`。
- 如果处理失败且提示配置问题，在仓库根目录运行 `pnpm dev -- doctor`。
- 如果构建产物找不到 `dist/cli/index.js`，运行 `pnpm build`。
