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
 * The two contracts of an inbox toggle, neither of which is visible when trying
 * the app: the line must fall under the correct category, and the category must
 * have something to say on the screen.
 */

describe("categoryOfNotification", () => {
  it("range une notification de ROUTINE sous « routine », quel que soit son type", () => {
    // The trap: a routine announces its end of execution with the types of
    // the agent. On the type alone, cutting “Routines” would have missed
    // failure the next morning.
    expect(categoryOfNotification({ type: "agent_failed", routine_id: "r1" })).toBe("routine");
    expect(categoryOfNotification({ type: "agent_done", routine_id: "r1" })).toBe("routine");
    expect(categoryOfNotification({ type: "routine_done" })).toBe("routine");

    // The same type without a routine remains a hand-launched run.
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
