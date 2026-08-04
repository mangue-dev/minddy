import { firstSentence, mcpToolCatalog } from "@/lib/server/mcp/catalog";
import {
  WEBHOOK_SIGNATURE_HEADER,
  integrationWebhookDoc,
} from "@/lib/feedback/integration-contract";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";

/**
 * `/llms.txt` (MIN-88) — et il parle du SERVEUR MCP, pas du produit.
 *
 * Google a publié le 15 mai 2026 un guide d'optimisation pour l'IA qui dit
 * explicitement que `llms.txt`, le balisage « IA » et les versions Markdown ne
 * servent à rien pour AI Overviews ou AI Mode : c'est le même index et le même
 * classement que la recherche classique. Un `llms.txt` marketing serait donc un
 * fichier que personne ne lit.
 *
 * Le format a en revanche fait ses preuves sur un usage précis, celui pour
 * lequel Stripe, Vercel, Cloudflare et Anthropic le publient : permettre à un
 * assistant de code d'écrire une intégration JUSTE du premier coup. C'est
 * exactement le besoin de minddy — l'agent qu'on veut brancher est le même
 * genre d'agent que celui qui lit ce fichier.
 *
 * Il ne contient donc que ce qui sert à cela : l'endpoint, le mode
 * d'authentification, la hiérarchie des objets, et la liste des outils. Le
 * détail des paramètres vit dans `/llms-full.txt`.
 *
 * Tout est DÉRIVÉ de `lib/server/mcp/` : ce fichier ne peut pas décrire une API
 * que le serveur n'expose plus.
 */
export function GET(): Response {
  const tools = mcpToolCatalog();
  const webhook = integrationWebhookDoc();

  const body = `# minddy

> A minimal issue tracker with a first-class MCP server. Projects hold issues;
> objectives group issues around a goal; an issue can carry an implementation
> plan whose markdown checkboxes are trackable tasks. Agents read and write
> minddy over MCP, as the user who authorised them.

This file is written for coding assistants wiring an agent to minddy. For the
product itself, see ${SITE_URL}.

## Connecting

- Endpoint: \`${MCP_ENDPOINT}\`
- Transport: Streamable HTTP (stateless, tools only: no SSE, no server
  notifications)
- Auth: **OAuth 2.1 only**. There are no static API keys. On a request without a
  valid bearer, the server answers \`401\` with \`WWW-Authenticate\` and
  \`resource_metadata\`, which points at
  \`${SITE_URL}/.well-known/oauth-protected-resource\`; the client discovers the
  authorization server from
  \`${SITE_URL}/.well-known/oauth-authorization-server\` and opens a browser for
  consent. Dynamic client registration is supported.
- Server card: \`${SITE_URL}/.well-known/mcp/server-card.json\`

Claude Code, for example:

\`\`\`
claude mcp add --scope user --transport http minddy ${MCP_ENDPOINT}
\`\`\`

## Model

${MCP_SERVER_MODEL}

## Tools

${tools.map((tool) => `- \`${tool.name}\`${tool.readOnly ? " (read-only)" : ""}: ${firstSentence(tool.description)}`).join("\n")}

## Webhooks

minddy also calls YOU. An integration key created with
\`minddy_create_integration\` can carry an outgoing webhook — set it with
\`minddy_configure_webhook\` — and minddy then POSTs signed JSON to your endpoint
when issues move. It is how an app learns that a human triaged what it pushed:
do not poll for that.

- Events: ${webhook.events.map((e) => `\`${e.name}\``).join(", ")}
- Scope: ${webhook.scopes.map((s) => `\`${s.value}\``).join(" or ")} — ${webhook.scopes[0].value} means only the issues that key created
- Signature: \`${WEBHOOK_SIGNATURE_HEADER}: sha256=<hex>\`. ${webhook.signature}

Full payload, headers and delivery guarantees: ${SITE_URL}/llms-full.txt

## More

- Full tool reference, with every parameter: ${SITE_URL}/llms-full.txt
- Setup guide, one ready-to-paste block per agent: ${SITE_URL}/mcp
- Terms: ${SITE_URL}/terms
- Privacy: ${SITE_URL}/privacy
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * La hiérarchie, en trois lignes. Volontairement écrite ici et non dérivée des
 * instructions MCP : celles-ci font 3 800 caractères d'une seule traite, ce qui
 * est le bon format pour un modèle en cours de session mais illisible en tête
 * d'un fichier d'intégration. `/llms-full.txt` sert la version intégrale.
 */
const MCP_SERVER_MODEL = `- **Project**: the workspace. Everything else belongs to one.
- **Objective**: groups a project's issues around a goal.
- **Issue**: \`<PROJECT KEY>-<number>\`, e.g. \`MIND-42\`. Statuses: triage,
  backlog, todo, in_progress, in_review, done, canceled, duplicate. Priorities:
  none, urgent, high, medium, low. Efforts: xs, s, m, l, xl.
- **Plan**: markdown on an issue. \`- [ ]\` pending, \`- [~]\` in progress,
  \`- [x]\` done, \`- [-]\` cancelled. Checkboxes under a \`## Questions\`
  heading are open questions, not work, and never count towards progress.
- **Cycle**: the key owner's personal, cross-project fortnight.
- **Scratchpad**: the key owner's personal notes doc, same checkbox markdown.
- **Feedback**: user requests on a public board, separate from issues, with
  votes and a public status; can be promoted into an issue.`;
