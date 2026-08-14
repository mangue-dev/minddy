import { describe, expect, it } from "vitest";
import {
  draftIconUrl,
  draftOrbSeed,
  projectDraftFromRow,
  projectDraftToRow,
  stepIndexOf,
  stepsFor,
  type ProjectDraftInput,
} from "./project-draft";

const draft: ProjectDraftInput = {
  id: "11111111-1111-4111-8111-111111111111",
  orbSeed: null,
  name: "Comète",
  key: "COM",
  keyTouched: true,
  step: "git",
  origin: "new",
  seed: { kind: "brief", text: "un board pour l'équipe" },
  icon: { kind: "site", previewUrl: "https://x.test/f.png", siteUrl: "https://x.test" },
  repo: {
    connectionId: "c1",
    provider: "github",
    externalRepoId: "42",
    fullName: "mangue-dev/comete",
  },
  smartAssignEnabled: false,
  autoAssignEnabled: true,
};

/** Ce que la route renvoie pour ce brouillon-là. */
const rowFor = (input: ProjectDraftInput) => ({
  ...projectDraftToRow(input),
  updated_at: "2026-08-04T10:00:00Z",
});

describe("projectDraftFromRow / projectDraftToRow", () => {
  it("rend exactement ce qui a été enregistré", () => {
    // Le contrat de la table : deux colonnes lues (name, step), tout le reste en
    // jsonb. Un champ qui n'y entre pas est un champ que la reprise perd — sans
    // rien signaler, puisque le wizard rouvre quand même.
    const back = projectDraftFromRow(rowFor(draft));
    expect(back).toEqual({ ...draft, updatedAt: "2026-08-04T10:00:00Z" });
  });

  it("retombe sur des défauts tenables quand `data` est vide", () => {
    // Un brouillon écrit par une version précédente du wizard : le projet vaut
    // mieux sans icône ni amorce qu'un wizard qui plante en le rouvrant.
    const back = projectDraftFromRow({
      id: draft.id,
      name: "Comète",
      step: "icon",
      data: {},
      updated_at: "2026-08-04T10:00:00Z",
    });
    expect(back.key).toBe("");
    expect(back.origin).toBeNull();
    expect(back.seed).toBeNull();
    expect(back.icon).toEqual({ kind: "none" });
    expect(back.repo).toBeNull();
    // Jamais relancée : l'orbe du brouillon reste celle de son id, et le projet
    // créé gardera la même — c'est l'aperçu du wizard qui l'a promis.
    expect(back.orbSeed).toBeNull();
    // Smart Assign est proposé ACTIVÉ par le wizard : un brouillon muet doit
    // retomber sur ce défaut-là, pas sur `false`.
    expect(back.smartAssignEnabled).toBe(true);
    expect(back.autoAssignEnabled).toBe(false);
  });

  it("refuse une étape qu'elle ne connaît pas", () => {
    const back = projectDraftFromRow({
      ...rowFor(draft),
      step: "une-étape-supprimée-depuis",
    });
    expect(back.step).toBe("project");
  });

  it("jette un dépôt à moitié écrit plutôt que de le rejouer", () => {
    // Un `repo` incomplet mènerait à un `bindGitRepoApi` sans id de connexion,
    // après la création du projet — l'endroit exact où l'on ne veut pas d'échec.
    const back = projectDraftFromRow({
      ...rowFor(draft),
      data: { ...projectDraftToRow(draft).data, repo: { fullName: "x/y" } },
    });
    expect(back.repo).toBeNull();
  });
});

describe("stepIndexOf", () => {
  it("rouvre à l'étape enregistrée", () => {
    expect(stepIndexOf({ ...draft, step: "seed", updatedAt: "" })).toBe(
      stepsFor("new").indexOf("seed"),
    );
  });

  it("retombe au début quand l'étape n'est pas dans ce parcours", () => {
    // Sans origine, l'amorce n'existe pas : un `indexOf` nu rendrait -1, et le
    // wizard rouvrirait sur la dernière étape (borne haute de `WizardDialog`).
    expect(stepIndexOf({ ...draft, origin: null, step: "seed", updatedAt: "" })).toBe(0);
  });
});

describe("draftIconUrl", () => {
  it("rend l'aperçu choisi, ou rien", () => {
    expect(draftIconUrl({ ...draft, updatedAt: "" })).toBe("https://x.test/f.png");
    expect(
      draftIconUrl({ ...draft, icon: { kind: "none" }, updatedAt: "" }),
    ).toBeNull();
  });
});

describe("draftOrbSeed", () => {
  it("retombe sur l'id du brouillon tant que le tirage n'a pas été relancé", () => {
    expect(draftOrbSeed({ ...draft, updatedAt: "" })).toBe(draft.id);
  });

  it("prend la graine relancée, et la fait survivre à un aller-retour en base", () => {
    // Le point du test : le wizard montre une orbe AVANT que le projet existe.
    // Si la graine ne traverse pas la table des brouillons, reprendre le
    // brouillon rendrait une autre couleur que celle qu'on avait choisie.
    const rerolled = { ...draft, orbSeed: "33333333-3333-4333-8333-333333333333" };
    expect(draftOrbSeed({ ...rerolled, updatedAt: "" })).toBe(rerolled.orbSeed);
    expect(projectDraftFromRow(rowFor(rerolled)).orbSeed).toBe(rerolled.orbSeed);
  });
});
