import { describe, expect, it } from "vitest";

import { attachmentPreviewKind } from "@/lib/attachment-preview";

describe("attachmentPreviewKind", () => {
  it.each([
    ["image/png", "image"],
    ["IMAGE/WEBP; charset=binary", "image"],
    ["text/plain", "document"],
    ["text/html; charset=utf-8", "document"],
    ["application/pdf", "document"],
    ["application/xml", "document"],
    ["application/rss+xml", "document"],
    ["application/manifest+json", "document"],
    ["image/svg+xml", "document"],
    ["audio/mpeg", "audio"],
    ["video/mp4", "video"],
  ] as const)("maps %s to %s", (mimeType, kind) => {
    expect(attachmentPreviewKind(mimeType)).toBe(kind);
  });

  it.each([
    "application/octet-stream",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "",
    null,
    undefined,
  ])("keeps %s download-only", (mimeType) => {
    expect(attachmentPreviewKind(mimeType)).toBeNull();
  });
});
