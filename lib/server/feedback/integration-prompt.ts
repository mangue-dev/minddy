import "server-only";

/**
 * Prompt d'intégration tout-en-un (MIN-37) : un texte prêt à coller dans un
 * agent de code (Claude Code, Cursor…) qui décrit QUOI brancher dans l'app du
 * client, OÙ (instruction libre de l'utilisateur) et COMMENT — secrets inclus
 * (URL du board, secret SSO ou clé API), donc généré owner-only et jamais
 * stocké. Deux modes : lien vers le board public (± pré-auth SSO) ou
 * intégration API serveur-à-serveur.
 */

export type IntegrationPromptMode = "board" | "api";

export interface IntegrationPromptInput {
  mode: IntegrationPromptMode;
  locale: "fr" | "en";
  projectName: string;
  /** Instruction libre : où placer le bouton / où brancher la collecte. */
  placement: string;
  origin: string;
  /** Mode board. */
  boardUrl?: string;
  ssoSecret?: string | null;
  /** Mode api. */
  apiKey?: string;
}

export function buildIntegrationPrompt(input: IntegrationPromptInput): string {
  const placement = input.placement.trim();
  if (input.mode === "board") {
    return input.locale === "fr"
      ? boardPromptFr(input, placement)
      : boardPromptEn(input, placement);
  }
  return input.locale === "fr"
    ? apiPromptFr(input, placement)
    : apiPromptEn(input, placement);
}

// ── Board public ──────────────────────────────────────────────────────────────

function boardPromptFr(input: IntegrationPromptInput, placement: string): string {
  const sso = !!input.ssoSecret;
  return `# Intégrer le feedback minddy dans cette application

Objectif : ajouter un point d'entrée « Feedback » qui envoie nos utilisateurs vers le board de feedback minddy du projet « ${input.projectName} » — une page publique où ils postent, votent et précisent les besoins (les doublons sont fusionnés automatiquement).

## Où le placer

${placement || "À l'endroit le plus naturel pour un lien « Feedback » (menu utilisateur, footer, page d'aide…)."}

${
  sso
    ? `## Ce qu'il faut faire (avec pré-identification SSO)

1. Ajoute le bouton/lien « Feedback » à l'endroit décrit ci-dessus.
2. Ne mets PAS l'URL du board en dur côté client : crée un petit endpoint serveur (ex. \`GET /feedback\`) vers lequel pointe le bouton. Cet endpoint pré-identifie l'utilisateur connecté puis redirige vers le board — l'utilisateur arrive identifié, sans étape de vérification.
3. Dans cet endpoint, signe un JWT **HS256** avec le secret ci-dessous et redirige (302) vers :
   \`${input.boardUrl}?sso=<jwt>\`
   Claims du JWT :
   - \`sub\` (requis) : l'identifiant stable de l'utilisateur chez nous
   - \`email\` (recommandé) : son email
   - \`name\` (optionnel) : son nom affiché
   - \`exp\` (requis) : maintenant + 10 minutes maximum — le JWT ne sert qu'à la redirection
4. Stocke le secret dans une variable d'environnement (ex. \`MINDDY_SSO_SECRET\`) — jamais côté client, jamais commité :
   \`\`\`
   ${input.ssoSecret}
   \`\`\`
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

function boardPromptEn(input: IntegrationPromptInput, placement: string): string {
  const sso = !!input.ssoSecret;
  return `# Integrate minddy feedback into this application

Goal: add a "Feedback" entry point that sends our users to the minddy feedback board of the "${input.projectName}" project — a public page where they post, vote and refine needs (duplicates are merged automatically).

## Where to put it

${placement || "Wherever a “Feedback” link belongs naturally (user menu, footer, help page…)."}

${
  sso
    ? `## What to do (with SSO pre-identification)

1. Add the "Feedback" button/link where described above.
2. Do NOT hardcode the board URL client-side: create a small server endpoint (e.g. \`GET /feedback\`) the button points to. It pre-identifies the signed-in user then redirects to the board — the user lands identified, no verification step.
3. In that endpoint, sign an **HS256** JWT with the secret below and redirect (302) to:
   \`${input.boardUrl}?sso=<jwt>\`
   JWT claims:
   - \`sub\` (required): the user's stable id on our side
   - \`email\` (recommended): their email
   - \`name\` (optional): their display name
   - \`exp\` (required): now + 10 minutes max — the JWT only serves the redirect
4. Store the secret in an environment variable (e.g. \`MINDDY_SSO_SECRET\`) — never client-side, never committed:
   \`\`\`
   ${input.ssoSecret}
   \`\`\`
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

// ── API serveur-à-serveur ────────────────────────────────────────────────────

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
   Authorization: Bearer $MINDDY_FEEDBACK_KEY
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
4. Stocke la clé dans une variable d'environnement \`MINDDY_FEEDBACK_KEY\` — jamais côté client, jamais commitée :
   \`\`\`
   ${input.apiKey}
   \`\`\`

## Vérification

- Envoie un retour de test depuis l'app : réponse 201.
- Il apparaît dans minddy → projet « ${input.projectName} » → onglet Feedback, attribué à l'utilisateur transmis.`;
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
   Authorization: Bearer $MINDDY_FEEDBACK_KEY
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
4. Store the key in a \`MINDDY_FEEDBACK_KEY\` environment variable — never client-side, never committed:
   \`\`\`
   ${input.apiKey}
   \`\`\`

## Verification

- Send a test feedback from the app: 201 response.
- It shows up in minddy → "${input.projectName}" project → Feedback tab, attributed to the user you passed.`;
}
