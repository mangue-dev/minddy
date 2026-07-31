import { describe, expect, it } from "vitest";
import { forgeAccountMatches } from "./pr-activity";

/**
 * MIN-154 : la règle PURE qui reconnaît un compte de forge. C'est elle qui décide
 * si le hook qui revient est l'écho d'un geste fait DEPUIS minddy — un membre non
 * reconnu, et le ticket porte deux fois la même ligne, l'intégration reçoit deux
 * dispatchs, l'auteur du run reçoit une notification pour son propre geste.
 *
 * Ce qu'elle affirme tient en deux phrases : **l'id est la clé, le login est un
 * repli d'ancienneté**, et un login ne gagne jamais contre un id différent.
 * L'écriture en base (`minddyUsersForForgeAccount`) n'est pas testable en node.
 */

/** Une ligne de `git_user_identities` / `git_connections`. */
const row = (providerAccountId: string | null, accountLogin: string | null) => ({
  provider_account_id: providerAccountId,
  account_login: accountLogin,
});

describe("forgeAccountMatches", () => {
  it("reconnaît par l'id un compte qui s'est renommé", () => {
    // Le cas du ticket : la ligne porte le nom d'hier, le hook celui d'aujourd'hui.
    expect(
      forgeAccountMatches(row("1234", "ancien-nom"), {
        accountId: "1234",
        login: "nouveau-nom",
      }),
    ).toBe(true);
  });

  it("ne reconnaît pas un même login porté par un AUTRE id", () => {
    // Deux personnes peuvent se succéder sur un nom libéré : attribuer le geste
    // au mauvais membre est pire que ne l'attribuer à personne.
    expect(
      forgeAccountMatches(row("1234", "clement"), {
        accountId: "9999",
        login: "clement",
      }),
    ).toBe(false);
  });

  it("retombe sur le login quand la ligne n'a pas d'id", () => {
    // `provider_account_id` est nullable des deux côtés : les lignes d'avant
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
    // Une ligne vide des deux côtés ne désigne personne, même face à un acteur vide.
    expect(
      forgeAccountMatches(row(null, null), { accountId: null, login: null }),
    ).toBe(false);
  });
});
