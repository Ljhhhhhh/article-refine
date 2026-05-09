import { describe, expect, test } from "vitest";
import { getLinkCapability } from "../../src/router/capabilities.js";

describe("getLinkCapability", () => {
  test("marks Twitter and technical blogs as processable", () => {
    expect(getLinkCapability("twitter")).toMatchObject({
      status: "stable",
      canProcess: true
    });
    expect(getLinkCapability("tech_blog")).toMatchObject({
      status: "stable",
      canProcess: true
    });
  });

  test("marks video as route-only until metadata fetcher exists", () => {
    expect(getLinkCapability("video")).toMatchObject({
      status: "route_only",
      canProcess: false
    });
  });

  test("marks academic as beta because PDF extraction is not implemented", () => {
    expect(getLinkCapability("academic")).toMatchObject({
      status: "beta",
      canProcess: true
    });
  });
});
