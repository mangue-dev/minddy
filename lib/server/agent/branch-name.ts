/**
 * Convention des branches de travail créées par l'agent.
 *
 * Un ticket est identifié par sa clé (`MIN-42`). Une conversation sans ticket
 * n'a pas de clé équivalente : son titre, puis son premier prompt, donnent le
 * libellé humain. Le préfixe reste toujours `agent`, jamais `note` — le carnet
 * n'est qu'un point d'entrée parmi les conversations de Numo.
 */

const MAX_LABEL_LENGTH = 72;

export function slugForAgentBranch(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LABEL_LENGTH)
    .replace(/-+$/g, "");
  return slug || "agent";
}

export function generatedAgentBranchName(input: {
  runId: string;
  issueIdentifier?: string | null;
  conversationTitle?: string | null;
  prompt?: string | null;
}): string {
  const label =
    input.issueIdentifier?.trim() ||
    input.conversationTitle?.trim() ||
    input.prompt?.trim() ||
    "agent";
  return `minddy/agent/${slugForAgentBranch(label)}-${input.runId.slice(0, 8)}`;
}
