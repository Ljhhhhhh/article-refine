import type { LinkType } from "./types.js";

export type CapabilityStatus = "stable" | "beta" | "route_only";

export type LinkCapability = {
  status: CapabilityStatus;
  canProcess: boolean;
  canInspect: boolean;
  label: string;
  notes: string[];
};

const CAPABILITIES: Record<LinkType, LinkCapability> = {
  twitter: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "Twitter/X article or tweet",
    notes: ["Uses api.fxtwitter.com JSON parsing with web fetch fallback."]
  },
  tech_blog: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "Technical blog",
    notes: ["Uses HTTP fetch, Readability extraction, and Markdown conversion."]
  },
  general: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "General web article",
    notes: ["Best for article-like HTML pages with readable main content."]
  },
  docs: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "Product or developer docs",
    notes: ["Works for static documentation pages; multi-page crawling is not included."]
  },
  weixin: {
    status: "beta",
    canProcess: true,
    canInspect: true,
    label: "WeChat public account article",
    notes: ["HTTP extraction may work; Playwright JavaScript fallback is not implemented."]
  },
  academic: {
    status: "beta",
    canProcess: true,
    canInspect: true,
    label: "Academic abstract or paper page",
    notes: ["HTML pages may work; PDF parsing is not implemented."]
  },
  video: {
    status: "route_only",
    canProcess: false,
    canInspect: false,
    label: "Video URL",
    notes: ["Video metadata and transcript extraction are not implemented."]
  }
};

export function getLinkCapability(linkType: LinkType): LinkCapability {
  return CAPABILITIES[linkType];
}

export function listLinkCapabilities(): Record<LinkType, LinkCapability> {
  return CAPABILITIES;
}
