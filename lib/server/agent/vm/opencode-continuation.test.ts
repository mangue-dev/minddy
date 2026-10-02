import { describe, expect, it } from "vitest";

import { looksLikeUnexecutedPreamble } from "./opencode-continuation";

describe("premature model conclusions", () => {
  // French fixtures exercise the existing localized announcement forms.
  it.each([
    "Je vais inventorier le dossier `figma`, puis vérifier la version du projet.",
    "Hello ! Je vais regarder le dépôt puis lancer les tests.",
    "I'll inspect the folder and check package.json.",
    "Let me read the files first.",
  ])("recognizes an action announcement without a result: %s", (text) => {
    expect(looksLikeUnexecutedPreamble(text)).toBe(true);
  });

  it.each([
    "Je vais bien, merci.",
    "Le dossier contient trois fichiers et la version est 1.4.2.",
    "I will recommend the stable release because it passed all tests.",
    "Voici ce que j'ai trouvé.",
  ])("does not restart a genuine answer: %s", (text) => {
    expect(looksLikeUnexecutedPreamble(text)).toBe(false);
  });
});
