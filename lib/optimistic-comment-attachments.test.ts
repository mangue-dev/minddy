import { expect, it } from "vitest";
import { optimisticAttachments } from "./optimistic-comment-attachments";

it("keeps file, link and Page resources usable before server acknowledgement", () => {
  const pages = [{ id: "page-1", title: "Current title", icon: "📘" }];
  const resources = optimisticAttachments([
    { file_name: "image.png", storage_path: "projects/project-1/image.png", mime_type: "image/png", size_bytes: 12 },
    { kind: "link", file_name: "Reference", url: "https://example.com/" },
    { kind: "page", file_name: "Earlier title", page_id: "page-1" },
  ], "comment-1", "issue-1", "author-1", "2026-09-20T10:00:00Z", "project-1", pages);
  expect(resources[0]).toMatchObject({ kind: "file", storage_path: "projects/project-1/image.png", mime_type: "image/png" });
  expect(resources[1]).toMatchObject({ kind: "link", url: "https://example.com/" });
  expect(resources[2]).toMatchObject({ kind: "page", project_id: "project-1", page_id: "page-1", page: pages[0] });
});
