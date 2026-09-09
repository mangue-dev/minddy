import { describe, expect, it } from "vitest";

import {
  attachmentPreviewKind,
  isMarkdownFileName,
} from "@/lib/attachment-preview";

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

  it("recognizes Markdown by filename when its MIME type is generic", () => {
    expect(attachmentPreviewKind("application/octet-stream", "README.md")).toBe(
      "document",
    );
  });
});

describe("isMarkdownFileName", () => {
  it.each(["README.md", "readme.MD", "docs/guide.md"])(
    "recognizes %s",
    (fileName) => {
      expect(isMarkdownFileName(fileName)).toBe(true);
    },
  );

  it.each(["README", "README.markdown", "README.md.txt", "", null, undefined])(
    "does not recognize %s",
    (fileName) => {
      expect(isMarkdownFileName(fileName)).toBe(false);
    },
  );
});
