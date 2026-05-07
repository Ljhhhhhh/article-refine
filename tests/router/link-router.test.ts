import { describe, expect, test } from "vitest";
import { routeLink } from "../../src/core/route-link.js";

describe("routeLink", () => {
  test.each([
    ["https://mp.weixin.qq.com/s/abc", "weixin", "web_fetch"],
    ["https://x.com/user/status/123", "twitter", "twitter_api"],
    ["https://twitter.com/user/status/123", "twitter", "twitter_api"],
    ["https://www.youtube.com/watch?v=abc", "video", "metadata_only"],
    ["https://arxiv.org/abs/2401.00001", "academic", "web_fetch"],
    ["https://docs.example.com/docs/getting-started", "docs", "web_fetch"],
    ["https://example.dev/post", "tech_blog", "web_fetch"],
    ["https://example.com/article", "general", "web_fetch"]
  ])("routes %s to %s", (sourceUrl, linkType, primary) => {
    const result = routeLink(sourceUrl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceUrl).toBe(sourceUrl);
      expect(result.linkType).toBe(linkType);
      expect(result.strategy.primary).toBe(primary);
    }
  });

  test("returns INVALID_URL for malformed input", () => {
    const result = routeLink("not a url");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_URL");
    }
  });
});
