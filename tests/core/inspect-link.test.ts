import { describe, expect, test } from "vitest";
import { inspectLink } from "../../src/core/inspect-link.js";
import type { ContentFetcher } from "../../src/fetchers/fetcher.js";

const fakeFetcher: ContentFetcher = {
  name: "fake",
  canFetch: () => true,
  fetch: async ({ sourceUrl }) => ({
    sourceUrl,
    title: "Agent 工程文章",
    author: "Author",
    rawText: "架构 API 性能 部署 框架 Agent LLM 大模型 ".repeat(20),
    metadata: {}
  })
};

describe("inspectLink", () => {
  test("routes, fetches, analyzes content, and does not save", async () => {
    const result = await inspectLink("https://example.dev/agent", {
      fetchers: [fakeFetcher],
      qualityThreshold: 300
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command).toBe("inspect");
      expect(result.linkType).toBe("tech_blog");
      expect(result.title).toBe("Agent 工程文章");
      expect(result.author).toBe("Author");
      expect(result.contentType).toBe("技术深度");
      expect(result.recommendedTags).toContain("#技术深度");
      expect(result.wordCount).toBeGreaterThan(20);
    }
  });

  test("returns CONTENT_TOO_SHORT for non-video short content", async () => {
    const shortFetcher: ContentFetcher = {
      name: "short",
      canFetch: () => true,
      fetch: async ({ sourceUrl }) => ({
        sourceUrl,
        rawText: "太短",
        metadata: {}
      })
    };

    const result = await inspectLink("https://example.com/short", {
      fetchers: [shortFetcher],
      qualityThreshold: 300
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONTENT_TOO_SHORT");
    }
  });
});
