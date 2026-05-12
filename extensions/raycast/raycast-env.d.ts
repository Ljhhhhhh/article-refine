/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** 项目路径 - linkProcessing 项目根目录的绝对路径 */
  "projectPath": string,
  /** 运行方式 - 构建后使用 dist；开发时可用 tsx 运行源码 */
  "runtime": "dist" | "source",
  /** 重复链接 - 遇到重复链接时如何处理 */
  "duplicatePolicy": "create" | "skip" | "update",
  /** 同步到 OSS - 将处理后的笔记同步到已配置的 OSS */
  "ossEnabled": boolean,
  /** Node 路径 - 可选的 node 绝对路径。留空则使用 Raycast 的 Node 运行时。 */
  "nodePath"?: string,
  /** 超时秒数 - CLI 最长运行时间（秒） */
  "timeoutSeconds": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `save-url` command */
  export type SaveUrl = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `save-url` command */
  export type SaveUrl = {
  /** 粘贴 http/https 链接 */
  "url": string
}
}

