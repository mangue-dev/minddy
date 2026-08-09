import { describe, expect, it } from "vitest";
import { planSubmitShortcut } from "@/lib/keyboard/submit-shortcut";

type Ev = Parameters<typeof planSubmitShortcut>[0];
type State = Parameters<typeof planSubmitShortcut>[1];

const ev = (over: Partial<Ev> = {}): Ev => ({
  key: "Enter",
  metaKey: true,
  ctrlKey: false,
  defaultPrevented: false,
  ...over,
});

const state = (over: Partial<State> = {}): State => ({
  hasEnabledSubmit: true,
  activeIsEditor: false,
  ...over,
});

describe("planSubmitShortcut", () => {
  it("clique le bouton principal sur ⌘Entrée comme sur Ctrl+Entrée", () => {
    expect(planSubmitShortcut(ev(), state())).toBe("click");
    expect(
      planSubmitShortcut(ev({ metaKey: false, ctrlKey: true }), state())
    ).toBe("click");
  });

  it("laisse passer Entrée seule — c'est la touche qui fait respirer", () => {
    expect(planSubmitShortcut(ev({ metaKey: false }), state())).toBe("ignore");
  });

  it("laisse passer une autre touche modifiée", () => {
    expect(planSubmitShortcut(ev({ key: "k" }), state())).toBe("ignore");
  });

  it("ne fait rien quand le bouton est grisé — le clavier ne double pas la souris", () => {
    expect(planSubmitShortcut(ev(), state({ hasEnabledSubmit: false }))).toBe(
      "ignore"
    );
  });

  it("ne confisque pas la frappe déjà traitée en amont", () => {
    expect(planSubmitShortcut(ev({ defaultPrevented: true }), state())).toBe(
      "ignore"
    );
  });

  it("sort de l'éditeur AVANT de cliquer : sinon la description partirait vide", () => {
    expect(planSubmitShortcut(ev(), state({ activeIsEditor: true }))).toBe(
      "blur-then-click"
    );
  });

  it("mais seulement s'il y a quelque chose à créer", () => {
    expect(
      planSubmitShortcut(
        ev(),
        state({ activeIsEditor: true, hasEnabledSubmit: false })
      )
    ).toBe("ignore");
  });
});
