import { describe, it, expect } from "vitest";
import { mentionProjectLookup, mentionTargetPath } from "@/lib/mention-target";

const P = "11111111-1111-1111-1111-111111111111";

describe("mentionTargetPath", () => {
  it("mène un ticket, un objectif et une page sur les mêmes écrans qu'une notification", () => {
    // Mêmes URL que lib/notification-target.ts : deux entrées, un seul écran.
    expect(mentionTargetPath("issue", "i1", P)).toBe(`/projects/${P}?issue=i1`);
    expect(mentionTargetPath("objective", "o1", P)).toBe(
      `/projects/${P}/objectives?open=o1`,
    );
    expect(mentionTargetPath("page", "pg1", P)).toBe(
      `/projects/${P}/pages/pg1`,
    );
  });

  it("mène un projet sur lui-même, sans rien à résoudre", () => {
    expect(mentionTargetPath("project", P)).toBe(`/projects/${P}`);
    // Et même si l'appelant lui donne un projet de contexte : c'est son id à lui
    // qui fait l'adresse.
    expect(mentionTargetPath("project", P, "autre")).toBe(`/projects/${P}`);
  });

  it("ne mène nulle part pour une personne, Numo ou un compte de forge", () => {
    // La règle de l'énoncé : cliquer une PERSONNE ne navigue pas — minddy n'a
    // pas de page de profil, et une pilule qui se clique sans rien ouvrir ment.
    expect(mentionTargetPath("member", "u1", P)).toBeNull();
    expect(mentionTargetPath("numo", "__numo__", P)).toBeNull();
    expect(mentionTargetPath("forge", "octocat", P)).toBeNull();
  });

  it("ne fabrique pas d'URL sans projet", () => {
    // Le cas réel : l'index de la palette n'est pas encore arrivé, ou le ticket
    // cité appartient à un projet qu'on a quitté. La pilule reste du texte.
    expect(mentionTargetPath("issue", "i1", null)).toBeNull();
    expect(mentionTargetPath("objective", "o1", undefined)).toBeNull();
    expect(mentionTargetPath("page", "pg1")).toBeNull();
  });
});

describe("mentionProjectLookup", () => {
  const projectOf = mentionProjectLookup({
    issues: [{ id: "shared", project_id: "p-issue" }],
    objectives: [{ id: "o1", project_id: "p-objective" }],
    pages: [{ id: "shared", project_id: "p-page" }],
  });

  it("retrouve le projet par TYPE et id, sans confondre deux natures", () => {
    // Un même id porté par deux entités de types différents : la clé est
    // composée, donc chacune garde son projet.
    expect(projectOf("issue", "shared")).toBe("p-issue");
    expect(projectOf("page", "shared")).toBe("p-page");
    expect(projectOf("objective", "o1")).toBe("p-objective");
  });

  it("rend undefined pour ce qu'il ne connaît pas", () => {
    expect(projectOf("issue", "inconnu")).toBeUndefined();
    expect(projectOf("member", "u1")).toBeUndefined();
  });

  it("compose avec le chemin : un élément inconnu ne se clique pas", () => {
    expect(
      mentionTargetPath("issue", "inconnu", projectOf("issue", "inconnu")),
    ).toBeNull();
    expect(
      mentionTargetPath("issue", "shared", projectOf("issue", "shared")),
    ).toBe("/projects/p-issue?issue=shared");
  });
});
