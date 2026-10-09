---
{
  "id": "api-and-webhooks",
  "locale": "en",
  "title": "API, webhooks and feedback SSO",
  "summary": "Create issues or feedback through the integration API, verify signed webhooks and authenticate feedback visitors with SSO.",
  "topic": "Technical concepts",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07",
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/feedback/integration-contract.ts",
      "lib/server/integration-auth.ts",
      "lib/server/integrations.ts",
      "app/api/v1/issues/route.ts",
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "integration-troubleshooting",
    "minddy-mcp"
  ],
  "aliases": [
    "integration-api-and-webhooks",
    "feedback-ingestion-and-sso"
  ],
  "tags": [
    "Create issues or feedback and receive signed webhooks",
    "Connect feedback ingestion and visitor SSO"
  ],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/en/integration-api-and-webhooks-flow.svg",
      "alt": "Diagram: Server keeps the project integration key. POST issues or feedback with correct key kind. Owner selects an issues webhook destination. Receiver verifies raw-body HMAC and delivery UUID.",
      "caption": "Read the stages in order. Server keeps the project integration key. `POST` issues or feedback with correct key kind. Owner selects an issues webhook destination. Receiver verifies raw-body HMAC and delivery UUID.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Server keeps the project integration key"
          },
          {
            "title": "`POST` issues or feedback with correct key kind"
          },
          {
            "title": "Owner selects an issues webhook destination"
          },
          {
            "title": "Receiver verifies raw-body HMAC and delivery UUID"
          }
        ]
      }
    },
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/en/feedback-ingestion-and-sso-workflow.svg",
      "alt": "Separate backend-ingestion and browser-SSO sequences with distinct secrets.",
      "caption": "The ingestion key authenticates server requests. The board SSO secret signs a short-lived, single-use visitor token.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "columns",
        "title": "Two separate feedback flows",
        "columns": [
          {
            "title": "Server-side ingestion",
            "items": [
              "Backend keeps the feedback key",
              "`POST /api/v1/feedback` with Bearer key and stable user identity",
              "HTTP 201: saved post in team inbox; board may be disabled"
            ]
          },
          {
            "title": "Browser visitor SSO",
            "items": [
              "Backend keeps the separate board SSO secret",
              "Sign `HS256` JWT with `sub`, `exp` and unique `jti`; lifetime ≤ 600 s",
              "Redirect browser to `/f/<board-token>?sso=<jwt>`",
              "One-time token creates visitor session; open My feedback"
            ]
          }
        ],
        "note": "Never send the ingestion key or SSO secret to browser code. Clock skew tolerance: 60 s."
      }
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow",
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

The integration API accepts server-side issue or feedback submissions with project-bound keys. Issues integrations can also send signed webhooks; feedback visitor SSO uses a separate board secret. Follow the relevant endpoint, identity and delivery checks: keys stay on the server, and SSO redirect tokens must stay out of shared logs.

## Create issues or feedback and receive signed webhooks {#integration-api-and-webhooks}

The project owner creates an integration in project settings. Choose `issues` for internal work entering triage or `feedback` for user requests with votes/public status. The plaintext `mdy_` key is shown once. Store it only on your server, conventionally as `MINDDY_API_KEY` or `MINDDY_FEEDBACK_KEY`, never in a browser, source control or shared logs. Revocation is permanent and unknown/revoked keys both return 401 `invalid_api_key`. Keys are project-bound and their kind cannot call the other endpoint family (403 `wrong_key_kind`).


![Diagram: Server keeps the project integration key. POST issues or feedback with correct key kind. Owner selects an issues webhook destination. Receiver verifies raw-body HMAC and delivery UUID.](/documentation/en/integration-api-and-webhooks-flow.svg)

### Send input with the correct fields {#send}

Use `GET /api/v1/issues/options` for project category IDs and `priority`/`effort` values. Then `POST /api/v1/issues` with a non-empty `title` and optional Markdown `description`, `priority`, `effort` and `categories`.

| Field | Limit |
| --- | --- |
| Title | 500 characters |
| Description | 65,536 characters |
| Categories | 50 IDs |

Created work always enters triage; `status`, `assignee` and `parent` are not externally settable. A 201 response gives `id`, `number`, `identifier` and `status`. For feedback fields, identity checks and moderation, use the [feedback ingestion procedure](#feedback-ingestion-and-sso).

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Demo report","description":"Reproduce with demonstration data","priority":"low","effort":"s"}'
```

### Verify and deduplicate outbound events {#receive}

An `issues` integration can send `issue.created`, `issue.status_changed` and `issue.updated`. The project owner must choose a new webhook destination in settings; agents may tune existing events/scope or disable it, but cannot create a new outbound channel. Scope `integration` includes only this key’s issues; `all` includes every project issue. Verify `X-minddy-Signature` as `sha256=` plus HMAC-SHA256 of the raw received bytes using the lowercase SHA-256 hex digest of the API key as HMAC key. Compare in constant time before trusting the payload. Do not parse and reserialize before hashing. `X-minddy-Delivery` matches `delivery_id`; deduplicate by that UUID.

### Handle failed requests and delivery limits {#limits}

Delivery is best effort: a five-second timeout and one immediate retry on network errors or 5xx, then permanent drop. Duplicates and reordering are possible. Persist the verified payload, return 2xx promptly and process afterward. `issue.updated` batches changes; `description`/`plan` changes identify the field without values. Check the last delivery status in settings. HTTP 429 requires honoring `Retry-After`. Validation errors are 422; a reached issue quota is a definitive 403 `issue_limit_reached`. A timed-out creation can have succeeded, so inspect its outcome before retrying. Feedback voting has its [own endpoint and limits](#errors).

## Connect feedback ingestion and visitor SSO {#feedback-ingestion-and-sso}

The project owner creates a feedback integration key in project settings. Save the shown-once key as `MINDDY_FEEDBACK_KEY` in your backend's secret configuration. Never embed it in browser code. Use the origin of the target instance for `MINDDY_ORIGIN`, without a trailing slash.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Show the delivery date","body":"Our support team needs the planned date.","user":{"external_id":"demo-user-1","name":"Demo reader"}}'
```

Supply a non-empty `title` (200 characters maximum), optional `body` (10,000), and `user.external_id` and/or `user.email`. `user.name` is optional. Limits are 255 characters for external ID, 254 for email and 200 for name. Your backend vouches for identity; anonymous ingestion is rejected. Success is HTTP 201 with post `id`, `status`, `review_state`, `votes` and pseudonym. The board need not be enabled for ingestion. `analyze` is a boolean defaulting to `true`; the string `"false"` is rejected. Set it to `false` to bypass moderation, categorization and duplicate merging for that post and give it the review state `published` without waiting. That review state does not enable the board or bypass post visibility rules or spam status. The API creates public posts by default and does not accept a private-visibility parameter.

### Votes, failures and webhooks {#errors}

`POST` `{"user":{"external_id":"demo-user-1"}}` to `/api/v1/feedback/<id>/vote` with the same headers. One identity gets one vote; repeating the vote is idempotent. A merged post returns 409 `post_merged` naming its canonical target.

Creation allows 20 calls per minute per key, votes 60. Honor `Retry-After` on 429. Check 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` and 422 field errors before retrying. Creation is not an idempotent update: verify a lost response in the team's inbox before repeating. Feedback keys have no outbound issue webhook. A separately configured `issues` integration supports that channel, with its own signature and best-effort delivery contract.

### Identify browser visitors with SSO {#sso}

Enable the board and configure its separate SSO secret as owner. Your backend signs an `HS256` JWT with stable `sub`, required `exp`, and optional `email`/`name`. Use at most 600 seconds lifetime and a unique `jti`; the verifier tolerates 60 seconds clock skew. Redirect to `/f/<board-token>?sso=<jwt>` immediately. Tokens are consumed once per board; a replay needs a freshly signed token. Never reuse the ingestion key as SSO secret. Keep tokens out of logs and shared screenshots.

Verify that the visitor opens My feedback under the intended identity. An expired token needs a fresh redirect. Rotate the board SSO secret with its confirmation when compromised and update the backend together. The email-code flow remains the alternative when SSO is unavailable.

![Separate backend-ingestion and browser-SSO sequences with distinct secrets.](/documentation/en/feedback-ingestion-and-sso-workflow.svg)
