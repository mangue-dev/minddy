import "server-only";

import { SSO_ENV_VAR } from "@/lib/feedback/env-lines";
import { INTEGRATION_ENV_VAR } from "@/lib/feedback/integration-contract";
import type { Locale } from "@/i18n/config";
import {
  apiPromptDe,
  apiPromptEs,
  apiPromptIt,
  apiPromptPtBr,
  boardPromptDe,
  boardPromptEs,
  boardPromptIt,
  boardPromptPtBr,
  issuesPromptDe,
  issuesPromptEs,
  issuesPromptIt,
  issuesPromptPtBr,
  webhookSectionDe,
  webhookSectionEs,
  webhookSectionIt,
  webhookSectionPtBr,
} from "./integration-prompt-localized";

/**
 * All-in-one integration prompt (MIN-37): text ready to paste into a
 * code agent (Claude Code, Cursor…) — or hand to Numo — describing WHAT to
 * connect in the client's app, WHERE (a free-form user instruction), and HOW.
 * Three modes cover the ways an app can connect to minddy: a link to the public
 * board (with optional SSO pre-authentication), feedback submission through the API,
 * and issue creation through the API.
 *
 * When a webhook is configured, the two API modes also include the route that
 * RECEIVES events. This is the reverse direction of the integration, and it is the
 * one an unattended agent would otherwise replace with a polling loop.
 *
 * NO credential appears in any mode: the prompt names the environment variable
 * (`MINDDY_SSO_SECRET`, `MINDDY_FEEDBACK_KEY`, `MINDDY_API_KEY`)
 * and the user fills it in from the line the interface shows. This keeps these texts
 * as ordinary instructions — safe to paste anywhere or hand to Numo — rather than
 * secrets requiring special handling. The module therefore receives neither secret
 * nor key: there is nothing to leak.
 */

const FEEDBACK_KEY_ENV_VAR = INTEGRATION_ENV_VAR.feedback;
const ISSUES_KEY_ENV_VAR = INTEGRATION_ENV_VAR.issues;

export type IntegrationPromptMode = "board" | "api" | "issues";

/** The webhook AS CONFIGURED — if absent, there is no route to write. */
export interface IntegrationPromptWebhook {
  url: string;
  events: string[];
  scope: string;
}

export interface IntegrationPromptInput {
  mode: IntegrationPromptMode;
  locale: Locale;
  projectName: string;
  /** Free instruction: where to place the button / where to connect the collection. */
  placement: string;
  origin: string;
  /** Mode board. */
  boardUrl?: string;
  /** SSO pre-identification requested — the SECRET does not enter here. */
  sso?: boolean;
  /** API modes: the receive route to write, if a webhook is configured. */
  webhook?: IntegrationPromptWebhook | null;
}

export function buildIntegrationPrompt(input: IntegrationPromptInput): string {
  const placement = input.placement.trim();
  const builders = PROMPT_BUILDERS[input.locale];
  if (input.mode === "board") {
    // The board is a minddy page: nothing goes back to the app.
    return builders.board(input, placement);
  }
  const envVar =
    input.mode === "issues" ? ISSUES_KEY_ENV_VAR : FEEDBACK_KEY_ENV_VAR;
  const body =
    input.mode === "issues"
      ? builders.issues(input, placement)
        : builders.api(input, placement);
  if (!input.webhook) return body;
  return `${body}\n\n${builders.webhook(input.webhook, envVar)
  }`;
}

interface IntegrationPromptBuilders {
  board: (input: IntegrationPromptInput, placement: string) => string;
  api: (input: IntegrationPromptInput, placement: string) => string;
  issues: (input: IntegrationPromptInput, placement: string) => string;
  webhook: (webhook: IntegrationPromptWebhook, envVar: string) => string;
}

const PROMPT_BUILDERS: Record<Locale, IntegrationPromptBuilders> = {
  en: {
    board: boardPromptEn,
    api: apiPromptEn,
    issues: issuesPromptEn,
    webhook: webhookSectionEn,
  },
  fr: {
    board: boardPromptFr,
    api: apiPromptFr,
    issues: issuesPromptFr,
    webhook: webhookSectionFr,
  },
  de: {
    board: boardPromptDe,
    api: apiPromptDe,
    issues: issuesPromptDe,
    webhook: webhookSectionDe,
  },
  "pt-BR": {
    board: boardPromptPtBr,
    api: apiPromptPtBr,
    issues: issuesPromptPtBr,
    webhook: webhookSectionPtBr,
  },
  it: {
    board: boardPromptIt,
    api: apiPromptIt,
    issues: issuesPromptIt,
    webhook: webhookSectionIt,
  },
  es: {
    board: boardPromptEs,
    api: apiPromptEs,
    issues: issuesPromptEs,
    webhook: webhookSectionEs,
  },
};

// ── Webhook: the road that RECEIVES ────────────────────────────────────────────

function webhookSectionFr(
  webhook: IntegrationPromptWebhook,
  envVar: string,
): string {
  return `## Recevoir les changements (webhook)

minddy est déjà réglé pour appeler \`${webhook.url}\` en POST sur ${webhook.events.map((e) => `\`${e}\``).join(", ")}${
    webhook.scope === "all"
      ? " (tous les tickets du projet)"
      : " (les tickets créés par cette intégration)"
  }. Il reste à écrire cette route.

1. Lis le corps **brut** de la requête. La signature porte sur ces octets-là : parser le JSON puis le re-sérialiser les change, et la vérification échouera toujours.
2. Vérifie l'en-tête \`X-Minddy-Signature\`, de la forme \`sha256=<hex>\`. La clé du HMAC n'est PAS la clé d'API : c'est son empreinte SHA-256 hex en minuscules. Calcule \`hmac_sha256(corps_brut, sha256_hex(process.env.${envVar}))\` et compare en temps constant. Signature absente ou fausse : réponds 401 sans rien traiter.
3. Réponds 2xx dès que tu tiens la charge utile, fais le travail après : minddy attend 5 s, relance une fois sur échec réseau ou 5xx, puis abandonne la livraison.
4. Rends le traitement idempotent sur \`delivery_id\` (aussi dans l'en-tête \`X-Minddy-Delivery\`) : une livraison peut arriver deux fois, et l'ordre n'est pas garanti.
5. Corps reçu : \`{ event, delivery_id, timestamp, project: { id, name, key }, integration: { id, name }, issue: { id, number, identifier, title, status, priority, effort, created_via_integration } }\`, plus \`change\` sur \`issue.status_changed\` et \`changes\` (un tableau) sur \`issue.updated\`.

## Vérification du webhook

- Change le statut d'un ticket dans minddy : la route reçoit un POST, la signature est valide, la réponse est 2xx.
- Rejoue la même requête avec un octet modifié : elle doit être refusée en 401.`;
}

function webhookSectionEn(
  webhook: IntegrationPromptWebhook,
  envVar: string,
): string {
  return `## Receiving changes (webhook)

minddy is already set to POST to \`${webhook.url}\` on ${webhook.events.map((e) => `\`${e}\``).join(", ")}${
    webhook.scope === "all"
      ? " (every issue of the project)"
      : " (the issues this integration created)"
  }. The route is what's left to write.

1. Read the **raw** request body. The signature covers those exact bytes: parsing the JSON and re-serialising it changes them, and verification will always fail.
2. Verify the \`X-Minddy-Signature\` header, of the form \`sha256=<hex>\`. The HMAC key is NOT the API key: it is its lowercase SHA-256 hex digest. Compute \`hmac_sha256(raw_body, sha256_hex(process.env.${envVar}))\` and compare in constant time. Missing or wrong signature: answer 401 and process nothing.
3. Answer 2xx as soon as you hold the payload and do the work afterwards: minddy waits 5s, retries once on a network error or a 5xx, then drops the delivery.
4. Make the handler idempotent on \`delivery_id\` (also in the \`X-Minddy-Delivery\` header): a delivery can arrive twice, and order is not guaranteed.
5. Body received: \`{ event, delivery_id, timestamp, project: { id, name, key }, integration: { id, name }, issue: { id, number, identifier, title, status, priority, effort, created_via_integration } }\`, plus \`change\` on \`issue.status_changed\` and \`changes\` (an array) on \`issue.updated\`.

## Verifying the webhook

- Change an issue's status in minddy: the route receives a POST, the signature checks out, the response is 2xx.
- Replay the same request with one byte changed: it must be rejected with a 401.`;
}

// ── Board public ──────────────────────────────────────────────────────────────

function boardPromptFr(
  input: IntegrationPromptInput,
  placement: string,
): string {
  const sso = !!input.sso;
  return `# Intégrer le feedback minddy dans cette application

Objectif : ajouter un point d'entrée « Feedback » qui envoie nos utilisateurs vers le board de feedback minddy du projet « ${input.projectName} » — une page publique où ils postent, votent et précisent les besoins (les doublons sont fusionnés automatiquement).

## Où le placer

${placement || "À l'endroit le plus naturel pour un lien « Feedback » (menu utilisateur, footer, page d'aide…)."}

${
  sso
    ? `## Ce qu'il faut faire (avec pré-identification SSO)

1. Ajoute le bouton/lien « Feedback » à l'endroit décrit ci-dessus.
2. Ne mets PAS l'URL du board en dur côté client : crée un petit endpoint serveur (ex. \`GET /feedback\`) vers lequel pointe le bouton. Cet endpoint pré-identifie l'utilisateur connecté puis redirige vers le board — l'utilisateur arrive identifié, sans étape de vérification.
3. Dans cet endpoint, signe un JWT **HS256** avec le secret de signature et redirige (302) vers :
   \`${input.boardUrl}?sso=<jwt>\`
   Claims du JWT :
   - \`sub\` (requis) : l'identifiant stable de l'utilisateur chez nous
   - \`email\` (recommandé) : son email
   - \`name\` (optionnel) : son nom affiché
   - \`exp\` (requis) : maintenant + 10 minutes maximum — le JWT ne sert qu'à la redirection, et minddy REFUSE tout \`exp\` au-delà
   Signe un JWT NEUF à chaque clic : il est à usage unique, minddy le consomme à l'arrivée et un jeton rejoué est refusé (ne le mets donc jamais en cache, ni dans un lien qu'on garde).
4. Le secret de signature n'est PAS dans ce prompt : il vit dans la variable d'environnement \`${SSO_ENV_VAR}\`, que je renseigne moi-même. Lis-la côté serveur (\`process.env.${SSO_ENV_VAR}\` ou l'équivalent du langage), ne l'écris jamais en dur, ne l'expose jamais au client, et si elle est absente, renonce à la pré-identification (redirection simple vers le board, étape 5) plutôt que de signer avec une valeur inventée.
5. Utilisateur non connecté : redirige simplement vers \`${input.boardUrl}\` (sans paramètre \`sso\`) — il pourra se vérifier par email sur place.

## Vérification

- Connecté, clique le bouton : le board s'ouvre déjà identifié (pseudonyme visible en haut à droite, « Mes feedbacks » accessible).
- Déconnecté, clique le bouton : le board s'ouvre en anonyme, la participation demande une vérification email.`
    : `## Ce qu'il faut faire

1. Ajoute un bouton/lien « Feedback » à l'endroit décrit ci-dessus.
2. Il ouvre (idéalement dans un nouvel onglet) :
   \`\`\`
   ${input.boardUrl}
   \`\`\`
3. Rien d'autre : la page gère l'identité (vérification email) et le reste.

## Vérification

- Clique le bouton : le board s'ouvre, on peut poster un retour après vérification email.`
}`;
}

function boardPromptEn(
  input: IntegrationPromptInput,
  placement: string,
): string {
  const sso = !!input.sso;
  return `# Integrate minddy feedback into this application

Goal: add a "Feedback" entry point that sends our users to the minddy feedback board of the "${input.projectName}" project — a public page where they post, vote and refine needs (duplicates are merged automatically).

## Where to put it

${placement || "Wherever a “Feedback” link belongs naturally (user menu, footer, help page…)."}

${
  sso
    ? `## What to do (with SSO pre-identification)

1. Add the "Feedback" button/link where described above.
2. Do NOT hardcode the board URL client-side: create a small server endpoint (e.g. \`GET /feedback\`) the button points to. It pre-identifies the signed-in user then redirects to the board — the user lands identified, no verification step.
3. In that endpoint, sign an **HS256** JWT with the signing secret and redirect (302) to:
   \`${input.boardUrl}?sso=<jwt>\`
   JWT claims:
   - \`sub\` (required): the user's stable id on our side
   - \`email\` (recommended): their email
   - \`name\` (optional): their display name
   - \`exp\` (required): now + 10 minutes max — the JWT only serves the redirect, and minddy REJECTS any \`exp\` beyond that
   Sign a FRESH JWT on every click: it is single-use, minddy consumes it on arrival and a replayed token is refused (so never cache one, and never put one in a link people keep).
4. The signing secret is NOT in this prompt: it lives in the \`${SSO_ENV_VAR}\` environment variable, which I set myself. Read it server-side (\`process.env.${SSO_ENV_VAR}\` or your language's equivalent), never hardcode it, never expose it to the client, and if it is missing, skip pre-identification (plain redirect to the board, step 5) rather than signing with a made-up value.
5. Signed-out user: just redirect to \`${input.boardUrl}\` (no \`sso\` parameter) — they can verify by email on the board.

## Verification

- Signed in, click the button: the board opens already identified (pseudonym visible top right, "My feedback" accessible).
- Signed out, click the button: the board opens anonymously; participating asks for email verification.`
    : `## What to do

1. Add a "Feedback" button/link where described above.
2. It opens (ideally in a new tab):
   \`\`\`
   ${input.boardUrl}
   \`\`\`
3. Nothing else: the page handles identity (email verification) and everything else.

## Verification

- Click the button: the board opens; posting works after email verification.`
}`;
}

// ── Server-to-server API ───────────────────────────────────────────────────────

function apiPromptFr(input: IntegrationPromptInput, placement: string): string {
  return `# Intégrer le feedback minddy dans cette application (API serveur-à-serveur)

Objectif : collecter le feedback de nos utilisateurs dans l'app et le déposer dans minddy (projet « ${input.projectName} »), au nom de l'utilisateur. minddy déduplique les retours automatiquement (posts votables).

## Où le brancher

${placement || "À l'endroit le plus naturel (bouton « Feedback » + petite modale titre/description, ou une source existante : formulaire support, etc.)."}

## Ce qu'il faut faire

1. Ajoute le point d'entrée décrit ci-dessus (un titre court obligatoire, une description optionnelle).
2. Côté serveur UNIQUEMENT, envoie le retour à minddy :
   \`\`\`
   POST ${input.origin}/api/v1/feedback
   Authorization: Bearer $${FEEDBACK_KEY_ENV_VAR}
   Content-Type: application/json

   {
     "title": "<titre court>",
     "body": "<description, optionnelle>",
     "user": {
       "external_id": "<id stable de l'utilisateur chez nous>",
       "email": "<son email>",
       "name": "<son nom, optionnel>"
     }
   }
   \`\`\`
   - \`user\` est requis avec \`external_id\` et/ou \`email\` : jamais d'anonyme, notre serveur se porte garant de l'identité (1 identité = 1 voix).
   - Réponse 201 : \`{ id, title, status, votes, user: { pseudonym } }\`.
   - Erreurs : 401 \`invalid_api_key\`, 422 \`title_required\` / \`user_identity_required\`, 429 \`rate_limited\` (header \`Retry-After\`).
3. (Optionnel) Voter au nom d'un utilisateur sur un post existant :
   \`POST ${input.origin}/api/v1/feedback/<post_id>/vote\` avec le même objet \`user\`.
4. La clé n'est PAS dans ce prompt : elle vit dans la variable d'environnement \`${FEEDBACK_KEY_ENV_VAR}\`, que je renseigne moi-même. Lis-la côté serveur (\`process.env.${FEEDBACK_KEY_ENV_VAR}\` ou l'équivalent du langage), ne l'écris jamais en dur, ne l'expose jamais au client, et si elle est absente, échoue clairement au démarrage plutôt que d'appeler l'API sans authentification.

## Vérification

- Envoie un retour de test depuis l'app : réponse 201.
- Il apparaît dans minddy → projet « ${input.projectName} » → onglet Feedback, attribué à l'utilisateur transmis.`;
}

// ── Issues through the API ─────────────────────────────────────────────────────

function issuesPromptFr(
  input: IntegrationPromptInput,
  placement: string,
): string {
  return `# Envoyer des tickets à minddy depuis cette application

Objectif : créer des tickets dans le projet « ${input.projectName} » de minddy depuis notre app. Ils arrivent dans le TRIAGE, où un humain les valide — c'est voulu : rien ne rentre directement dans le backlog.

## D'où partent les tickets

${placement || "Depuis la source la plus naturelle : remontée d'erreur non gérée, escalade du support, formulaire interne…"}

## Ce qu'il faut faire

1. Branche l'envoi à l'endroit décrit ci-dessus (un titre court obligatoire, une description optionnelle).
2. Côté serveur UNIQUEMENT :
   \`\`\`
   POST ${input.origin}/api/v1/issues
   Authorization: Bearer $${ISSUES_KEY_ENV_VAR}
   Content-Type: application/json

   {
     "title": "<titre court>",
     "description": "<description en markdown, optionnelle>",
     "priority": "none | low | medium | high | urgent (optionnel)",
     "effort": "xs | s | m | l | xl (optionnel)",
     "categories": ["<id de catégorie, optionnel>"]
   }
   \`\`\`
   - Réponse 201 : \`{ id, number, identifier, status }\` — \`identifier\` se lit « KEY-42 ».
   - Les catégories acceptées se lisent sur \`GET ${input.origin}/api/v1/issues/options\` (elles se passent par ID, pas par nom).
   - Erreurs : 401 \`invalid_api_key\`, 422 \`title_required\` / \`invalid_priority\` / \`invalid_effort\` / \`unknown_category\`, 429 \`rate_limited\` (header \`Retry-After\`), 403 \`issue_limit_reached\` — ce dernier est définitif, pas transitoire : le plan est plein, arrête de réessayer et dis-le.
3. Le statut, l'assigné et le parent ne se règlent pas de l'extérieur : n'essaie pas de les envoyer.
4. Déduplique côté app avant d'envoyer si la source peut se répéter (la même erreur cent fois) : minddy ne fusionne pas les tickets, contrairement au feedback.
5. La clé n'est PAS dans ce prompt : elle vit dans la variable d'environnement \`${ISSUES_KEY_ENV_VAR}\`, que je renseigne moi-même. Lis-la côté serveur (\`process.env.${ISSUES_KEY_ENV_VAR}\` ou l'équivalent du langage), ne l'écris jamais en dur, ne l'expose jamais au client, et si elle est absente, échoue clairement au démarrage plutôt que d'appeler l'API sans authentification.

## Vérification

- Déclenche la source depuis l'app : réponse 201.
- Le ticket apparaît dans minddy → projet « ${input.projectName} » → triage, avec la pastille d'intégration.`;
}

function issuesPromptEn(
  input: IntegrationPromptInput,
  placement: string,
): string {
  return `# Send issues to minddy from this application

Goal: create issues in the "${input.projectName}" minddy project from our app. They land in TRIAGE, where a human validates them — by design: nothing goes straight into the backlog.

## Where the issues come from

${placement || "From wherever it fits best: an unhandled error, a support escalation, an internal form…"}

## What to do

1. Wire the call where described above (a short required title, an optional description).
2. Server-side ONLY:
   \`\`\`
   POST ${input.origin}/api/v1/issues
   Authorization: Bearer $${ISSUES_KEY_ENV_VAR}
   Content-Type: application/json

   {
     "title": "<short title>",
     "description": "<markdown description, optional>",
     "priority": "none | low | medium | high | urgent (optional)",
     "effort": "xs | s | m | l | xl (optional)",
     "categories": ["<category id, optional>"]
   }
   \`\`\`
   - 201 response: \`{ id, number, identifier, status }\` — \`identifier\` reads "KEY-42".
   - Accepted categories come from \`GET ${input.origin}/api/v1/issues/options\` (they are passed by ID, not by name).
   - Errors: 401 \`invalid_api_key\`, 422 \`title_required\` / \`invalid_priority\` / \`invalid_effort\` / \`unknown_category\`, 429 \`rate_limited\` (\`Retry-After\` header), 403 \`issue_limit_reached\` — that last one is definitive, not transient: the plan is full, stop retrying and say so.
3. Status, assignee and parent are not settable from outside: do not try to send them.
4. Deduplicate on your side before sending if the source can repeat (the same error a hundred times): minddy does not merge issues, unlike feedback.
5. The key is NOT in this prompt: it lives in the \`${ISSUES_KEY_ENV_VAR}\` environment variable, which I set myself. Read it server-side (\`process.env.${ISSUES_KEY_ENV_VAR}\` or your language's equivalent), never hardcode it, never expose it to the client, and if it is missing, fail loudly at startup rather than calling the API unauthenticated.

## Verification

- Trigger the source from the app: 201 response.
- The issue shows up in minddy → "${input.projectName}" project → triage, carrying the integration badge.`;
}

function apiPromptEn(input: IntegrationPromptInput, placement: string): string {
  return `# Integrate minddy feedback into this application (server-to-server API)

Goal: collect our users' feedback inside the app and submit it to minddy (project "${input.projectName}") on the user's behalf. minddy deduplicates feedback automatically (votable posts).

## Where to wire it

${placement || "Wherever it fits best (a “Feedback” button + small title/description modal, or an existing source: support form, etc.)."}

## What to do

1. Add the entry point described above (a short required title, an optional description).
2. Server-side ONLY, submit the feedback to minddy:
   \`\`\`
   POST ${input.origin}/api/v1/feedback
   Authorization: Bearer $${FEEDBACK_KEY_ENV_VAR}
   Content-Type: application/json

   {
     "title": "<short title>",
     "body": "<description, optional>",
     "user": {
       "external_id": "<the user's stable id on our side>",
       "email": "<their email>",
       "name": "<their name, optional>"
     }
   }
   \`\`\`
   - \`user\` is required with \`external_id\` and/or \`email\`: never anonymous, our server vouches for the identity (1 identity = 1 vote).
   - 201 response: \`{ id, title, status, votes, user: { pseudonym } }\`.
   - Errors: 401 \`invalid_api_key\`, 422 \`title_required\` / \`user_identity_required\`, 429 \`rate_limited\` (\`Retry-After\` header).
3. (Optional) Vote on an existing post on a user's behalf:
   \`POST ${input.origin}/api/v1/feedback/<post_id>/vote\` with the same \`user\` object.
4. The key is NOT in this prompt: it lives in the \`${FEEDBACK_KEY_ENV_VAR}\` environment variable, which I set myself. Read it server-side (\`process.env.${FEEDBACK_KEY_ENV_VAR}\` or your language's equivalent), never hardcode it, never expose it to the client, and if it is missing, fail loudly at startup rather than calling the API unauthenticated.

## Verification

- Send a test feedback from the app: 201 response.
- It shows up in minddy → "${input.projectName}" project → Feedback tab, attributed to the user you passed.`;
}
