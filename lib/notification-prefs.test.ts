import { describe, expect, it } from "vitest";

import {
  categoryOfNotification,
  categoryOfNotificationType,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META_KEYS,
  resolveNotificationPrefs,
} from "./notification-prefs";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Les deux contrats d'une bascule d'inbox, dont aucun ne se voit en essayant
 * l'app : la ligne doit tomber sous la bonne catégorie, et la catégorie doit
 * avoir de quoi se dire à l'écran.
 */

describe("categoryOfNotification", () => {
  it("range une notification de ROUTINE sous « routine », quel que soit son type", () => {
    // Le piège : une routine annonce ses fins d'exécution avec les types de
    // l'agent. Sur le type seul, couper « Routines » aurait laissé passer
    // l'échec du lendemain matin.
    expect(categoryOfNotification({ type: "agent_failed", routine_id: "r1" })).toBe("routine");
    expect(categoryOfNotification({ type: "agent_done", routine_id: "r1" })).toBe("routine");
    expect(categoryOfNotification({ type: "routine_done" })).toBe("routine");

    // Le même type sans routine reste un run lancé à la main.
    expect(categoryOfNotification({ type: "agent_failed" })).toBe("agent");
    expect(categoryOfNotification({ type: "agent_done", routine_id: null })).toBe("agent");
  });

  it("range toute la vie d'une pull request sous une seule bascule", () => {
    for (const type of ["pr_opened", "pr_reviewed", "pr_merged"] as const) {
      expect(categoryOfNotificationType(type)).toBe("pullRequest");
    }
  });
});

describe("resolveNotificationPrefs", () => {
  it("tout est allumé sur un compte qui n'a rien touché", () => {
    const prefs = resolveNotificationPrefs(null);
    for (const category of NOTIFICATION_CATEGORIES) expect(prefs[category]).toBe(true);
  });

  it("seul un `false` explicite coupe, et il ne coupe que sa catégorie", () => {
    const prefs = resolveNotificationPrefs({ notif_routine: false });
    expect(prefs.routine).toBe(false);
    expect(prefs.agent).toBe(true);
    expect(prefs.pullRequest).toBe(true);
  });
});

describe("chaque catégorie a de quoi s'afficher", () => {
  it("une clé de metadata, et un libellé + une description dans les deux langues", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(NOTIFICATION_CATEGORY_META_KEYS[category]).toMatch(/^notif_/);
      for (const [locale, messages] of [
        ["en", en],
        ["fr", fr],
      ] as const) {
        const settings = messages.NotificationSettings as Record<string, string>;
        expect(settings[`${category}Label`], `${locale} ${category}Label`).toBeTruthy();
        expect(settings[`${category}Desc`], `${locale} ${category}Desc`).toBeTruthy();
      }
    }
  });
});
