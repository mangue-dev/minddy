---
{
  "id": "integration-api-and-webhooks",
  "locale": "en",
  "title": "Create issues or feedback and receive signed webhooks",
  "summary": "The project owner creates an integration in project settings.",
  "topic": "Technical concepts",
  "type": "tutorial",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/api/v1/feedback/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "integration-troubleshooting",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/en/integration-api-and-webhooks-flow.svg",
      "alt": "Diagram: Server keeps the project integration key. POST issues or feedback with correct key kind. Owner selects an issues webhook destination. Receiver verifies raw-body HMAC and delivery UUID.",
      "caption": "Read the stages in order. Server keeps the project integration key. POST issues or feedback with correct key kind. Owner selects an issues webhook destination. Receiver verifies raw-body HMAC and delivery UUID.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow"
  ]
}
---

## Issue and revoke a server-side key {#integration-api-and-webhooks}

The project owner creates an integration in project settings. Choose issues for internal work entering triage or feedback for user requests with votes/public status. The plaintext mdy_ key is shown once. Store it only on your server, conventionally as MINDDY_API_KEY or MINDDY_FEEDBACK_KEY, never in a browser, source control or shared logs. Revocation is permanent and unknown/revoked keys both return 401 invalid_api_key. Keys are project-bound and their kind cannot call the other endpoint family (403 wrong_key_kind).


![Diagram: Server keeps the project integration key. POST issues or feedback with correct key kind. Owner selects an issues webhook destination. Receiver verifies raw-body HMAC and delivery UUID.](/documentation/en/integration-api-and-webhooks-flow.svg)

## Send input with the correct fields {#send}

Use GET /api/v1/issues/options for project category IDs and priority/effort values, then POST /api/v1/issues with a non-empty title, optional Markdown description, priority, effort and categories. Created work always enters triage; status, assignee and parent are not externally settable. Titles allow 500 characters, descriptions 65,536 and categories at most 50 IDs. A 201 response gives id, number, identifier and status. For feedback, POST /api/v1/feedback needs title and user.external_id and/or user.email; user.name and body are optional. analyze is a boolean defaulting to true. false disables moderation, categorization and duplicate merging together and publishes as-is; the string "false" is rejected. Inspect review_state and keep user identity verified by your server.

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Demo report","description":"Reproduce with demonstration data","priority":"low","effort":"s"}'
```

## Verify and deduplicate outbound events {#receive}

An issues integration can send issue.created, issue.status_changed and issue.updated. The project owner must choose a new webhook destination in settings; agents may tune existing events/scope or disable it, but cannot create a new outbound channel. Scope integration includes only this key’s issues; all includes every project issue. Verify X-Minddy-Signature as sha256= plus HMAC-SHA256 of the raw received bytes using the lowercase SHA-256 hex digest of the API key as HMAC key. Compare in constant time before trusting the payload. Do not parse and reserialize before hashing. X-Minddy-Delivery matches delivery_id; deduplicate by that UUID.

## Handle failures without inventing guarantees {#limits}

Delivery is best effort: a five-second timeout and one immediate retry on network errors or 5xx, then permanent drop. Duplicates and reordering are possible. Persist the verified payload, return 2xx promptly and process afterward. issue.updated batches changes; description/plan changes identify the field without values. Check the last delivery status in settings. HTTP 429 requires honoring Retry-After. Validation errors are 422; a reached issue quota is a definitive 403 issue_limit_reached. A timed-out creation can have succeeded, so inspect its outcome before retrying. Feedback voting uses POST `/api/v1/feedback/<post_id>/vote` and is idempotent per identity.
