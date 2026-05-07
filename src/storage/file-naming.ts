import path from "node:path";

export type ContentTypeDirectory =
  | "技术深度"
  | "观点思考"
  | "教程学习"
  | "资讯动态"
  | "综合";

export type FileNamer = {
  generateFilename(title: string, contentType: ContentTypeDirectory): string;
  simplifyTitle(title: string): string;
};

type FileNamerOptions = {
  exists: (relativePath: string) => boolean;
  now: () => Date;
};

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

export function createFileNamer(options: FileNamerOptions): FileNamer {
  function simplifyTitle(title: string): string {
    return title
      .replace(/^(转载|翻译|分享|推荐)[：:]\s*/i, "")
      .replace(/<[^>]*>/g, "")
      .replace(INVALID_FILENAME_CHARS, "")
      .replace(/\s*[—-]\s*阅读原文.*$/i, "")
      .replace(/\s*[—-]\s*本文转载自.*$/i, "")
      .slice(0, 80)
      .replace(/[。！？，、；：]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function generateFilename(title: string, contentType: ContentTypeDirectory): string {
    const date = options.now().toISOString().slice(0, 10);
    const simplifiedTitle = simplifyTitle(title) || "未命名链接笔记";
    const baseName = `${date}-${simplifiedTitle}`;
    let suffix = 0;

    while (true) {
      const candidate = suffix === 0 ? `${baseName}.md` : `${baseName} (${suffix}).md`;
      const relativePath = path.join("文章摘要", contentType, candidate);
      if (!options.exists(relativePath)) {
        return candidate;
      }
      suffix += 1;
    }
  }

  return {
    generateFilename,
    simplifyTitle
  };
}
