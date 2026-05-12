/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Project Path - Absolute path to the linkProcessing project root */
  "projectPath": string,
  /** Runtime - Use source via pnpm exec tsx or built dist CLI via node */
  "runtime": "source" | "dist",
  /** Duplicate Policy - How to handle duplicate notes */
  "duplicatePolicy": "create" | "skip" | "update",
  /** Mirror to OSS - Mirror processed links to Alibaba Cloud OSS */
  "ossEnabled": boolean,
  /** Timeout Seconds - CLI timeout in seconds */
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
  /** https://example.com/article */
  "url": string
}
}

