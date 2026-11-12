import { describe, expect, it, vi } from "vitest";
import { isValidEmail, lookupAccount, parseAccountStatus, preserveAuthParams } from "./auth-entry";

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("parseAccountStatus", () => {
  it("accepts the three statuses and nothing else", () => {
    expect(parseAccountStatus("new")).toBe("new");
    expect(parseAccountStatus("password")).toBe("password");
    expect(parseAccountStatus("oauth")).toBe("oauth");
    expect(parseAccountStatus("admin")).toBeNull();
    expect(parseAccountStatus(null)).toBeNull();
  });
});

describe("lookupAccount", () => {
  it("returns what the address holds", async () => {
    const fetcher = reply(200, { status: "password" });
    await expect(lookupAccount(" ana@example.com ", fetcher)).resolves.toEqual({ status: "password" });
    expect(JSON.parse((fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ email: "ana@example.com" });
  });

  it("says when too many addresses were tried", async () => {
    await expect(lookupAccount("ana@example.com", reply(429, {}))).resolves.toEqual({ failure: "errorRateLimited" });
  });

  it("fails plainly on a server error, an odd answer or no network", async () => {
    await expect(lookupAccount("ana@example.com", reply(500, {}))).resolves.toEqual({ failure: "errorUnexpected" });
    await expect(lookupAccount("ana@example.com", reply(200, { status: "maybe" }))).resolves.toEqual({ failure: "errorUnexpected" });
    const offline = vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    await expect(lookupAccount("ana@example.com", offline)).resolves.toEqual({ failure: "errorUnexpected" });
  });
});

describe("isValidEmail", () => {
  it.each(["a@b.co", "  clement@minddy.app  ", "x+tag@mail.example.org"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "clement", "clement@", "@minddy.app", "a@b", "a@@b.co", "a b@c.co", "a@.co", "a@b."])("refuses %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("preserveAuthParams", () => {
  it("keeps the destination and the invitation, and drops the rest", () => {
    const kept = new URLSearchParams(preserveAuthParams(
      "redirect=%2Fprojects%2F42&invite=tok3n&error=oauth_denied&mode=signup&utm_source=x",
    ));
    expect(kept.get("redirect")).toBe("/projects/42");
    expect(kept.get("invite")).toBe("tok3n");
    expect(kept.get("error")).toBeNull();
    expect(kept.get("mode")).toBeNull();
    expect(kept.get("utm_source")).toBeNull();
  });

  it("returns nothing when nothing follows", () => {
    expect(preserveAuthParams("")).toBe("");
    expect(preserveAuthParams("error=oauth_failed")).toBe("");
  });

  it("adds what the caller asks for, such as the address for the reset screen", () => {
    const query = preserveAuthParams("redirect=%2Fhome", { email: "ana@example.com" });
    const kept = new URLSearchParams(query);
    expect(query.startsWith("?")).toBe(true);
    expect(kept.get("email")).toBe("ana@example.com");
    expect(kept.get("redirect")).toBe("/home");
  });

  it("reads a URLSearchParams as well as a string", () => {
    expect(preserveAuthParams(new URLSearchParams({ invite: "tok3n" }))).toBe("?invite=tok3n");
  });
});
