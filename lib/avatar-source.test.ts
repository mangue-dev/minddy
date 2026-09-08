import { describe, expect, it } from "vitest";
import { avatarImageUrl, uploadedAvatarSource, uploadedAvatarUrl } from "./avatar-source";

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

describe("external avatar image URLs", () => {
  it.each([
    "https://avatars.example/user.png?v=1&size=80",
    "http://localhost:3000/avatar.png",
    "blob:https://minddy.example/123e4567-e89b-12d3-a456-426614174000",
  ])("preserves supported image sources: %s", (value) => {
    expect(avatarImageUrl(value)).toBe(value);
  });

  it.each([
    "javascript:void(0)",
    "data:text/html,<p>untrusted</p>",
    "data:image/svg+xml,<svg></svg>",
    "blob:javascript:void(0)",
    "file:///private/avatar.png",
    "//tracker.example/avatar.png",
    "not a URL",
  ])("rejects active or unsupported source schemes: %s", (value) => {
    expect(avatarImageUrl(value)).toBeNull();
  });
});
