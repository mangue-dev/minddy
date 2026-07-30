/**
 * Le contrat de l'API d'intégration, sous forme de données (MIN-106).
 *
 * Une clé d'intégration ne sert à rien sans le format qui va avec. Jusqu'ici ce
 * format n'existait qu'en prose, dans le prompt d'intégration copié depuis
 * l'interface (`lib/server/feedback/integration-prompt.ts`) : très bien pour un
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

/** Usage dédié d'une clé : créer des issues directement, ou déposer du feedback. */
export type IntegrationKind = "issues" | "feedback";

export function isIntegrationKind(value: unknown): value is IntegrationKind {
  return value === "issues" || value === "feedback";
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
  errors: Array<{ status: number; code: string; meaning: string }>;
  rules: string[];
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
      env_var: "MINDDY_FEEDBACK_KEY",
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
      env_var: "MINDDY_API_KEY",
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
          priority: "Optional: none | urgent | high | medium | low.",
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
    ],
  };
}
