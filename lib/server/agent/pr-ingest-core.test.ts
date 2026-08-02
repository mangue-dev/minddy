import { describe, expect, it } from "vitest";

import { issueRefFromPr, parseIssueRef, parsePullRequestRef } from "./pr-ingest-core";

/**
 * MIN-143 — le rattachement PR ↔ ticket est la seule logique à vraie valeur de
 * test du lot : c'est elle qui décide si une PR humaine trouve son ticket, et
 * surtout si elle en trouve un qui n'est PAS le sien.
 */

const KEYS = ["MIN"];

describe("issueRefFromPr", () => {
  it("lit la branche d'un run de Numo", () => {
    expect(
      issueRefFromPr({ projectKeys: KEYS, branch: "minddy/agent/min-42-abc" }),
    ).toBe("MIN-42");
  });

  it("lit une branche humaine", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "feature/MIN-42" })).toBe("MIN-42");
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "MIN-42" })).toBe("MIN-42");
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "fix/min-42-crash" })).toBe("MIN-42");
  });

  it("lit le titre", () => {
    expect(
      issueRefFromPr({ projectKeys: KEYS, title: "MIN-42 — rassembler les PR" }),
    ).toBe("MIN-42");
    expect(
      issueRefFromPr({ projectKeys: KEYS, title: "Corrige le tri (MIN-7)" }),
    ).toBe("MIN-7");
  });

  it("lit une ligne de fermeture du corps", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, body: "Fixes MIN-42" })).toBe("MIN-42");
    expect(
      issueRefFromPr({ projectKeys: KEYS, body: "Du contexte.\n\nCloses: MIN-9\n" }),
    ).toBe("MIN-9");
    expect(issueRefFromPr({ projectKeys: KEYS, body: "resolved min-3" })).toBe("MIN-3");
  });

  it("ignore le corps HORS ligne de fermeture — une mention n'est pas un rattachement", () => {
    expect(
      issueRefFromPr({ projectKeys: KEYS, body: "Même approche que dans MIN-12." }),
    ).toBeNull();
  });

  it("normalise la casse sur celle de la clé du projet", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-42" })).toBe("MIN-42");
    expect(issueRefFromPr({ projectKeys: ["mind"], title: "MIND-8 titre" })).toBe("mind-8");
  });

  it("préfère la branche au titre, et le titre au corps", () => {
    expect(
      issueRefFromPr({
        projectKeys: KEYS,
        branch: "min-1-a",
        title: "MIN-2 quelque chose",
        body: "Fixes MIN-3",
      }),
    ).toBe("MIN-1");
    expect(
      issueRefFromPr({ projectKeys: KEYS, title: "MIN-2 quelque chose", body: "Fixes MIN-3" }),
    ).toBe("MIN-2");
  });

  it("refuse une référence collée dans un mot", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, title: "ADMIN-42 sur la page" })).toBeNull();
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "feature/xmin-42" })).toBeNull();
  });

  it("refuse un numéro plus long — MIN-421 n'est pas MIN-42", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-421" })).toBe("MIN-421");
    expect(issueRefFromPr({ projectKeys: KEYS, title: "MIN-42x" })).toBeNull();
  });

  it("refuse la clé d'un projet qui ne lie pas ce dépôt", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "feature/ACME-42" })).toBeNull();
    expect(
      issueRefFromPr({ projectKeys: ["MIN", "ACME"], branch: "feature/ACME-42" }),
    ).toBe("ACME-42");
  });

  it("rend null sans clé, sans texte, ou sans référence", () => {
    expect(issueRefFromPr({ projectKeys: [], branch: "min-42" })).toBeNull();
    expect(issueRefFromPr({ projectKeys: KEYS })).toBeNull();
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "chore/bump-deps" })).toBeNull();
  });

  it("refuse un numéro nul", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-0" })).toBeNull();
  });

  it("normalise un numéro à zéros de tête", () => {
    expect(issueRefFromPr({ projectKeys: KEYS, branch: "min-007" })).toBe("MIN-7");
  });
});

describe("parseIssueRef", () => {
  it("sépare la clé du numéro", () => {
    expect(parseIssueRef("MIN-42")).toEqual({ key: "MIN", number: 42 });
    // Une clé peut elle-même porter un tiret : c'est le DERNIER qui sépare.
    expect(parseIssueRef("A-B-7")).toEqual({ key: "A-B", number: 7 });
  });

  it("rend null hors forme", () => {
    expect(parseIssueRef("MIN")).toBeNull();
    expect(parseIssueRef("-42")).toBeNull();
    expect(parseIssueRef("MIN-abc")).toBeNull();
  });
});

/**
 * La référence de PR écrite à la main (MCP + Numo) : c'est elle qui traduit
 * « lie la PR #42 » en une ligne de `pull_requests`. Ce qu'elle REFUSE porte
 * autant que ce qu'elle accepte — une URL d'issue prise pour une PR
 * rattacherait, sans un mot, un objet qui n'a rien à voir.
 */
describe("parsePullRequestRef", () => {
  it("lit un numéro, nu ou préfixé", () => {
    expect(parsePullRequestRef(42)).toBe(42);
    expect(parsePullRequestRef("42")).toBe(42);
    expect(parsePullRequestRef("  42 ")).toBe(42);
    expect(parsePullRequestRef("#42")).toBe(42);
    // `!42` est la syntaxe des merge requests GitLab.
    expect(parsePullRequestRef("!42")).toBe(42);
  });

  it("lit une URL de forge, GitHub comme GitLab", () => {
    expect(parsePullRequestRef("https://github.com/mangue-dev/minddy/pull/42")).toBe(42);
    expect(parsePullRequestRef("https://github.com/o/r/pull/42/files")).toBe(42);
    expect(parsePullRequestRef("https://github.com/o/r/pull/42#discussion_r1")).toBe(42);
    expect(parsePullRequestRef("https://gitlab.com/g/p/-/merge_requests/7")).toBe(7);
  });

  it("refuse une URL qui ne désigne pas une pull request", () => {
    // Les deux numérotations cohabitent dans un dépôt GitHub : l'issue 42 et la
    // PR 42 sont deux objets différents.
    expect(parsePullRequestRef("https://github.com/o/r/issues/42")).toBeNull();
    expect(parsePullRequestRef("https://github.com/o/r")).toBeNull();
  });

  it("refuse ce qui n'est pas une référence", () => {
    expect(parsePullRequestRef(null)).toBeNull();
    expect(parsePullRequestRef(undefined)).toBeNull();
    expect(parsePullRequestRef("")).toBeNull();
    expect(parsePullRequestRef("   ")).toBeNull();
    expect(parsePullRequestRef("MIN-42")).toBeNull();
    expect(parsePullRequestRef("PR 42")).toBeNull();
    expect(parsePullRequestRef(0)).toBeNull();
    expect(parsePullRequestRef(-1)).toBeNull();
    expect(parsePullRequestRef(4.2)).toBeNull();
  });
});
