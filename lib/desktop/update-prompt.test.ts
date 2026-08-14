import { describe, expect, it } from "vitest";
import { updatePromptCopy, updatePromptChoice } from "./update-prompt";

describe("updatePromptCopy", () => {
  it("nomme la version qu'on s'apprête à poser", () => {
    expect(updatePromptCopy("0.9.5").message).toContain("0.9.5");
  });

  it("met l'installation en avant, et le report en échappement", () => {
    const copy = updatePromptCopy("1.0.0");
    expect(copy.buttons[copy.defaultId]).toBe("Install and Relaunch");
    expect(copy.buttons[copy.cancelId]).toBe("Later");
    // Échap ne doit JAMAIS relancer l'app sous les doigts de quelqu'un.
    expect(copy.defaultId).not.toBe(copy.cancelId);
  });
});

describe("updatePromptChoice", () => {
  it("n'installe que sur le premier bouton", () => {
    expect(updatePromptChoice(0)).toBe("install");
  });

  it("reporte sur tout le reste, y compris une boîte fermée sans réponse", () => {
    for (const response of [1, -1, 2]) {
      expect(updatePromptChoice(response)).toBe("later");
    }
  });
});
