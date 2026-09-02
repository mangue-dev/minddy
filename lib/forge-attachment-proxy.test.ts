import { describe, expect, it } from "vitest";
import {
  forgeAttachmentProxyUrl,
  forgeAttachmentStoragePath,
} from "./forge-image-assets";

const PR_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";

describe("forge attachment proxy paths", () => {
  it("builds a same-origin URL without exposing the storage provider", () => {
    const path = `${PR_ID}/${ATTACHMENT_ID}/capture.png`;
    const url = forgeAttachmentProxyUrl("https://minddy.example", path);

    expect(url).toBe(
      `https://minddy.example/api/pr-attachments/${PR_ID}/${ATTACHMENT_ID}/capture.png`,
    );
    expect(url).not.toContain("supabase");
  });

  it("accepts only an unguessable attachment key with a safe file name", () => {
    expect(
      forgeAttachmentStoragePath([PR_ID, ATTACHMENT_ID, "review-file_2.pdf"]),
    ).toBe(`${PR_ID}/${ATTACHMENT_ID}/review-file_2.pdf`);
    expect(
      forgeAttachmentStoragePath([PR_ID, ATTACHMENT_ID, "..", "secret"]),
    ).toBeNull();
    expect(
      forgeAttachmentStoragePath([PR_ID, "not-a-uuid", "capture.png"]),
    ).toBeNull();
  });
});
