import { describe, expect, it } from "vitest";

import { notificationTargetPath, NOTIFICATION_LINE_KEYS } from "./notification-target";
import en from "@/messages/en.json";

const P = "11111111-1111-1111-1111-111111111111";

describe("notificationTargetPath", () => {
  it("ouvre l'objectif quand la ligne en porte un", () => {
    expect(
      notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj" })
    ).toBe(`/projects/${P}/objectives?open=obj`);
  });

  it("ouvre le retour du board quand la ligne en porte un", () => {
    expect(
      notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp" })
    ).toBe(`/projects/${P}/feedback?post=fp`);
  });

  it("ouvre le ticket dans son board", () => {
    expect(notificationTargetPath({ project_id: P, issue_id: "iss" })).toBe(
      `/projects/${P}?issue=iss`
    );
  });

  // L'ordre de priorité est le contrat : une ligne d'objectif qui traîne un
  // `issue_id` de contexte doit ouvrir l'OBJECTIF, pas le ticket.
  it("fait passer l'objectif avant le retour, et le retour avant le ticket", () => {
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: "iss",
        objective_id: "obj",
        feedback_post_id: "fp",
      })
    ).toBe(`/projects/${P}/objectives?open=obj`);
    expect(
      notificationTargetPath({ project_id: P, issue_id: "iss", feedback_post_id: "fp" })
    ).toBe(`/projects/${P}/feedback?post=fp`);
  });

  // MIN-278 : la page a sa propre route, et son BLOC est un fragment — il ne
  // part pas au serveur, ne casse aucune route, et c'est déjà la forme des
  // liens de bloc (`blockLink`). Sans lui, le clic ouvre un document de trois
  // écrans en tête, sur une citation posée au milieu.
  it("ouvre la page, et son bloc quand la citation en désigne un", () => {
    expect(notificationTargetPath({ project_id: P, issue_id: null, page_id: "pg" })).toBe(
      `/projects/${P}/pages/pg`
    );
    expect(
      notificationTargetPath({
        project_id: P,
        issue_id: null,
        page_id: "pg",
        block_id: "b2",
      })
    ).toBe(`/projects/${P}/pages/pg#b2`);
  });

  it("ne mène nulle part sans projet, ni sans cible", () => {
    expect(notificationTargetPath({ project_id: null, issue_id: "iss" })).toBeNull();
    expect(notificationTargetPath({ project_id: P, issue_id: null })).toBeNull();
  });
});

describe("NOTIFICATION_LINE_KEYS", () => {
  // Le typage `MessageKey<"Inbox">` tient déjà la promesse à la compilation ;
  // ce test la tient aussi au build d'un catalogue amputé à la main.
  it("pointe sur des clés qui existent vraiment dans le namespace Inbox", () => {
    for (const key of Object.values(NOTIFICATION_LINE_KEYS)) {
      expect(en.Inbox, `Inbox.${key}`).toHaveProperty(key);
    }
  });
});
