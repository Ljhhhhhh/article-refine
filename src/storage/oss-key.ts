import path from "node:path";
import type { ContentTypeDirectory } from "./file-naming.js";

export function computeOssKey(input: {
  vaultPath: string;
  savedPath: string;
  prefix: string;
}): string {
  const relative = path.relative(input.vaultPath, input.savedPath);
  const posix = relative.split(path.sep).filter(Boolean).join("/");
  const prefix = input.prefix.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${posix}` : posix;
}

export function computeOssKeyFromParts(input: {
  contentType: ContentTypeDirectory;
  filename: string;
  prefix: string;
}): string {
  const prefix = input.prefix.replace(/^\/+|\/+$/g, "");
  const posix = `文章摘要/${input.contentType}/${input.filename}`;
  return prefix ? `${prefix}/${posix}` : posix;
}
