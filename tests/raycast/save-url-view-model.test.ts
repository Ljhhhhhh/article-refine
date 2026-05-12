import { describe, expect, test } from "vitest";
import {
  buildDashboardMarkdown,
  formatCliPreview,
  getDestinationLabel,
  getSourceType,
  getTaskStatus,
  shortenMiddle,
} from "../../extensions/raycast/src/save-url-view-model.js";

describe("save-url view model", () => {
  test("shortens long values in the middle", () => {
    const value =
      "/Users/guanmo/Documents/projects/linkProcessing/dist/cli/index.js";

    expect(shortenMiddle(value, 32)).toBe("/Users/guanmo/...t/cli/index.js");
  });

  test("detects source type from the URL host", () => {
    expect(getSourceType("https://mp.weixin.qq.com/s/abc")).toBe("微信文章");
    expect(getSourceType("https://x.com/raycast")).toBe("Twitter/X");
    expect(getSourceType("https://example.com/post")).toBe("网页文章");
  });

  test("reports task status from running, result, and error state", () => {
    expect(getTaskStatus({ running: true })).toEqual({
      label: "处理中",
      tone: "blue",
    });
    expect(
      getTaskStatus({
        running: false,
        result: { ok: true, title: "已保存", message: "ok" },
      }),
    ).toEqual({
      label: "已保存",
      tone: "green",
    });
    expect(getTaskStatus({ running: false, error: "boom" })).toEqual({
      label: "失败",
      tone: "red",
    });
  });

  test("labels the destination from the OSS preference", () => {
    expect(getDestinationLabel({ ossEnabled: true })).toBe("Obsidian + OSS");
    expect(getDestinationLabel({ ossEnabled: false })).toBe("仅本地 Obsidian");
  });

  test("builds a readable dashboard without leaking the full CLI command into the pipeline", () => {
    const markdown = buildDashboardMarkdown({
      url: "https://mp.weixin.qq.com/s/abc",
      running: true,
      config: {
        projectPath: "/Users/guanmo/Documents/projects/linkProcessing",
        runtime: "dist",
        duplicatePolicy: "create",
        ossEnabled: true,
        timeoutSeconds: "180",
        cliCommand:
          "/Users/guanmo/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.22.2/bin/node /Users/guanmo/Documents/projects/linkProcessing/dist/cli/index.js process https://mp.weixin.qq.com/s/abc --json",
      },
      steps: [
        { label: "校验链接", status: "done", detail: "mp.weixin.qq.com/s/abc" },
        { label: "准备命令", status: "done", detail: "构建产物" },
        { label: "处理内容", status: "active", detail: "抓取内容并生成笔记" },
        { label: "返回结果", status: "pending" },
      ],
    });

    expect(markdown).toContain("# 保存链接到 Obsidian");
    expect(markdown).toContain("微信文章");
    expect(markdown).toContain("| 处理内容 | 处理中 | 抓取内容并生成笔记 |");
    expect(markdown).toContain("## 命令");
    expect(markdown).toContain(
      formatCliPreview(
        "/Users/guanmo/Library/Application Support/com.raycast.macos/NodeJS/runtime/22.22.2/bin/node /Users/guanmo/Documents/projects/linkProcessing/dist/cli/index.js process https://mp.weixin.qq.com/s/abc --json",
      ),
    );
  });
});
