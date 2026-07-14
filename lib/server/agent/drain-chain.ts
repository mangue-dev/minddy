import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAgentDrainOrigin } from "./origin";
import { hasDueAgentWork } from "./drain";

/**
 * Chaînage du drain de l'agent (MIN-46) — tue le temps mort entre chunks. Un run
 * qui dépasse une fenêtre de drain (270s) se re-`queue` et attendrait sinon le
 * prochain tick de cron (toutes les 2 min). Quand un drain finit avec du travail dû restant,
 * on auto-invoque UNE fois la route drain (Bearer CRON_SECRET) → le reliquat
 * continue dans une fonction 300s fraîche immédiatement. Le claim CAS rend un
 * chaînage sûr face à un tick de cron concurrent ; le cron reste le filet.
 * Copie du pattern d'AutoKap (drain-chain.ts).
 */

/** Plafond anti-runaway sur les invocations chaînées consécutives. */
export const MAX_DRAIN_CHAIN = 20;

/**
 * Auto-invoque la route drain de l'agent si du travail reste dû. Renvoie true si
 * un kick a été envoyé. Ne lève jamais — le cron est toujours le filet.
 */
export async function chainAgentDrain(opts: {
  supabase: SupabaseClient;
  /** Nombre d'invocations chaînées précédentes (0 = drain kické par cron/launch). */
  chain: number;
  /** Origine à utiliser (la route cron passe sa propre origine de requête). */
  origin?: string;
}): Promise<boolean> {
  if (opts.chain >= MAX_DRAIN_CHAIN) return false;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // pas de moyen de s'auto-autoriser (dev) — cron = filet
  try {
    if (!(await hasDueAgentWork(opts.supabase))) return false;
    const origin = opts.origin ?? getAgentDrainOrigin();
    const url = `${origin}/api/cron/agent-drain?chain=${opts.chain + 1}`;
    await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return true; // requête délivrée ; l'enfant n'a juste pas fini son drain
    }
    console.error("[agent-drain] chain kick failed:", error);
    return false;
  }
}
