import { describe, expect, it } from "vitest";
import { forgeAccountMatches } from "./pr-activity";

/**
 * MIN-154: the PURE rule which recognizes a forge account. It is she who decides
 * if the hook that returns is the echo of a gesture made FROM minddy — a non
 * member recognized, and the ticket has the same line twice, the integration receives two
 * dispatches, the author of the run receives a notification for his own gesture.
 *
 * What it says is in two sentences: **the id is the key, the login is a
 * seniority fallback**, and a login never wins against a different id.
 * Writing in base (`minddyUsersForForgeAccount`) is not testable in node.
 */

/** A line of `git_user_identities` / `git_connections`. */
const row = (providerAccountId: string | null, accountLogin: string | null) => ({
  provider_account_id: providerAccountId,
  account_login: accountLogin,
});

describe("forgeAccountMatches", () => {
  it("reconnaît par l'id un compte qui s'est renommé", () => {
    // The case of the ticket: the line has yesterday's name, the hook has today's name.
    expect(
      forgeAccountMatches(row("1234", "ancien-nom"), {
        accountId: "1234",
        login: "nouveau-nom",
      }),
    ).toBe(true);
  });

  it("ne reconnaît pas un même login porté par un AUTRE id", () => {
    // Two people can follow one another on a released name: assign the gesture
    // to the wrong member is worse than assigning it to no one.
    expect(
      forgeAccountMatches(row("1234", "clement"), {
        accountId: "9999",
        login: "clement",
      }),
    ).toBe(false);
  });

  it("retombe sur le login quand la ligne n'a pas d'id", () => {
    // `provider_account_id` is nullable on both sides: the lines before
    // MIN-154 n'ont que leur nom.
    expect(
      forgeAccountMatches(row(null, "clement"), {
        accountId: "1234",
        login: "clement",
      }),
    ).toBe(true);
  });

  it("retombe sur le login quand le hook ne livre pas d'id", () => {
    expect(
      forgeAccountMatches(row("1234", "clement"), {
        accountId: null,
        login: "clement",
      }),
    ).toBe(true);
  });

  it("ne reconnaît rien sans id ni login utilisables", () => {
    expect(
      forgeAccountMatches(row("1234", "clement"), { accountId: null, login: null }),
    ).toBe(false);
    // An empty line on both sides designates no one, even against an empty actor.
    expect(
      forgeAccountMatches(row(null, null), { accountId: null, login: null }),
    ).toBe(false);
  });
});
