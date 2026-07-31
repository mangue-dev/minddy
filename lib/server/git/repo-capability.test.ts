import { describe, expect, it } from "vitest";
import {
  githubCapabilityFromRepo,
  gitlabCapabilityFromProject,
} from "./repo-capability";

/**
 * Le droit d'un compte git sur un dépôt (MIN-144), lu sur les charges RÉELLES
 * des deux forges. C'est ce verdict qui décide si minddy offre « Fusionner » ou
 * explique pourquoi il ne l'offre pas — se tromper ici, c'est soit un bouton qui
 * échoue en 403, soit un geste retiré à quelqu'un qui y avait droit.
 */

describe("githubCapabilityFromRepo", () => {
  it("donne write à qui peut pousser", () => {
    expect(
      githubCapabilityFromRepo({
        full_name: "acme/app",
        permissions: { admin: false, maintain: false, push: true, triage: true, pull: true },
      }),
    ).toBe("write");
  });

  it("donne write à un admin (un owner d'org n'a pas toujours push explicite)", () => {
    expect(
      githubCapabilityFromRepo({ permissions: { admin: true, push: false, pull: true } }),
    ).toBe("write");
  });

  it("donne read sur un dépôt public sans droit d'écriture", () => {
    expect(
      githubCapabilityFromRepo({
        permissions: { admin: false, maintain: false, push: false, triage: false, pull: true },
      }),
    ).toBe("read");
  });

  it("ne promeut pas à write quand `permissions` manque", () => {
    expect(githubCapabilityFromRepo({ full_name: "acme/app" })).toBe("read");
    expect(githubCapabilityFromRepo(null)).toBe("read");
    // Un 404 ne passe jamais par ici (l'appelant tranche avant), mais son corps
    // ne doit surtout pas se lire comme un droit.
    expect(githubCapabilityFromRepo({ message: "Not Found" })).toBe("read");
  });
});

describe("gitlabCapabilityFromProject", () => {
  it("donne write à un Developer (30)", () => {
    expect(
      gitlabCapabilityFromProject({
        id: 42,
        permissions: { project_access: { access_level: 30 }, group_access: null },
      }),
    ).toBe("write");
  });

  it("donne write à un Maintainer (40)", () => {
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: { access_level: 40 }, group_access: null },
      }),
    ).toBe("write");
  });

  it("donne read à un Reporter (20)", () => {
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: { access_level: 20 }, group_access: null },
      }),
    ).toBe("read");
  });

  it("prend le MAX du projet et du groupe", () => {
    // Cas courant : Maintainer du groupe, aucun accès direct au projet.
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: null, group_access: { access_level: 40 } },
      }),
    ).toBe("write");
    expect(
      gitlabCapabilityFromProject({
        permissions: {
          project_access: { access_level: 20 },
          group_access: { access_level: 30 },
        },
      }),
    ).toBe("write");
  });

  it("donne read quand `permissions` est absent ou vide (projet public)", () => {
    expect(gitlabCapabilityFromProject({ id: 42 })).toBe("read");
    expect(
      gitlabCapabilityFromProject({
        permissions: { project_access: null, group_access: null },
      }),
    ).toBe("read");
    expect(gitlabCapabilityFromProject(null)).toBe("read");
  });
});
