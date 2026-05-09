import { AppError, toFailureResult, type FailureResult } from "../errors/errors.js";
import { getLinkCapability, type LinkCapability } from "../router/capabilities.js";
import { LinkRouter } from "../router/link-router.js";
import type { RoutedLink } from "../router/types.js";

export type RouteSuccessResult = RoutedLink & {
  ok: true;
  command: "route";
  capability: LinkCapability;
};

export type RouteResult = RouteSuccessResult | FailureResult;

export function routeLink(sourceUrl: string): RouteResult {
  try {
    const parsedUrl = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new AppError("INVALID_URL", "URL must use http or https.");
    }

    const routed = new LinkRouter().route(sourceUrl);
    return {
      ok: true,
      command: "route",
      ...routed,
      capability: getLinkCapability(routed.linkType)
    };
  } catch (error) {
    if (error instanceof AppError) {
      return toFailureResult("route", error, sourceUrl);
    }
    return toFailureResult(
      "route",
      new AppError("INVALID_URL", "Input is not a valid URL."),
      sourceUrl
    );
  }
}
