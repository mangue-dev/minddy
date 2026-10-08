---
{
  "id": "feedback-ingestion-and-sso",
  "locale": "en",
  "title": "Connect feedback ingestion and visitor SSO",
  "summary": "Keep integration keys server-side and sign short-lived identity tokens with a separate board secret.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/integration-contract.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/en/feedback-ingestion-and-sso-workflow.png",
      "alt": "Separate backend-ingestion and browser-SSO sequences with distinct secrets.",
      "caption": "The ingestion key authenticates server requests. The board SSO secret signs a short-lived, single-use visitor token.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

## Submit from your backend {#feedback-ingestion-and-sso}
The project owner creates a feedback integration key in project settings. Save the shown-once key as `MINDDY_FEEDBACK_KEY` in your backend's secret configuration. Never embed it in browser code. Use the origin of the target instance for `MINDDY_ORIGIN`, without a trailing slash.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Show the delivery date","body":"Our support team needs the planned date.","user":{"external_id":"demo-user-1","name":"Demo reader"}}'
```

Supply a non-empty title (200 characters maximum), optional body (10,000), and `user.external_id` and/or `user.email`. Limits are 255 characters for external ID, 254 for email and 200 for name. Your backend vouches for identity; anonymous ingestion is rejected. Success is HTTP 201 with post `id`, `status`, `review_state`, votes and pseudonym. The board need not be enabled for ingestion. `analyze` defaults to true; false bypasses moderation, categorization and merging for that post and sets its review state to `published` without waiting. That review state does not enable the board or bypass post visibility rules or spam status. The API creates public posts by default and does not accept a private-visibility parameter.

## Votes, failures and webhooks {#errors}
POST `{"user":{"external_id":"demo-user-1"}}` to `/api/v1/feedback/<id>/vote` with the same headers. One identity gets one vote; repeating the vote is idempotent. A merged post returns 409 `post_merged` naming its canonical target.

Creation allows 20 calls per minute per key, votes 60. Honor `Retry-After` on 429. Check 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` and 422 field errors before retrying. Creation is not an idempotent update: verify a lost response in the team's inbox before repeating. Feedback keys have no outbound issue webhook. A separately configured issues integration supports that channel, with its own signature and best-effort delivery contract.

## Identify browser visitors with SSO {#sso}
Enable the board and configure its separate SSO secret as owner. Your backend signs an HS256 JWT with stable `sub`, required `exp`, and optional email/name. Use at most 600 seconds lifetime and a unique `jti`; the verifier tolerates 60 seconds clock skew. Redirect to `/f/<board-token>?sso=<jwt>` immediately. Tokens are consumed once per board; a replay needs a freshly signed token. Never reuse the ingestion key as SSO secret. Keep tokens out of logs and shared screenshots.

Verify that the visitor opens My feedback under the intended identity. An expired token needs a fresh redirect. Rotate the board SSO secret with its confirmation when compromised and update the backend together. The email-code flow remains the alternative when SSO is unavailable.

![Separate backend-ingestion and browser-SSO sequences with distinct secrets.](/documentation/en/feedback-ingestion-and-sso-workflow.png)
