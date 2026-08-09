import { describe, expect, it } from "vitest";
import { matchesModCombo, matchesModShiftCombo } from "@/lib/keyboard/mod-combo";

type Ev = Parameters<typeof matchesModCombo>[0];

function ev(over: Partial<Ev> = {}): Ev {
  return {
    key: "o",
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  };
}

describe("matchesModCombo", () => {
  it("accepte ⌘ comme Ctrl — la même combinaison des deux côtés", () => {
    expect(matchesModCombo(ev({ metaKey: true }), "o")).toBe(true);
    expect(matchesModCombo(ev({ ctrlKey: true }), "o")).toBe(true);
  });

  it("est insensible à la casse : ⌘O est tapé en majuscule", () => {
    expect(matchesModCombo(ev({ metaKey: true, key: "O" }), "o")).toBe(true);
  });

  it("refuse la lettre nue — sinon on l'écrirait dans un champ", () => {
    expect(matchesModCombo(ev(), "o")).toBe(false);
  });

  it("refuse tout modificateur EN PLUS : ⌘⇧O et ⌥⌘O sont d'autres raccourcis", () => {
    expect(matchesModCombo(ev({ metaKey: true, shiftKey: true }), "o")).toBe(false);
    expect(matchesModCombo(ev({ metaKey: true, altKey: true }), "o")).toBe(false);
  });

  it("refuse une autre lettre", () => {
    expect(matchesModCombo(ev({ metaKey: true, key: "p" }), "o")).toBe(false);
  });

  it("refuse la répétition : garder la touche ne navigue pas dix fois", () => {
    expect(matchesModCombo(ev({ metaKey: true, repeat: true }), "o")).toBe(false);
  });

  it("survit à un keydown synthétique sans `key`", () => {
    const bare = { repeat: false, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as Ev;
    expect(matchesModCombo(bare, "o")).toBe(false);
  });
});

describe("matchesModShiftCombo", () => {
  it("accepte ⌘⇧D comme Ctrl⇧D — la même combinaison des deux côtés", () => {
    expect(matchesModShiftCombo(ev({ metaKey: true, shiftKey: true, key: "d" }), "d")).toBe(true);
    expect(matchesModShiftCombo(ev({ ctrlKey: true, shiftKey: true, key: "D" }), "d")).toBe(true);
  });

  it("EXIGE ⇧ : ⌘D est le signet du navigateur, pas la dictée", () => {
    expect(matchesModShiftCombo(ev({ metaKey: true, key: "d" }), "d")).toBe(false);
  });

  it("refuse ⌥ en plus, et la lettre nue", () => {
    expect(
      matchesModShiftCombo(ev({ metaKey: true, shiftKey: true, altKey: true, key: "d" }), "d")
    ).toBe(false);
    expect(matchesModShiftCombo(ev({ shiftKey: true, key: "d" }), "d")).toBe(false);
  });

  it("refuse une autre lettre et la répétition", () => {
    expect(matchesModShiftCombo(ev({ metaKey: true, shiftKey: true, key: "p" }), "d")).toBe(false);
    expect(
      matchesModShiftCombo(ev({ metaKey: true, shiftKey: true, repeat: true, key: "d" }), "d")
    ).toBe(false);
  });

  it("survit à un keydown synthétique sans `key`", () => {
    const bare = { repeat: false, metaKey: true, ctrlKey: false, shiftKey: true, altKey: false } as Ev;
    expect(matchesModShiftCombo(bare, "d")).toBe(false);
  });
});
