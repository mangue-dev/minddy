import { describe, expect, it } from "vitest";
import { uploadedAvatarSource, uploadedAvatarUrl } from "./avatar-source";

describe("uploaded avatar sources", () => {
  it("round-trips a same-origin user avatar path", () => {
    const path = "/api/avatars/123e4567-e89b-12d3-a456-426614174000?v=1";
    expect(uploadedAvatarUrl(uploadedAvatarSource(path))).toBe(path);
  });

  it.each([
    "a Lorelei seed",
    "uploaded:https://tracker.example/api/avatars/123e4567-e89b-12d3-a456-426614174000",
    "uploaded:/api/avatars/not-a-user-id",
    "uploaded:javascript:alert(1)",
  ])("rejects an untrusted source: %s", (source) => {
    expect(uploadedAvatarUrl(source)).toBeNull();
  });
});
