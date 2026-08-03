import { describe, expect, it } from "vitest";
import {
  sanitizeSeedProposal,
  seedProposalToImportedIssues,
} from "@/lib/server/seed-issues";
import {
  MAX_SEED_DISTINCT_LABELS,
  MAX_SEED_ISSUES,
  MAX_SEED_LABELS,
  MAX_SEED_OBJECTIVES,
} from "@/lib/seed/types";

/**
 * La porte de l'amorce par brief : ce qui vient du navigateur n'est jamais cru.
 *
 * L'aperçu est modifiable, donc le corps du commit est fabriqué par un onglet
 * qu'on ne contrôle pas. Ces tests décrivent ce qui passe et ce qui tombe —
 * une entrée mal formée est écartée SEULE, jamais au prix du lot.
 */

const issue = (over: Record<string, unknown> = {}) => ({
  key: "T1",
  title: "Poser le schéma",
  description: "Tables, index, RLS.",
  objectiveKey: "",
  priority: "high",
  effort: "m",
  parentKey: "",
  labels: [],
  ...over,
});

describe("sanitizeSeedProposal", () => {
  it("garde un lot bien formé tel quel", () => {
    const result = sanitizeSeedProposal({
      objectives: [{ key: "O1", name: "Fondations", summary: "Le socle." }],
      issues: [issue({ objectiveKey: "O1" })],
    });
    expect(result.objectives).toEqual([
      { key: "O1", name: "Fondations", summary: "Le socle." },
    ]);
    expect(result.issues[0]).toMatchObject({
      key: "T1",
      title: "Poser le schéma",
      objectiveKey: "O1",
      priority: "high",
      effort: "m",
    });
  });

  it("ramène une énumération inconnue à sa valeur sûre", () => {
    const [only] = sanitizeSeedProposal({
      objectives: [],
      issues: [issue({ priority: "URGENT!!", effort: "gigantesque" })],
    }).issues;
    expect(only.priority).toBe("none");
    expect(only.effort).toBeNull();
  });

  it("lâche une clé d'objectif qui ne désigne rien du lot", () => {
    const [only] = sanitizeSeedProposal({
      objectives: [{ key: "O1", name: "Fondations", summary: "" }],
      issues: [issue({ objectiveKey: "O9" })],
    }).issues;
    expect(only.objectiveKey).toBe("");
  });

  it("lâche un parent fantôme, et le renvoi sur soi-même", () => {
    const { issues } = sanitizeSeedProposal({
      objectives: [],
      issues: [
        issue({ key: "T1", parentKey: "T404" }),
        issue({ key: "T2", parentKey: "T2" }),
      ],
    });
    expect(issues.map((i) => i.parentKey)).toEqual(["", ""]);
  });

  it("aplatit un petit-enfant : un seul niveau de sous-ticket", () => {
    const { issues } = sanitizeSeedProposal({
      objectives: [],
      issues: [
        issue({ key: "T1" }),
        issue({ key: "T2", parentKey: "T1" }),
        issue({ key: "T3", parentKey: "T2" }),
      ],
    });
    expect(issues.map((i) => i.parentKey)).toEqual(["", "T1", ""]);
  });

  it("tronque un titre de 500 caractères au plafond des imports", () => {
    const [only] = sanitizeSeedProposal({
      objectives: [],
      issues: [issue({ title: "a".repeat(900) })],
    }).issues;
    expect(only.title).toHaveLength(500);
  });

  it("écarte un ticket sans titre ou sans clé sans perdre les autres", () => {
    const { issues } = sanitizeSeedProposal({
      objectives: [],
      issues: [
        issue({ key: "T1", title: "   " }),
        issue({ key: "", title: "Sans clé" }),
        issue({ key: "T3", title: "Le survivant" }),
        "pas un objet",
        null,
      ],
    });
    expect(issues.map((i) => i.key)).toEqual(["T3"]);
  });

  it("ne garde qu'un ticket par clé — un doublon écraserait la résolution des parents", () => {
    const { issues } = sanitizeSeedProposal({
      objectives: [],
      issues: [
        issue({ key: "T1", title: "Le premier" }),
        issue({ key: "t1", title: "Le clone" }),
        issue({ key: "T2", parentKey: "T1" }),
      ],
    });
    expect(issues.map((i) => i.title)).toEqual(["Le premier", "Poser le schéma"]);
    expect(issues[1].parentKey).toBe("T1");
  });

  it("coupe un lot au-delà du plafond", () => {
    const { objectives, issues } = sanitizeSeedProposal({
      objectives: Array.from({ length: MAX_SEED_OBJECTIVES + 5 }, (_, i) => ({
        key: `O${i}`,
        name: `Chantier ${i}`,
        summary: "",
      })),
      issues: Array.from({ length: MAX_SEED_ISSUES + 40 }, (_, i) =>
        issue({ key: `T${i}` })
      ),
    });
    expect(objectives).toHaveLength(MAX_SEED_OBJECTIVES);
    expect(issues).toHaveLength(MAX_SEED_ISSUES);
  });

  it("borne et dédoublonne les étiquettes d'un ticket", () => {
    const [only] = sanitizeSeedProposal({
      objectives: [],
      issues: [issue({ labels: ["Backend", "backend", "", 42, "UI", "API", "Infra", "Perf"] })],
    }).issues;
    expect(only.labels).toEqual(["Backend", "UI", "API", "Infra"].slice(0, MAX_SEED_LABELS));
  });

  it("ne garde du lot que les étiquettes les plus portées", () => {
    // Trois étiquettes partagées par tous, huit portées une seule fois : c'est
    // la forme mesurée sur un vrai brief, et ce sont ces huit-là qui feraient
    // d'un projet neuf un projet déjà encombré.
    const shared = ["auth", "schema", "parents"];
    const { issues } = sanitizeSeedProposal({
      objectives: [],
      issues: Array.from({ length: 8 }, (_, i) =>
        issue({ key: `T${i}`, labels: [...shared, `unique-${i}`] })
      ),
    });
    const distinct = [...new Set(issues.flatMap((i) => i.labels))];
    expect(distinct).toHaveLength(MAX_SEED_DISTINCT_LABELS);
    // Les partagées passent d'abord — les rescapées uniques suivent l'ordre
    // d'apparition, donc le résultat est stable.
    expect(distinct.slice(0, 3).sort()).toEqual([...shared].sort());
  });

  it("laisse un lot déjà sobre intact", () => {
    const { issues } = sanitizeSeedProposal({
      objectives: [],
      issues: [
        issue({ key: "T1", labels: ["auth"] }),
        issue({ key: "T2", labels: ["schema"] }),
      ],
    });
    expect(issues.map((i) => i.labels)).toEqual([["auth"], ["schema"]]);
  });

  it("ne lève sur rien du tout", () => {
    expect(sanitizeSeedProposal(null)).toEqual({ objectives: [], issues: [] });
    expect(sanitizeSeedProposal("un brief")).toEqual({ objectives: [], issues: [] });
    expect(sanitizeSeedProposal({ issues: "non" })).toEqual({ objectives: [], issues: [] });
  });
});

describe("seedProposalToImportedIssues", () => {
  it("écrit en backlog, avec la clé du lot comme clé externe", () => {
    const proposal = sanitizeSeedProposal({
      objectives: [{ key: "O1", name: "Fondations", summary: "" }],
      issues: [
        issue({ key: "T1", objectiveKey: "O1" }),
        issue({ key: "T2", parentKey: "T1", labels: ["infra"] }),
      ],
    });
    const rows = seedProposalToImportedIssues(
      proposal,
      new Map([["O1", "11111111-1111-4111-8111-111111111111"]])
    );
    expect(rows[0]).toMatchObject({
      status: "backlog",
      externalKeys: ["T1"],
      parentExternalKey: null,
      objectiveId: "11111111-1111-4111-8111-111111111111",
      assigneeId: null,
      dueDate: null,
    });
    expect(rows[1]).toMatchObject({
      externalKeys: ["T2"],
      parentExternalKey: "T1",
      labels: ["infra"],
      // Ce ticket-là ne cite aucun chantier : il existe sans objectif.
      objectiveId: null,
    });
  });

  it("laisse un ticket sans objectif quand l'objectif n'a pas été créé", () => {
    const proposal = sanitizeSeedProposal({
      objectives: [{ key: "O1", name: "Fondations", summary: "" }],
      issues: [issue({ objectiveKey: "O1" })],
    });
    expect(seedProposalToImportedIssues(proposal, new Map())[0].objectiveId).toBeNull();
  });

  it("rend une description vide comme absente", () => {
    const proposal = sanitizeSeedProposal({
      objectives: [],
      issues: [issue({ description: "   " })],
    });
    expect(seedProposalToImportedIssues(proposal, new Map())[0].description).toBeNull();
  });
});
