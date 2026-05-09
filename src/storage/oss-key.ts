import path from "node:path";

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
