// ── Commandes « / » du composer de Numo (MIN-159) ────────────────────
//
// Une commande est choisie dans le menu slash du composer ; son id CANONIQUE
// voyage dans la requête (le libellé, lui, est localisé — « /create issue » /
// « /créer ticket ») et se persiste sur `metadata.command` du message
// utilisateur. Au moment de construire les messages du modèle, la route déplie
// l'id en bloc d'instructions accroché à CE message — exactement la mécanique
// de mentionsNote : le bloc survit dans l'historique puisqu'il se recalcule
// depuis la métadonnée, et le tour de réponse à ask_user garde donc le
// contexte de la commande.

import type { AssistantCommandId } from "@/lib/assistant-types";

// Les instructions n'imposent que le DÉROULÉ du flow guidé : le contenu des
// champs (priorité/effort estimés, pas de statut, catégories…) relève des
// règles de création d'issue déjà présentes dans le system prompt.
const CREATE_ISSUE_NOTE = `[Command: the user invoked the guided issue-creation flow (the "/create issue" slash command). For THIS request:
1. Draft ONE issue from the text after the command and from the page context, filling every field your issue-creation rules let you justify.
2. If something essential is missing or ambiguous — no clear goal to title the issue, or several plausible scopes — collect it with ONE bundled ask_user call (goal, priority, effort, objective… only what is actually missing). Skip anything the message or context already answers; if nothing essential is missing, ask nothing and create directly.
3. Without a project scope (global mode), resolve the target project first via list_projects; if ambiguous, make the project one of the ask_user questions.
4. Then call create_issue and confirm with the issue's identifier.]`;

const COMMAND_NOTES: Record<AssistantCommandId, string> = {
  "create-issue": CREATE_ISSUE_NOTE,
};

/** L'id de commande envoyé par le client, validé strictement — tout le reste
 *  du corps de la requête est déjà du texte libre, pas lui. */
export function parseCommand(raw: unknown): AssistantCommandId | undefined {
  return typeof raw === "string" && raw in COMMAND_NOTES
    ? (raw as AssistantCommandId)
    : undefined;
}

/** Le bloc d'instructions accroché au message qui porte la commande, recalculé
 *  depuis sa métadonnée persistée (même contrat que mentionsNote). */
export function commandNote(metadata: unknown): string {
  const command = parseCommand(
    (metadata as { command?: unknown } | null)?.command
  );
  return command ? `\n\n${COMMAND_NOTES[command]}` : "";
}
