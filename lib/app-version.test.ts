import { describe, expect, it } from "vitest";

import { commitsSinceVersion } from "@/scripts/commits-since-version.mjs";

import { formatAppVersion } from "./app-version";

describe("formatAppVersion", () => {
  it("laisse la version nue sur son tag", () => {
    expect(formatAppVersion("0.8.9", 0)).toBe("0.8.9");
  });

  it("suffixe du nombre de commits derrière", () => {
    expect(formatAppVersion("0.8.9", 1)).toBe("0.8.9-1");
    expect(formatAppVersion("1.2.3", 3)).toBe("1.2.3-3");
    expect(formatAppVersion("0.8.9", 41)).toBe("0.8.9-41");
    expect(formatAppVersion("0.8.9", 703)).toBe("0.8.9-703");
  });

  it("ne suffixe rien de ce qui n'est pas un compte", () => {
    expect(formatAppVersion("0.8.9", -1)).toBe("0.8.9");
    expect(formatAppVersion("0.8.9", Number.NaN)).toBe("0.8.9");
    expect(formatAppVersion("0.8.9", Number.POSITIVE_INFINITY)).toBe("0.8.9");
  });
});

describe("commitsSinceVersion", () => {
  // La mesure lit le VRAI dépôt : on n'affirme donc rien sur le compte du jour,
  // seulement sur sa forme et sur ce qu'elle fait quand elle ne sait pas.
  it("rend un entier positif ou nul", () => {
    const n = commitsSinceVersion();
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("rend 0 pour une version qui n'a ni tag ni commit de bump", () => {
    // Le cas du clone superficiel de Vercel sans VERCEL_DEEP_CLONE : la base de
    // comptage est hors de portée. Mieux vaut taire le compte que le deviner.
    expect(commitsSinceVersion("99.99.99-inexistante")).toBe(0);
  });

  it("ne lève pas quand la version est vide", () => {
    expect(commitsSinceVersion("")).toBe(0);
  });
});
