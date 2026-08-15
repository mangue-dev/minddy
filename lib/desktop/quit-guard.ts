/**
 * ⌘Q PENDANT QU'UN TOUR TOURNE (MIN-293) — la moitié qui se décide sans fenêtre.
 *
 * ## Ce qui change, et pourquoi ce geste devient dangereux
 *
 * Aujourd'hui `before-quit` détruit la fenêtre **sans rien demander**
 * ([main.ts](../../desktop/src/main.ts)) : la coquille est une fenêtre sur une
 * origine, quitter ne perd rien qu'un rechargement ne rende. Dès qu'un tour joue
 * ici, le même geste devient **la principale cause de perte d'un tour** — et
 * d'une perte qui coûte, puisqu'un tour peut avoir des heures de travail derrière
 * lui et une pull request devant.
 *
 * ## Le tour DOIT mourir avec l'app, et ce n'est pas négociable
 *
 * On ne propose donc pas « quitter en laissant tourner ». Un harness détaché qui
 * survivrait à ⌘Q garderait vivants un token de forge `contents: write` et une
 * clé de modèle, **sans plus aucune interface pour les arrêter** — et un process
 * réparenté à `launchd` **perd son processus responsable TCC**, donc la fenêtre
 * d'autorisation de macOS ne s'ouvrirait même pas au premier dossier protégé.
 * Les deux moitiés du même argument : ce qui rend le local tenable, c'est que
 * l'app soit la seule chose qui tienne le tour.
 *
 * Le choix offert est donc binaire, et la formulation le dit : **arrêter le tour
 * et quitter**, ou **rester**.
 *
 * ## Où la session repart
 *
 * Un tour arrêté n'est pas un tour perdu : le superviseur sauvegarde son
 * checkpoint toutes les deux minutes, et le chien de garde remettra la session au
 * repos sur ce checkpoint-là. C'est ce que la boîte doit dire — sans quoi
 * quelqu'un annulera un ⌘Q légitime par peur de perdre une heure de travail.
 *
 * En anglais, comme le menu et le rapport de diagnostic : c'est une boîte NATIVE,
 * hors de next-intl, et le reste des surfaces natives est déjà anglais.
 */

/** Ce qu'on sait des tours en cours au moment du ⌘Q. */
export interface RunningTurn {
  readonly runId: string;
  /** De quoi nommer le tour dans la boîte — `MIN-293`, ou le dossier à défaut. */
  readonly label?: string;
}

/** La boîte, telle que `dialog.showMessageBox` la veut. */
export interface QuitPrompt {
  readonly message: string;
  readonly detail: string;
  /** `[0]` quitte, `[1]` reste. L'ordre est repris par `quitDecision`. */
  readonly buttons: readonly [string, string];
  readonly defaultId: 0 | 1;
  readonly cancelId: 0 | 1;
}

/**
 * FAUT-IL DEMANDER ? `null` = non, on quitte comme avant.
 *
 * Sans tour en cours, la coquille redevient ce qu'elle est le reste du temps :
 * une fenêtre, dont la fermeture ne coûte rien. Une boîte à chaque ⌘Q serait le
 * genre d'ajout qu'on apprend à cliquer sans lire — et le jour où elle compte
 * vraiment, elle ne compterait plus.
 */
export function quitPrompt(running: readonly RunningTurn[]): QuitPrompt | null {
  if (running.length === 0) return null;

  const one = running.length === 1;
  const named = running[0]?.label;
  const subject = one ? (named ? `“${named}”` : "an agent turn") : `${running.length} agent turns`;

  return {
    message: `Quit minddy and stop ${subject}?`,
    detail:
      (one
        ? "This turn is running on this Mac, and it cannot keep going without the app: "
        : "These turns are running on this Mac, and they cannot keep going without the app: ") +
      "minddy holds the repository token and the model key for as long as it runs, and nothing " +
      "outside the app could stop them.\n\n" +
      (one
        ? "The session is saved every couple of minutes — reopen minddy and send a message to carry on from the last save."
        : "The sessions are saved every couple of minutes — reopen minddy and send a message to carry on from the last save."),
    // Le geste destructeur en premier, comme partout sur macOS ; le défaut est
    // le bouton SÛR, et c'est lui aussi qu'un Échap déclenche.
    buttons: ["Stop and Quit", "Keep Working"],
    defaultId: 1,
    cancelId: 1,
  };
}

export type QuitDecision = "quit" | "stay";

/**
 * Ce que le clic veut dire. Trivial, et écrit quand même : un index de bouton
 * inversé ici ferait quitter l'app sur « Keep Working », et c'est exactement le
 * genre de faute qu'aucun type ne rattrape.
 *
 * Tout ce qui n'est pas le bouton 0 vaut « rester » — une boîte fermée par le
 * système, un `response` hors bornes, un Échap.
 */
export function quitDecision(response: number): QuitDecision {
  return response === 0 ? "quit" : "stay";
}

/**
 * Le mot de la fin écrit dans le journal des tours qu'on arrête.
 *
 * Il compte plus qu'il n'en a l'air : c'est la seule ligne qui distingue « le
 * harness a planté » de « quelqu'un a quitté l'app », et les deux se lisent
 * autrement dans un rapport de diagnostic.
 */
export function quitLogNote(): string {
  return "stopped because minddy was quit — the session resumes from its last save";
}
