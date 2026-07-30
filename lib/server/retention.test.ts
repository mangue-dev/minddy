import { describe, expect, it } from "vitest";

import { RETENTION_DAYS, cutoff } from "./retention";
import { TRASH_RETENTION_DAYS } from "../trash-retention";

/**
 * MIN-119 — les durées de conservation.
 *
 * Ce que ces tests protègent n'est pas l'arithmétique (elle est triviale) mais
 * le CONTRAT : la politique de confidentialité annonce des durées au public, et
 * `RETENTION_DAYS` est ce qui les applique. Une valeur qui bouge ici sans que la
 * politique bouge, c'est une promesse qu'on ne tient plus — donc les valeurs
 * elles-mêmes sont figées par un test, avec la phrase publique en regard.
 */

const NOW = new Date("2026-07-30T12:00:00.000Z");

describe("cutoff", () => {
  it("recule du nombre de jours demandé", () => {
    expect(cutoff(30, NOW)).toBe("2026-06-30T12:00:00.000Z");
  });

  it("traverse les changements de mois et d'année", () => {
    expect(cutoff(365, new Date("2026-01-15T00:00:00.000Z"))).toBe(
      "2025-01-15T00:00:00.000Z"
    );
  });

  it("rend la date du jour pour zéro jour", () => {
    expect(cutoff(0, NOW)).toBe(NOW.toISOString());
  });
});

describe("RETENTION_DAYS", () => {
  // Chaque ligne : la valeur, et ce que la politique de confidentialité en dit.
  it.each([
    ["readNotifications", 180, "notifications lues : 6 mois"],
    ["pendingInvitations", 90, "invitations en attente : 90 jours"],
    ["agentRunTrace", 30, "traces des runs d'agent : 30 jours après la fin"],
    ["stripeWebhookPayload", 90, "charge utile des webhooks Stripe : 90 jours"],
    ["trash", 30, "corbeille : 30 jours avant suppression définitive"],
  ] as const)("%s vaut %i jours — %s", (key, days, _promise) => {
    expect(RETENTION_DAYS[key]).toBe(days);
  });

  // La durée affichée sur chaque ligne de la corbeille et celle qu'applique le
  // balayage nocturne sont la MÊME constante. Si les deux se remettaient à
  // vivre séparément, l'écran promettrait un délai que le cron ne tiendrait pas.
  it("la corbeille applique la durée que l'écran annonce", () => {
    expect(RETENTION_DAYS.trash).toBe(TRASH_RETENTION_DAYS);
  });

  it("ne conserve rien indéfiniment ni rétroactivement", () => {
    for (const days of Object.values(RETENTION_DAYS)) {
      expect(days).toBeGreaterThan(0);
      expect(Number.isFinite(days)).toBe(true);
    }
  });
});
