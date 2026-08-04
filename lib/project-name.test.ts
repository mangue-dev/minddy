import { describe, expect, it } from "vitest";
import { suggestProjectName } from "./project-name";
import { isValidKey, suggestKeyFromName } from "./project-key";

describe("suggestProjectName", () => {
  it("propose un nom dont la clé suggérée est déjà valide", () => {
    // Le champ « Clé » se remplit tout seul depuis le nom : une proposition qui
    // demanderait de compléter la clé à la main raterait son but.
    for (let i = 0; i < 200; i++) {
      const name = suggestProjectName();
      expect(isValidKey(suggestKeyFromName(name))).toBe(true);
    }
  });

  it("écarte les noms refusés", () => {
    const seen = new Set<string>();
    // On refuse tout ce qui est déjà sorti : chaque tirage doit être neuf tant
    // qu'il reste des noms libres.
    for (let i = 0; i < 20; i++) {
      const name = suggestProjectName((c) => seen.has(c));
      expect(seen.has(name)).toBe(false);
      seen.add(name);
    }
  });

  it("propose quand même quand tout est refusé", () => {
    expect(suggestProjectName(() => true)).not.toBe("");
  });
});
