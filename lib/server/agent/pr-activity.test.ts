import { describe, expect, it } from "vitest";
import { forgeAccountMatches } from "./pr-activity";

/**
 * MIN-154: the PURE rule that recognizes a forge account. It decides whether
 * an incoming hook echoes an action taken FROM minddy. Miss a member and the
 * issue shows the same line twice, the integration receives two dispatches,
 * and the run's author is notified of their own action.
 *
 * It comes down to two sentences: **the id is the key, the login is a legacy
 * fallback**, and a login never wins against a different id. The database
 * lookup (`minddyUsersForForgeAccount`) cannot be tested in Node.
 */

/** A row of `git_user_identities` / `git_connections`. */
const row = (providerAccountId: string | null, accountLogin: string | null) => ({
  provider_account_id: providerAccountId,
  account_login: accountLogin,
});

describe("forgeAccountMatches", () => {
  it("recognizes a renamed account by its id", () => {
    // The issue's case: the row has yesterday's name, the hook today's.
    expect(
      forgeAccountMatches(row("1234", "ancien-nom"), {
        accountId: "1234",
        login: "nouveau-nom",
      }),
    ).toBe(true);
  });

  it("does not match the same login carried by ANOTHER id", () => {
    // Two people can hold a released name one after the other: attributing the
    // action to the wrong member is worse than attributing it to no one.
    expect(
      forgeAccountMatches(row("1234", "clement"), {
        accountId: "9999",
        login: "clement",
      }),
    ).toBe(false);
  });

  it("falls back to the login when the row has no id", () => {
    // `provider_account_id` is nullable on both sides: rows from before
    // MIN-154 only have their name.
    expect(
      forgeAccountMatches(row(null, "clement"), {
        accountId: "1234",
        login: "clement",
      }),
    ).toBe(true);
  });

  it("falls back to the login when the hook carries no id", () => {
    expect(
      forgeAccountMatches(row("1234", "clement"), {
        accountId: null,
        login: "clement",
      }),
    ).toBe(true);
  });

  it("matches nothing without a usable id or login", () => {
    expect(
      forgeAccountMatches(row("1234", "clement"), { accountId: null, login: null }),
    ).toBe(false);
    // An empty row designates no one, even against an empty actor.
    expect(
      forgeAccountMatches(row(null, null), { accountId: null, login: null }),
    ).toBe(false);
  });
});
