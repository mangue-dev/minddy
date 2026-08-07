import { describe, expect, it } from "vitest";

import { notificationTargetPath } from "@/lib/notification-target";
import { showsNotificationTarget } from "./dismiss";

const P = "11111111-1111-1111-1111-111111111111";

/**
 * Une cible de chaque sorte, en DEUX exemplaires : c'est le seul moyen de
 * vérifier que le paramètre qui les distingue est bien pris en compte. Un
 * paramètre oublié dans `NOTIFICATION_TARGET_PARAMS` ne se voit pas autrement —
 * les deux chemins ne diffèrent que par lui, et tout le reste (le chemin, les
 * autres paramètres) matcherait encore.
 */
const KINDS = [
  {
    name: "ticket",
    a: notificationTargetPath({ project_id: P, issue_id: "iss-a" })!,
    b: notificationTargetPath({ project_id: P, issue_id: "iss-b" })!,
  },
  {
    name: "objectif",
    a: notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj-a" })!,
    b: notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj-b" })!,
  },
  {
    name: "retour du board",
    a: notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp-a" })!,
    b: notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp-b" })!,
  },
  {
    name: "routine",
    a: notificationTargetPath({ project_id: null, issue_id: null, routine_id: "rt-a" })!,
    b: notificationTargetPath({ project_id: null, issue_id: null, routine_id: "rt-b" })!,
  },
  {
    name: "pull request",
    a: notificationTargetPath({ project_id: null, issue_id: null, pull_request_id: "pr-a" })!,
    b: notificationTargetPath({ project_id: null, issue_id: null, pull_request_id: "pr-b" })!,
  },
];

describe("showsNotificationTarget", () => {
  it.each(KINDS)("reconnaît sa propre page ($name)", ({ a }) => {
    expect(showsNotificationTarget(a, a)).toBe(true);
  });

  // LE test de ce module. Sans le paramètre identifiant, arriver sur une
  // routine refermerait les notifications de toutes les autres.
  it.each(KINDS)("ne confond pas deux cibles de même sorte ($name)", ({ a, b }) => {
    expect(showsNotificationTarget(a, b)).toBe(false);
    expect(showsNotificationTarget(b, a)).toBe(false);
  });

  it("ne confond pas deux sortes de cibles entre elles", () => {
    for (const kind of KINDS) {
      for (const other of KINDS) {
        if (other === kind) continue;
        expect(showsNotificationTarget(kind.a, other.a), `${kind.name} ≠ ${other.name}`)
          .toBe(false);
      }
    }
  });

  it("ignore les paramètres qui ne désignent pas la cible", () => {
    const target = `/projects/${P}?issue=iss`;
    expect(showsNotificationTarget(`${target}&view=board&group=status`, target)).toBe(
      true
    );
    // Et dans l'autre sens : `tab=routines` décore l'écran d'une routine, il ne
    // l'identifie pas — un `/agents` sans onglet explicite affiche la même chose.
    expect(
      showsNotificationTarget("/agents?routine=rt-a", "/agents?tab=routines&routine=rt-a")
    ).toBe(true);
  });

  // L'asymétrie voulue : le board qui CONTIENT le ticket n'est pas la page du
  // ticket. Refermer la notification là serait la perdre avant de l'avoir lue.
  it("ne referme pas depuis le board quand le ticket n'est pas ouvert", () => {
    expect(showsNotificationTarget(`/projects/${P}`, `/projects/${P}?issue=iss`)).toBe(
      false
    );
  });

  it("tient la barre oblique finale pour du décor", () => {
    expect(showsNotificationTarget("/inbox/", "/inbox")).toBe(true);
    expect(showsNotificationTarget("/inbox", "/inbox/")).toBe(true);
  });

  it("ne matche pas un autre projet", () => {
    const other = "22222222-2222-2222-2222-222222222222";
    expect(
      showsNotificationTarget(`/projects/${other}?issue=iss`, `/projects/${P}?issue=iss`)
    ).toBe(false);
  });

  it("rend false sur une URL illisible plutôt que de lever", () => {
    expect(showsNotificationTarget("/inbox", "http://")).toBe(false);
  });
});
