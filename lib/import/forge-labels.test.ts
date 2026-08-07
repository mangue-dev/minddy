import { describe, expect, it } from "vitest";
import { readForgeLabel, readForgeLabels } from "./forge-labels";

// Les règles qui tirent une priorité et un effort des LABELS d'une issue de
// forge. Module pur — c'est ici que se vérifie ce qu'on ose deviner, et
// surtout ce qu'on refuse de deviner.

describe("readForgeLabel — le label nomme son champ", () => {
  it("lit les conventions de priorité les plus répandues", () => {
    for (const label of [
      "priority: high",
      "priority/high",
      "priority=high",
      "Priority High",
      "high priority",
      "prio: high",
      "priorité : haute",
      "importance: major",
    ]) {
      expect(readForgeLabel(label), label).toEqual({
        field: "priority",
        value: "high",
      });
    }
  });

  it("lit une priorité chiffrée sur l'échelle P (0 = le plus urgent)", () => {
    expect(readForgeLabel("priority: 0")).toEqual({ field: "priority", value: "urgent" });
    expect(readForgeLabel("priority: 1")).toEqual({ field: "priority", value: "high" });
    expect(readForgeLabel("priority: 2")).toEqual({ field: "priority", value: "medium" });
    expect(readForgeLabel("priority: 3")).toEqual({ field: "priority", value: "low" });
    expect(readForgeLabel("priority: 7")).toEqual({ field: "priority", value: "low" });
  });

  it("DÉCALE l'échelle de sévérité : SEV1 est le plus grave, pas P1", () => {
    expect(readForgeLabel("sev1")).toEqual({ field: "priority", value: "urgent" });
    expect(readForgeLabel("severity: 2")).toEqual({ field: "priority", value: "high" });
    expect(readForgeLabel("p1")).toEqual({ field: "priority", value: "high" });
    expect(readForgeLabel("p0")).toEqual({ field: "priority", value: "urgent" });
  });

  it("lit les tailles en t-shirt et en toutes lettres", () => {
    expect(readForgeLabel("size: M")).toEqual({ field: "effort", value: "m" });
    expect(readForgeLabel("size/XL")).toEqual({ field: "effort", value: "xl" });
    expect(readForgeLabel("effort: small")).toEqual({ field: "effort", value: "s" });
    expect(readForgeLabel("taille : moyenne")).toEqual({ field: "effort", value: "m" });
    expect(readForgeLabel("complexity: huge")).toEqual({ field: "effort", value: "xl" });
  });

  it("convertit une estimation chiffrée en taille", () => {
    expect(readForgeLabel("sp: 1")).toEqual({ field: "effort", value: "xs" });
    expect(readForgeLabel("3 story points")).toEqual({ field: "effort", value: "m" });
    expect(readForgeLabel("points: 5")).toEqual({ field: "effort", value: "l" });
    expect(readForgeLabel("estimate: 13")).toEqual({ field: "effort", value: "xl" });
  });
});

describe("readForgeLabel — label nu", () => {
  it("accepte ce qui n'appartient qu'à un seul champ", () => {
    expect(readForgeLabel("critical")).toEqual({ field: "priority", value: "urgent" });
    expect(readForgeLabel("blocker")).toEqual({ field: "priority", value: "urgent" });
    expect(readForgeLabel("urgent")).toEqual({ field: "priority", value: "urgent" });
    expect(readForgeLabel("minor")).toEqual({ field: "priority", value: "low" });
    expect(readForgeLabel("small")).toEqual({ field: "effort", value: "s" });
    expect(readForgeLabel("XS")).toEqual({ field: "effort", value: "xs" });
  });

  it("REFUSE un mot qui vaut deux champs à la fois", () => {
    // « medium » est une priorité ET une taille : nu, il ne vaut rien.
    expect(readForgeLabel("medium")).toBeNull();
    expect(readForgeLabel("moyenne")).toBeNull();
    // Mais nommé, il n'est plus ambigu du tout.
    expect(readForgeLabel("size: medium")).toEqual({ field: "effort", value: "m" });
    expect(readForgeLabel("priority: medium")).toEqual({
      field: "priority",
      value: "medium",
    });
  });

  it("ne lit rien dans un label ordinaire", () => {
    for (const label of ["bug", "documentation", "good first issue", "frontend", ""]) {
      expect(readForgeLabel(label), label).toBeNull();
    }
  });

  it("ne lit rien dans un champ nommé sans valeur lisible", () => {
    expect(readForgeLabel("priority")).toBeNull();
    expect(readForgeLabel("priority: à trancher")).toBeNull();
    expect(readForgeLabel("size")).toBeNull();
  });
});

describe("readForgeLabels", () => {
  it("répartit les labels d'une issue entre les trois champs", () => {
    expect(readForgeLabels(["bug", "P1", "size: L", "frontend"])).toEqual({
      priority: "high",
      effort: "l",
      labels: ["bug", "frontend"],
    });
  });

  it("laisse la priorité à none et l'effort à null quand rien ne se lit", () => {
    expect(readForgeLabels(["bug", "help wanted"])).toEqual({
      priority: "none",
      effort: null,
      labels: ["bug", "help wanted"],
    });
    expect(readForgeLabels([])).toEqual({ priority: "none", effort: null, labels: [] });
  });

  it("départage sans dépendre de l'ORDRE des labels — la forge ne le garantit pas", () => {
    const both = ["priority: low", "critical", "size: S", "size: XL"];
    const expected = { priority: "urgent", effort: "xl", labels: [] };
    expect(readForgeLabels(both)).toEqual(expected);
    expect(readForgeLabels([...both].reverse())).toEqual(expected);
  });

  it("dédoublonne les catégories sans perdre la casse d'origine", () => {
    expect(readForgeLabels(["Bug", "bug", "BUG", "back-end", "back end"])).toEqual({
      priority: "none",
      effort: null,
      labels: ["Bug", "back-end"],
    });
  });
});
