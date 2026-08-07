/**
 * Le contrat de l'API d'intégration, sous forme de données (MIN-106).
 *
 * Une clé d'intégration ne sert à rien sans le format qui va avec. Jusqu'ici ce
 * format n'existait qu'en prose, dans le prompt d'intégration copié depuis
 * l'interface (`lib/server/integration-prompt.ts`) : très bien pour un
 * humain qui colle un prompt, inexploitable pour un agent qui vient d'appeler un
 * outil et doit écrire l'appel HTTP dans la foulée.
 *
 * On décrit donc le contrat une fois, en structuré, et les deux surfaces
 * d'agent renvoient le MÊME objet avec la clé qu'elles viennent de créer :
 * Numo dans le chat, le serveur MCP dans l'IDE de l'utilisateur. Un agent n'a
 * plus à deviner l'endpoint, le nom du champ d'identité ni les codes d'erreur —
 * ni, surtout, à les inventer.
 *
 * Module pur (pas de `server-only`, aucun accès base) : c'est ce qui le rend
 * testable, et testable est ici la seule garantie que la description colle aux
 * routes de `app/api/v1/`.
 */

import { FEEDBACK_BODY_MAX, FEEDBACK_TITLE_MAX } from "@/lib/feedback/types";
import { envLine } from "@/lib/feedback/env-lines";

/** Usage dédié d'une clé : créer des issues directement, ou déposer du feedback. */
export type IntegrationKind = "issues" | "feedback";

export function isIntegrationKind(value: unknown): value is IntegrationKind {
  return value === "issues" || value === "feedback";
}

/**
 * La variable d'environnement où la clé de chaque kind est attendue. Un nom, pas
 * une suggestion : c'est celui que le prompt d'intégration cite (il ne porte plus
 * la clé), celui que l'interface propose à la copie, et celui que le contrat
 * ci-dessous annonce aux agents. Les trois doivent lire la même constante, sans
 * quoi le code écrit par l'agent cherchera une variable que l'utilisateur n'a
 * pas remplie.
 */
export const INTEGRATION_ENV_VAR: Record<IntegrationKind, string> = {
  feedback: "MINDDY_FEEDBACK_KEY",
  issues: "MINDDY_API_KEY",
};

/** La ligne de `.env` d'une clé fraîchement créée — affichée telle qu'on la colle. */
export function integrationKeyEnvLine(kind: IntegrationKind, key: string): string {
  return envLine(INTEGRATION_ENV_VAR[kind], key);
}

export interface IntegrationEndpointDoc {
  method: "GET" | "POST";
  url: string;
  /** Ce que fait l'appel, en une phrase. */
  purpose: string;
  /** Champ → description, tel qu'attendu dans le corps JSON. */
  request_body?: Record<string, string>;
  /** Forme de la réponse en cas de succès. */
  response: string;
}

export interface IntegrationUsage {
  kind: IntegrationKind;
  auth: {
    header: string;
    /** Nom de variable d'environnement recommandé — l'agent écrit dans `.env`. */
    env_var: string;
    note: string;
  };
  endpoints: IntegrationEndpointDoc[];
  /**
   * Le sens INVERSE : minddy qui rappelle l'application. Réservé aux clés
   * 'issues' — un webhook ne porte que des événements d'issue, et une clé
   * 'feedback' n'en crée aucune. Absent, donc, du contrat d'une clé feedback.
   */
  webhook?: IntegrationWebhookDoc;
  errors: Array<{ status: number; code: string; meaning: string }>;
  rules: string[];
}

/**
 * Le webhook sortant, décrit du point de vue de qui le REÇOIT.
 *
 * Une clé 'issues' a deux sens de circulation, et le second se documentait
 * nulle part : l'application pousse dans minddy par `/api/v1/issues`, et minddy
 * la rappelle quand les tickets bougent. Un agent qui ne connaît que le premier
 * écrit une boucle de polling — alors que le récepteur tient en une route.
 *
 * Une clé 'feedback', elle, n'a pas de webhook : elle ne crée pas d'issue, donc
 * il n'y aurait rien à livrer. Ce qu'elle dépose vit sur le board.
 *
 * Ce que le récepteur ne peut PAS deviner et qui est ici : la clé du HMAC n'est
 * pas la clé d'API mais son empreinte, la livraison est best-effort (donc son
 * handler doit être idempotent), et un enregistrement qui touche plusieurs
 * champs ne produit qu'une seule livraison.
 */
export interface IntegrationWebhookDoc {
  purpose: string;
  /** Où on l'allume — l'agent ne devine pas qu'il existe un réglage. */
  configure: string;
  events: Array<{ name: string; when: string }>;
  scopes: Array<{ value: string; meaning: string }>;
  /** En-têtes de la requête sortante, valeur telle qu'elle arrive. */
  headers: Record<string, string>;
  /** Comment vérifier `X-Minddy-Signature`. */
  signature: string;
  /** Champ → contenu du corps JSON. */
  payload: Record<string, string>;
  /** Ce que le récepteur doit tenir pour vrai des livraisons. */
  delivery: string[];
}

/** Le nom de l'en-tête de signature — lu par le récepteur, écrit par
 *  `lib/server/webhooks.ts`. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Minddy-Signature";

export function integrationWebhookDoc(): IntegrationWebhookDoc {
  return {
    purpose:
      "The other direction: minddy POSTs signed JSON to an endpoint of YOUR app " +
      "when issues move, so you react to triage decisions instead of polling.",
    configure:
      "On an 'issues' key only — a 'feedback' key creates no issue, so it has no " +
      "webhook. Per integration, and off by default: set it in the project's " +
      "settings (Integrations → Webhook) or over MCP with " +
      "minddy_configure_webhook. An empty url turns it off and keeps the events " +
      "and scope for later.",
    events: [
      { name: "issue.created", when: "An issue was created in the project." },
      {
        name: "issue.status_changed",
        when:
          "An issue's status changed. The body carries `change`: " +
          "{ field: 'status', from, to }.",
      },
      {
        name: "issue.updated",
        when:
          "Any other field changed — title, priority, effort, assignee, due date, " +
          "categories, sub-issues, description, plan. The body carries `changes`, " +
          "an array of { field, from, to }; description and plan record the field " +
          "name only, never their values.",
      },
    ],
    scopes: [
      {
        value: "integration",
        meaning:
          "Only the issues this key itself created — `issue.created_via_integration` " +
          "is then always true. The usual choice for an app that only cares about " +
          "what it reported.",
      },
      {
        value: "all",
        meaning:
          "Every issue of the project, whoever created it — a person in the app, " +
          "another integration, or minddy's own agent.",
      },
    ],
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "minddy-webhooks",
      "X-Minddy-Event": "The event name, same as `event` in the body.",
      "X-Minddy-Delivery":
        "A UUID unique to this delivery, same as `delivery_id` in the body.",
      [WEBHOOK_SIGNATURE_HEADER]:
        "`sha256=` followed by the HMAC of the raw body, in lowercase hex.",
    },
    signature:
      "The HMAC key is NOT the API key: it is the SHA-256 hex digest of that key, " +
      "lowercase — the only form minddy keeps, the plaintext is never stored. " +
      "Verify with hmac_sha256(RAW request body, sha256_hex(<your API key>)) and " +
      "compare it to the hex after 'sha256=', in constant time. Hash the bytes as " +
      "received: parsing the JSON and re-serialising it changes them.",
    payload: {
      event: "The event name — one of the events above.",
      delivery_id: "UUID, the same as the X-Minddy-Delivery header.",
      timestamp: "ISO 8601, when the batch was dispatched.",
      project: "{ id, name, key } — key is the identifier prefix, e.g. 'MIND'.",
      integration: "{ id, name } — the integration this webhook belongs to.",
      issue:
        "{ id, number, identifier ('MIND-42'), title, status, priority, effort, " +
        "created_via_integration }.",
      change: "issue.status_changed only: { field: 'status', from, to }.",
      changes: "issue.updated only: an array of { field, from, to }.",
    },
    delivery: [
      "Best effort, no queue: 5 second timeout, ONE immediate retry on a network " +
        "error or a 5xx, then the delivery is dropped for good.",
      "Answer 2xx as soon as you hold the payload and do the work afterwards — a " +
        "slow endpoint loses deliveries.",
      "A delivery can arrive twice (a timeout that did land, a 5xx after the fact) " +
        "and deliveries are not ordered: key your handler on delivery_id.",
      "One save that changes several fields is ONE issue.updated delivery carrying " +
        "every change, not one per field.",
      "The status of the last attempt is shown on the integration, in the project's " +
        "settings.",
    ],
  };
}

/** Erreurs communes aux deux kinds — l'authentification et le débit. */
function sharedErrors(kind: IntegrationKind) {
  return [
    { status: 401, code: "invalid_api_key", meaning: "Missing, unknown or revoked key." },
    {
      status: 403,
      code: "wrong_key_kind",
      meaning: `This key is not a '${kind}' key — a key serves one endpoint family only.`,
    },
    { status: 400, code: "invalid_json", meaning: "The request body is not valid JSON." },
    {
      status: 429,
      code: "rate_limited",
      meaning: "Too many requests for this key. Honour the Retry-After header.",
    },
  ];
}

/**
 * Le contrat complet pour une clé donnée. `origin` est l'origine de minddy
 * (`SITE_URL` en production) : les URL sont absolues parce que l'agent qui les
 * lit code contre elles depuis un autre dépôt.
 */
export function integrationUsage(
  kind: IntegrationKind,
  origin: string
): IntegrationUsage {
  const base = origin.replace(/\/$/, "");
  return kind === "feedback" ? feedbackUsage(base) : issuesUsage(base);
}

const IDENTITY_FIELD =
  "Required object identifying the end user. external_id (your stable user id) " +
  "and/or email is required — feedback is never anonymous, your server vouches " +
  "for the identity. Optional: name.";

const ANALYZE_FIELD =
  "Optional boolean, defaults to true: let minddy's AI (Numo) review the post " +
  "before it goes public. Pass false only when you run your own classifier — " +
  "it is one single pass, so false turns off moderation, categorisation AND " +
  "automatic duplicate merging together, and the post is published as-is. " +
  "Strictly a boolean: the string \"false\" is rejected, not coerced.";

function feedbackUsage(base: string): IntegrationUsage {
  return {
    kind: "feedback",
    auth: {
      header: "Authorization: Bearer <key>",
      env_var: INTEGRATION_ENV_VAR.feedback,
      note: "Server-side only. Never ship the key to a browser, never commit it.",
    },
    endpoints: [
      {
        method: "POST",
        url: `${base}/api/v1/feedback`,
        purpose:
          "Submit a user request to the project's feedback board, on that user's behalf.",
        request_body: {
          title: `Required, non-empty, at most ${FEEDBACK_TITLE_MAX} characters.`,
          body: `Optional description, at most ${FEEDBACK_BODY_MAX} characters.`,
          user: IDENTITY_FIELD,
          analyze: ANALYZE_FIELD,
        },
        response:
          '201 { id, title, status, review_state, votes, user: { pseudonym } } — ' +
          '"pseudonym" is the anonymised name shown on the public board; ' +
          'review_state is "pending" while minddy\'s AI reviews the post and ' +
          '"published" once it is live on the board (immediately when analyze is false).',
      },
      {
        method: "POST",
        url: `${base}/api/v1/feedback/<post_id>/vote`,
        purpose:
          "Vote on an existing post on a user's behalf. One identity = one vote; voting twice is idempotent.",
        request_body: { user: IDENTITY_FIELD },
        response: "200 { ok: true }",
      },
    ],
    // Pas de `webhook` ici : il ne livre que des événements d'issue.
    errors: [
      ...sharedErrors("feedback"),
      { status: 422, code: "title_required", meaning: "title is empty." },
      {
        status: 422,
        code: "title_too_long",
        meaning: `title exceeds ${FEEDBACK_TITLE_MAX} characters.`,
      },
      {
        status: 422,
        code: "body_too_long",
        meaning: `body exceeds ${FEEDBACK_BODY_MAX} characters.`,
      },
      { status: 422, code: "user_required", meaning: "The user object is missing." },
      {
        status: 422,
        code: "user_identity_required",
        meaning: "Neither user.external_id nor user.email was given.",
      },
      { status: 422, code: "invalid_email", meaning: "user.email is not an email address." },
      {
        status: 422,
        code: "invalid_analyze",
        meaning: "analyze was given but is not a boolean (no coercion — \"false\" is rejected).",
      },
      { status: 404, code: "not_found", meaning: "Unknown feedback post (vote)." },
      {
        status: 409,
        code: "post_merged",
        meaning:
          "That post was merged into another; the canonical post id is in the message — vote on it instead.",
      },
    ],
    rules: [
      "Posts land on the project's feedback board, not in the issue list: they are user needs with votes and a public status, not tasks.",
      "minddy deduplicates automatically — do not try to search for an existing post before submitting, just submit.",
      "The board must be enabled for the public page to exist, but collection through this API works either way.",
      "Leave analyze alone unless the user explicitly told you they classify feedback themselves: the default review is what moderates a public board, and turning it off publishes whatever is submitted, unmoderated.",
      "Even with analyze false, the post is still embedded — that is what lets OTHER posts find it as a duplicate candidate and powers the 'this may already exist' hint on the public board. Only the AI review pass is skipped.",
    ],
  };
}

function issuesUsage(base: string): IntegrationUsage {
  return {
    kind: "issues",
    auth: {
      header: "Authorization: Bearer <key>",
      env_var: INTEGRATION_ENV_VAR.issues,
      note: "Server-side only. Never ship the key to a browser, never commit it.",
    },
    endpoints: [
      {
        method: "POST",
        url: `${base}/api/v1/issues`,
        purpose: "Create an issue in the project. It lands in 'triage' for human validation.",
        request_body: {
          title: "Required, non-empty.",
          description: "Optional markdown.",
          priority: "Optional: none | low | medium | high | urgent.",
          effort: "Optional t-shirt size: xs | s | m | l | xl.",
          categories: "Optional array of category ids, from GET /api/v1/issues/options.",
        },
        response: "201 { id, number, identifier, status } — identifier reads 'KEY-42'.",
      },
      {
        method: "GET",
        url: `${base}/api/v1/issues/options`,
        purpose:
          "List what the project accepts: its categories (id, name, color) and the priority/effort enums.",
        response: "200 { project, categories, priorities, efforts }",
      },
    ],
    webhook: integrationWebhookDoc(),
    errors: [
      ...sharedErrors("issues"),
      { status: 422, code: "title_required", meaning: "title is empty." },
      { status: 422, code: "invalid_priority", meaning: "priority is not one of the enum values." },
      { status: 422, code: "invalid_effort", meaning: "effort is not one of the enum values." },
      {
        status: 422,
        code: "unknown_category",
        meaning:
          "categories is not an array of ids, or names an id that is not one of the project's.",
      },
      {
        status: 403,
        code: "issue_limit_reached",
        meaning:
          "The project hit the issue quota of its owner's plan. Definitive, not transient: stop retrying and tell the user their plan is full.",
      },
    ],
    rules: [
      "Status, assignee and parent are not settable from outside: every issue created this way lands in 'triage'.",
      "Use this kind for reporting into the backlog (crash reports, support escalations). For end-user requests that deserve votes and a public status, create a 'feedback' key instead.",
      "What you push comes back: point this integration's webhook at your app and you are told when a human triages one of your issues — see `webhook`. Never poll the API for that.",
    ],
  };
}
