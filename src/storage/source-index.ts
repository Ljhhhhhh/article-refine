import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentTypeDirectory } from "./file-naming.js";
import type { OssUploader } from "./oss-uploader.js";

export type SourceIndexEntry = {
  sourceUrl: string;
  normalizedSourceUrl: string;
  urlHash: string;
  path: string;
  title: string;
  contentType: ContentTypeDirectory;
  updatedAt: string;
};

type SourceIndexFile = {
  version: 1;
  entries: SourceIndexEntry[];
};

function indexPath(vaultPath: string): string {
  return path.join(vaultPath, ".link-processing", "source-index.json");
}

export function normalizeSourceUrl(sourceUrl: string): string {
  const parsed = new URL(sourceUrl);
  parsed.hash = "";
  return parsed.toString();
}

export function sourceUrlHash(sourceUrl: string): string {
  return createHash("sha256").update(normalizeSourceUrl(sourceUrl)).digest("hex").slice(0, 16);
}

async function readIndex(vaultPath: string): Promise<SourceIndexFile> {
  try {
    const raw = await readFile(indexPath(vaultPath), "utf8");
    const parsed = JSON.parse(raw) as SourceIndexFile;
    return { version: 1, entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeIndex(vaultPath: string, index: SourceIndexFile): Promise<void> {
  const target = indexPath(vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${Date.now()}`;
  await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function findSourceIndexEntry(
  vaultPath: string,
  sourceUrl: string
): Promise<SourceIndexEntry | undefined> {
  const hash = sourceUrlHash(sourceUrl);
  const index = await readIndex(vaultPath);
  return index.entries.find((entry) => entry.urlHash === hash);
}

export async function upsertSourceIndexEntry(
  vaultPath: string,
  entry: Omit<SourceIndexEntry, "normalizedSourceUrl" | "urlHash">
): Promise<SourceIndexEntry> {
  const normalizedSourceUrl = normalizeSourceUrl(entry.sourceUrl);
  const urlHash = sourceUrlHash(entry.sourceUrl);
  const nextEntry: SourceIndexEntry = {
    ...entry,
    normalizedSourceUrl,
    urlHash
  };

  const index = await readIndex(vaultPath);
  const entries = index.entries.filter((candidate) => candidate.urlHash !== urlHash);
  entries.push(nextEntry);
  await writeIndex(vaultPath, { version: 1, entries });
  return nextEntry;
}

async function readIndexFromOss(indexKey: string, uploader: OssUploader): Promise<SourceIndexFile> {
  try {
    const raw = await uploader.getObject(indexKey);
    if (!raw) return { version: 1, entries: [] };
    const parsed = JSON.parse(raw) as SourceIndexFile;
    return { version: 1, entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeIndexToOss(indexKey: string, uploader: OssUploader, index: SourceIndexFile): Promise<void> {
  await uploader.upload({ key: indexKey, body: `${JSON.stringify(index, null, 2)}\n`, contentType: "application/json" });
}

export async function findSourceIndexEntryFromOss(
  indexKey: string,
  uploader: OssUploader,
  sourceUrl: string
): Promise<SourceIndexEntry | undefined> {
  const hash = sourceUrlHash(sourceUrl);
  const index = await readIndexFromOss(indexKey, uploader);
  return index.entries.find((entry) => entry.urlHash === hash);
}

export async function upsertSourceIndexEntryInOss(
  indexKey: string,
  uploader: OssUploader,
  entry: Omit<SourceIndexEntry, "normalizedSourceUrl" | "urlHash">
): Promise<SourceIndexEntry> {
  const normalizedSourceUrl = normalizeSourceUrl(entry.sourceUrl);
  const urlHash = sourceUrlHash(entry.sourceUrl);
  const nextEntry: SourceIndexEntry = {
    ...entry,
    normalizedSourceUrl,
    urlHash
  };

  const index = await readIndexFromOss(indexKey, uploader);
  const entries = index.entries.filter((candidate) => candidate.urlHash !== urlHash);
  entries.push(nextEntry);
  await writeIndexToOss(indexKey, uploader, { version: 1, entries });
  return nextEntry;
}
