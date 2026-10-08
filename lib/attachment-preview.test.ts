import { describe, expect, it } from "vitest";

import {
  attachmentPreviewKind,
  isCsvAttachment,
  isMarkdownFileName,
  withAttachmentPreviewTheme,
} from "@/lib/attachment-preview";

describe("withAttachmentPreviewTheme", () => {
  it("preserves signed access values and PDF fragments while replacing the theme", () => {
    const url = new URL(withAttachmentPreviewTheme(
      "/api/attachments/file?path=chat%2Fuser%2Ffile.csv&preview=1&expires=123&version=2&sig=a%2Bb%2Fc&theme=light#page=3",
      "dark",
    ), "https://minddy.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      path: "chat/user/file.csv", preview: "1", expires: "123", version: "2",
      sig: "a+b/c", theme: "dark",
    });
    expect(url.hash).toBe("#page=3");
    expect(url.searchParams.getAll("theme")).toEqual(["dark"]);
  });

  it("keeps absolute URLs and works without an existing query", () => {
    expect(withAttachmentPreviewTheme("https://minddy.test/file#page=2", "light"))
      .toBe("https://minddy.test/file?theme=light#page=2");
  });
});

describe("attachmentPreviewKind", () => {
  it.each([
    ["image/png", "image"],
    ["IMAGE/WEBP; charset=binary", "image"],
    ["text/plain", "document"],
    ["text/csv", "document"],
    ["APPLICATION/CSV; charset=utf-8", "document"],
    ["application/x-csv", "document"],
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

  it.each(["application/octet-stream", "application/vnd.ms-excel", "", null])(
    "previews CSV filenames with MIME type %s",
    (mimeType) => {
      expect(attachmentPreviewKind(mimeType, "vercel-costs.CSV")).toBe("document");
    },
  );
});

describe("isCsvAttachment", () => {
  it.each(["text/csv", "TEXT/CSV; charset=utf-8", "text/x-csv", "application/csv", "application/x-csv"])(
    "recognizes %s without a filename",
    (mimeType) => {
      expect(isCsvAttachment(mimeType)).toBe(true);
    },
  );

  it.each(["export.csv", "export.CSV", " export.csv "])(
    "recognizes %s with a generic MIME type",
    (fileName) => {
      expect(isCsvAttachment("application/octet-stream", fileName)).toBe(true);
    },
  );

  it.each(["export.csv.zip", "export.xlsx", "export.xls", "", null, undefined])(
    "does not treat %s as CSV based on the Excel MIME type alone",
    (fileName) => {
      expect(isCsvAttachment("application/vnd.ms-excel", fileName)).toBe(false);
    },
  );
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
