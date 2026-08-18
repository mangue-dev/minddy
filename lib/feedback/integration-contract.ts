/**
 * The integration API contract, in data form (MIN-106).
 *
 * An integration key is useless without the format that goes with it. Until now this
 * format only existed in prose, in the integration prompt copied from
 * the interface (`lib/server/integration-prompt.ts`): very good for a
 * human who pastes a prompt, unusable for an agent who has just called a
 * tool and must write the HTTP call in the stride.
 *
 * We therefore describe the contract once, in structured form, and the two agent surfaces
 * return the SAME object with the key they have just created:
 * Numo in the chat, the MCP server in the user's IDE. An agent no longer has to guess the endpoint, the name of the identity field or the error codes —
 * nor, above all, to invent them.
 *
 * Pure module (no `server-only`, no database access): this is what makes
 * testable, and testable here is the only guarantee that the description sticks to the
 * routes of `app/api/v1/`.
 */

import { FEEDBACK_BODY_MAX, FEEDBACK_TITLE_MAX } from "@/lib/feedback/types";
import { envLine } from "@/lib/feedback/env-lines";

/** Dedicated use of a key: create issues directly, or submit feedback. */
export type IntegrationKind = "issues" | "feedback";

export function isIntegrationKind(value: unknown): value is IntegrationKind {
  return value === "issues" || value === "feedback";
}

/**
 * The environment variable where the key of each kind is expected. A name, not
 * a suggestion: it is the one that the integration prompt cites (it no longer carries
 * the key), the one that the interface offers for copying, and the one that the
 * contract below announces to agents. All three should read the same constant, without
 * so the code written by the agent will look for a variable that the user has
 * not filled in.
 */
export const INTEGRATION_ENV_VAR: Record<IntegrationKind, string> = {
  feedback: "MINDDY_FEEDBACK_KEY",
  issues: "MINDDY_API_KEY",
};

/** The `.env` line of a freshly created key — displayed as pasted. */
export function integrationKeyEnvLine(kind: IntegrationKind, key: string): string {
  return envLine(INTEGRATION_ENV_VAR[kind], key);
}

export interface IntegrationEndpointDoc {
  method: "GET" | "POST";
  url: string;
  /** What the call does, in one sentence. */
  purpose: string;
  /** Field → description, as expected in the JSON body. */
  request_body?: Record<string, string>;
  /** Form of response on success. */
  response: string;
}

export interface IntegrationUsage {
  kind: IntegrationKind;
  auth: {
    header: string;
    /** Recommended environment variable name — agent writes to `.env`. */
    env_var: string;
    note: string;
  };
  endpoints: IntegrationEndpointDoc[];
  /**
 * The REVERSE meaning: minddy which recalls the application. Reserved for
 * 'issues' keys — a webhook only carries issue events, and a
 * 'feedback' key does not create any. Absent, therefore, from the contract of a feedback key.
 */
  webhook?: IntegrationWebhookDoc;
  errors: Array<{ status: number; code: string; meaning: string }>;
  rules: string[];
}

/**
 * The outgoing webhook, described from the point of view of who RECEIVES it.
 *
 * An 'issues' key has two directions of circulation, and the second was documented
 * nowhere: the application pushes into minddy by `/api/v1/issues`, and minddy
 * calls her back when the tickets move. An agent that only knows the first
 * writes a polling loop — while the receiver is a route.
 *
 * A 'feedback' key has no webhook: it does not create an issue, so
 * there would be nothing to deliver. What it deposits lives on the board.
 *
 * What the receiver can NOT guess and which is here: the HMAC key is
 * not the API key but its fingerprint, delivery is best-effort (so its
 * handler must be idempotent), and a record that touches multiple
 * fields produces only one delivery.
 */
export interface IntegrationWebhookDoc {
  purpose: string;
  /** Where it is turned on — the agent does not guess that there is a setting. */
  configure: string;
  events: Array<{ name: string; when: string }>;
  scopes: Array<{ value: string; meaning: string }>;
  /** Headers of the outgoing request, value as it arrives. */
  headers: Record<string, string>;
  /** How to check `X-Minddy-Signature`. */
  signature: string;
  /** Champ → contenu du corps JSON. */
  payload: Record<string, string>;
  /** What the receiver must take as true about deliveries. */
  delivery: string[];
}

/** The name of the signature header — read by the receiver, written by
 * `lib/server/webhooks.ts`. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Minddy-Signature";

export function integrationWebhookDoc(): IntegrationWebhookDoc {
  return {
    purpose:
      "The other direction: minddy POSTs signed JSON to an endpoint of YOUR app " +
      "when issues move, so you react to triage decisions instead of polling.",
    configure:
      "On an 'issues' key only — a 'feedback' key creates no issue, so it has no " +
      "webhook. Per integration, and off by default: the destination is set by " +
      "the project owner, in the project's settings (Integrations → Webhook) — " +
      "an outbound channel for everything happening on the project is a human " +
      "choice, so no agent or API can point it somewhere new. " +
      "minddy_configure_webhook tunes the events and the scope of the " +
      "destination already in place, and an empty url turns it off, keeping " +
      "them for later.",
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

/** Errors common to both kinds — authentication and throughput. */
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
 * The full contract for a given key. `origin` is the origin of minddy
 * (`SITE_URL` in production): URLs are absolute because the agent that reads them
 * reads code against them from another repository.
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
    // No `webhook` here: it only delivers outcome events.
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
