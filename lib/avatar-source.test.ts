import { describe, expect, it } from "vitest";
import { avatarImageUrl, githubAuthorAvatarUrl, isForgeBotLogin, uploadedAvatarSource, uploadedAvatarUrl } from "./avatar-source";

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

describe("GitHub author avatars", () => {
  it("points a GitHub login at its account portrait", () => {
    expect(githubAuthorAvatarUrl("github", "octo-cat")).toBe("https://github.com/octo-cat.png?size=80");
    expect(githubAuthorAvatarUrl(undefined, "octocat")).toBe("https://github.com/octocat.png?size=80");
  });

  it.each([
    ["gitlab", "octocat"],
    ["github", "dependabot[bot]"],
    ["github", "../evil"],
    ["github", "-dash"],
    ["github", null],
  ] as const)("falls back for %s author %s", (provider, login) => {
    expect(githubAuthorAvatarUrl(provider, login)).toBeNull();
  });
});

describe("forge bot logins", () => {
  it.each(["dependabot[bot]", "github-actions[bot]", "project_42_bot_3f2a", "group_7_bot"])("recognizes %s", (login) => {
    expect(isForgeBotLogin(login)).toBe(true);
  });

  it.each(["octocat", "robot", "botanist", "project_bot", null])("leaves %s a person", (login) => {
    expect(isForgeBotLogin(login)).toBe(false);
  });
});
