# Error tracking — decision and contract (MIN-542)

minddy reports unhandled errors to **PostHog Error Tracking**. This document
records the decision, the cost model, and the exact activation contract for
self-hosted instances.

## Decision: PostHog, not Sentry

Three candidates were weighed: PostHog (already integrated), Sentry, and
lightweight alternatives (GlitchTip, Highlight, self-hosted open source).

PostHog was chosen because it is already minddy's analytics substrate and its
Error Tracking product is a first-class, generally available feature:

- **No new vendor.** The browser SDK (`posthog-js`) and the server SDK
  (`posthog-node`) are already shipped and already carry the consent
  framework, the sanitization rules, and the self-hosted gating. Sentry would
  have added a second SDK to the client bundle, a second consent/PII surface
  in the privacy documentation, and a second set of environment variables —
  for no capability PostHog lacks.
- **One project per environment.** Exceptions land next to the product
  analytics events they relate to, grouped into issues in the same web app,
  with the same EU hosting (`eu.posthog.com`).
- **Both sides of the stack are covered** by the SDKs minddy already uses:
  `posthog-js` exception autocapture for the browser, `posthog-node`
  `captureExceptionImmediate` for the server.

## Cost

PostHog bills error tracking as events, with a generous free tier: the first
**100,000 exceptions per month are free**, then usage-based pricing with
optional billing limits to cap any surprise. No credit card is required and
there is no per-seat fee. minddy's exception volume is far below the free
tier; the EU cloud project is the same one analytics already uses.

## Activation contract (self-hosted, opt-in)

Error tracking is **disabled by default, self-hosted included**, through two
independent gates:

1. **PostHog pairs** (`MINDDY_PUBLIC_POSTHOG_KEY`/`MINDDY_PUBLIC_POSTHOG_HOST`,
   optionally `POSTHOG_API_KEY`/`POSTHOG_HOST` for the server). These are the
   master switch: absent keys mean no PostHog SDK is initialized anywhere and
   nothing leaves the instance. Self-hosted instances have no keys by default.
2. **The explicit error-tracking flag** `MINDDY_PUBLIC_ERROR_TRACKING=1`.
   Even with keys configured, exceptions are only reported when the operator
   sets this flag. It defaults to off everywhere.

| Goal | Action |
| --- | --- |
| Enable in self-hosted | Set the PostHog pair(s) **and** `MINDDY_PUBLIC_ERROR_TRACKING=1` |
| Disable error tracking, keep analytics | Unset `MINDDY_PUBLIC_ERROR_TRACKING` |
| Disable everything PostHog | Unset the PostHog pair(s) |

## What is captured

| Surface | Mechanism | Content |
| --- | --- | --- |
| Browser (unhandled) | `posthog-js` exception autocapture, enabled by the flag in `components/posthog-init.tsx` | Window errors and unhandled promise rejections |
| Browser (React boundary) | `captureClientException` from `app/error.tsx` via `lib/analytics.ts` | Render errors, which React swallows before the window listener |
| Server (request context) | `onRequestError` hook in `instrumentation.ts` → `lib/server/error-tracking.ts` | Route handlers, server actions, RSC rendering errors |
| Server (handled preference read) | `captureServerException` from `/api/assistant/models` | Personal Numo preference read failures; the model catalog remains available with an unknown default |
| Server (handled preference read, settings) | `captureServerException` from `GET /api/account/numo-preferences` | The same read failure behind the AI settings alert, answered with a 503 |
| Server (background) | `enableExceptionAutocapture` on the shared `posthog-node` client | Uncaught exceptions and unhandled rejections outside requests (crons, agent code) |
| Server (AI providers) | `reportProviderError` in `lib/server/ai-provider-errors.ts`, called by `fetchAiChat` and the direct OpenRouter callers (web search, FAQ answer, demo dictation) | Every final non-OK provider response and in-stream provider error, after the documented replays |
| Server (Numo turns) | `captureBackgroundException` from `lib/server/numo/turns.ts` | A turn that ends `failed` or `retryable` for a reason other than a provider rejection (completion repairs exhausted, idle stream, internal error) |

Server exception context carries template facts: `route_path` (the route
template, never the concrete URL or query), `route_type`, `http_method`, and
an optional revalidate reason. `DatabaseOperationError` also supplies
`failure_kind`, an optional validated SQL/PostgREST/transport `failure_code`,
and an optional HTTP `failure_status`. Its exception message names the operation;
the wrapper does not retain upstream database messages, hints or row values.
These fields distinguish a missing migration from a permission error or timeout.
Provider failures (MIN-826) carry `surface`, `provider`, `model`,
`provider_status` (HTTP status, null for an in-stream error) and
`provider_error_type`. The exception message is structural
(`anthropic 400 invalid_request_error for claude-opus-5-5`); the provider's
own message may quote request content, so it stays in the server log
(`[ai-provider] request_failed`) and in the user's encrypted turn error. Numo
turn failures carry `surface: numo_turn`, `turn_status` and `model`.
Background captures attach to no distinct id and create no person profile.
A client that leaves mid-response (`AbortError`, Next.js `ResponseAborted`, or
React's generic `The destination stream closed early.`) is not reported: it is
navigation noise, not a server failure (MIN-763).
The `distinct_id` comes from the visitor's
PostHog cookie when present, and no person profile is created for anonymous
ids. Console output is never captured (`capture_console_errors: false`), and
neither DOM autocapture nor session recording is enabled.

Reliability details: the server path uses `captureExceptionImmediate` and is
awaited inside the hook, because a serverless function can freeze as soon as
the hook returns; client errors thrown before the SDK finishes loading are
queued in `lib/analytics.ts` and replayed on init. All reporting failures are
swallowed — tracking never compounds the error it reports.

## Privacy

Browser exceptions follow the existing consent contract
(`components/posthog-init.tsx`): with no cookie choice the SDK keeps
persistence in memory and writes nothing on the device; a refusal triggers
`opt_out_capturing()`, which silences exceptions with everything else. The
GDPR sub-processor inventory (`docs/rgpd/`) describes the
exception flow.

## Not covered / follow-ups

- **Electron main process.** The desktop app's Node code does not report to
  PostHog; renderer errors on remote instances are covered by the browser
  surfaces above.
- **Source maps.** Production stacks are minified; readable stack traces
  require uploading source maps (PostHog CLI, during the release build, with
  a write-only token). Deliberately deferred: the raw stacks are still
  grouped into issues, only less readable.
