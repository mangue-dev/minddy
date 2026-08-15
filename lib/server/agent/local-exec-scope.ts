/**
 * L'INVARIANT DES RUNS À CONTENU TIERS (MIN-360) — un module PUR, sans une seule
 * importation, parce qu'il est lu à trois endroits qui ne se connaissent pas : le
 * lancement, l'écriture de la ligne, et l'émission du bail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DIT, ET POURQUOI IL NE SE NÉGOCIE PAS
 *
 * **Un run dont le contexte n'a pas été écrit par la personne qui lance ne part
 * jamais sur une machine locale.** L'ancrage `pr`, un webhook de forge, une
 * mention externe, une routine, une chaîne, le board public de feedback : dans
 * tous ces cas, le texte que le modèle lit est du **texte d'attaquant potentiel**.
 *
 * Le dépôt le reconnaît déjà ailleurs, et c'est ce précédent qui fixe la règle :
 * une session de relecture sur un fork ne reçoit qu'un token `contents: read`,
 * parce qu'« une injection de prompt depuis le fork suffisait à le lire et à
 * l'exfiltrer » ([repo-access.ts](repo-access.ts)). En microVM, cette injection
 * coûte une VM jetable. **En local, c'est un shell sur la machine du
 * développeur.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PRÉDICAT EST LA SOURCE DU DÉCLENCHEMENT, JAMAIS `job.interactive`
 *
 * `interactive` vaut `!run.routine_id`. Il est donc **vrai** pour une relecture de
 * pull request déclenchée par un webhook — c'est-à-dire précisément le cas le plus
 * dangereux de la liste. Cette confusion-là est la raison d'être du module : le
 * bon test existait déjà à moitié dans `localExecRequested`, et un `if` recopié
 * ailleurs aurait fini par ne plus vouloir dire la même chose.
 */

/** D'où vient le déclenchement, tel que `agent_runs.triggered_by` l'enregistre. */
export type LocalRunTrigger = "button" | "chat" | "mention" | "automation" | "routine";

/** Ce qu'il faut savoir d'un run pour dire s'il peut jouer sur une machine. */
export interface LocalRunContext {
  triggeredBy: LocalRunTrigger | string;
  routineId?: string | null;
  chainId?: string | null;
  /** L'ancrage `pr` — une relecture lit un diff et des commentaires de fork. */
  pullRequestId?: string | null;
}

/** Pourquoi ce run ne peut pas jouer sur une machine locale. */
export type LocalRunScopeRefusal = "pull_request" | "routine" | "chain" | "trigger";

export type LocalRunScope = { ok: true } | { ok: false; reason: LocalRunScopeRefusal };

/**
 * CE RUN PEUT-IL, PAR SA NATURE, JOUER SUR UNE MACHINE LOCALE ?
 *
 * Une liste FERMÉE de sources autorisées, jamais une liste de sources interdites :
 * la porte d'entrée qu'on ajoutera l'an prochain doit être refusée par défaut, pas
 * autorisée par oubli.
 *
 * `mention` est exclu volontairement, et ce n'est pas un excès de prudence : une
 * mention peut venir d'un commentaire de forge recopié par un webhook, et rien à
 * cet endroit ne distingue les deux.
 */
export function localRunScope(ctx: LocalRunContext): LocalRunScope {
  if (ctx.pullRequestId) return { ok: false, reason: "pull_request" };
  if (ctx.routineId) return { ok: false, reason: "routine" };
  if (ctx.chainId) return { ok: false, reason: "chain" };
  if (ctx.triggeredBy !== "button" && ctx.triggeredBy !== "chat") {
    return { ok: false, reason: "trigger" };
  }
  return { ok: true };
}

/** La même question posée d'une LIGNE `agent_runs` — pour les surfaces qui lisent
 *  la base plutôt que l'entrée d'un lancement (l'émission du bail). */
export function rowMayRunLocally(row: {
  triggered_by?: string | null;
  routine_id?: string | null;
  chain_id?: string | null;
  pull_request_id?: string | null;
}): LocalRunScope {
  return localRunScope({
    triggeredBy: row.triggered_by ?? "",
    routineId: row.routine_id,
    chainId: row.chain_id,
    pullRequestId: row.pull_request_id,
  });
}
