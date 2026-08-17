import { describe, expect, it } from "vitest";

import { isMinddyCloudHostname, isOfficialMinddyCloud } from "@/lib/deployment-profile";

describe("official minddy cloud compatibility profile", () => {
  it("requires both Vercel and a canonical minddy.app origin", () => {
    expect(isOfficialMinddyCloud({
      VERCEL: "1",
      NEXT_PUBLIC_APP_URL: "https://www.minddy.app",
    })).toBe(true);
    expect(isOfficialMinddyCloud({
      VERCEL: "1",
      VERCEL_PROJECT_PRODUCTION_URL: "minddy.app",
    })).toBe(true);
    expect(isOfficialMinddyCloud({ NEXT_PUBLIC_APP_URL: "https://minddy.app" })).toBe(false);
    expect(isOfficialMinddyCloud({ VERCEL: "1" })).toBe(false);
  });

  it("does not accept hostnames that merely contain the official domain", () => {
    expect(isMinddyCloudHostname("preview.minddy.app")).toBe(true);
    expect(isMinddyCloudHostname("minddy.app.example.com")).toBe(false);
    expect(isMinddyCloudHostname("notminddy.app")).toBe(false);
  });
});
