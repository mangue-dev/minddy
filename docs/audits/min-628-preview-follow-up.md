# MIN-628 and MIN-610 preview follow-up

The later authenticated Assistant Shell reproduction and first-click correction
are recorded in [the shell Stop follow-up](min-628-shell-stop-follow-up.md).

The first PR verification covered provider transports and worker cancellation,
but missed the browser's request lifecycle. The reported preview failure remains
the acceptance case. These changes address additional reproducible application
failures without requiring a new database migration.

## Findings and changes

- A first-send Stop aborted HTTP before a conversation ID was available and
  returned without sending server cancellation. The client now creates a private
  prospective conversation ID and keeps the exact request ID through admission
  and cancellation. A stopped row in the existing turn table prevents admission
  or execution even when Stop arrives first.
- Steering a worker continues its existing parent turn rather than admitting
  the new submission as a model turn. Stop now records the submission receipt
  and retires its exact authorized parent. Checks on both sides of worker-message
  persistence cover Stop before headers or before the association is available.
- Disconnecting the hosted response before the separate Stop request reached
  execution could suspend provider cleanup. The client freezes its projection
  immediately and retains that response until the execution terminates. Server
  cancellation revokes the claim itself instead of waiting for the old executor
  to acknowledge `stopping` during the six-minute recovery window.
- SSE event names were reset at each HTTP read. An `event:` line and its `data:`
  line in different packets lost the event, including early content. The parser
  now retains event state across arbitrary bytes and UTF-8 boundaries.
- In-flight status responses could restore generation after Stop or Reset.
  Poll, stream and reconciliation results are checked against their originating
  request or projection generation before they update the UI. Post-Stop quiet
  polls also skip journal projection so newly persisted deltas cannot revive it.
- Recovered readers received no durable content until a later event boundary.
  The encrypted journal now publishes content and reasoning in serialized
  batches every 250 ms while generation is active.
- Explicit OpenRouter configuration built a complete account model picker,
  rereading endpoint credentials, default settings, recommendations and billing.
  Admission now uses the same filtered shared model index directly and enforces
  the plan once using the already resolved billing snapshot. Availability,
  capability, variant, reasoning and quota checks remain in place.
- Stop during a slow generation budget check could be followed by a new provider
  request. Cancellation now covers preparation and is checked again before
  provider connection establishment. Auxiliary title requests also accept owner
  cancellation and are skipped for pre-admission stopped turns.
- A BYOK worker insertion could commit after the global stop cascade had read
  its worker set. A scoped post-insert parent check interrupts that missed worker;
  a failed parent read also requests interruption before returning an error.
  Previously queued siblings remain claimable after an individual worker stop.

## Evidence

`min-628-glm-low-evidence.json` contains bounded calls with the local production
OpenRouter key and **z-ai/glm-5.3-flash, low reasoning**. No key, account identity
or conversation content is stored in the evidence.

| Measurement | Result |
| --- | --- |
| Direct OpenRouter first content | 1,178 ms |
| Minddy provider transport first content | 3,446 ms |
| Minddy transport with actual Numo tool definitions | 1,886 ms |
| Pending read released after cancellation | 4 ms |
| Provider generation inspection | Parasail, `cancelled=true`, one completion token |
| Real admission dependencies, cold | 1,633 ms |
| Real admission dependencies, warm | 415 ms |

The admission measurement uses the historical MIN-623 owner's real module
dependencies with production database reads. A transport guard permits GET/HEAD
and the read-only usage RPC and rejects database mutations. No production schema
or application data was changed by this measurement.

UI regressions against the previous PR head reproduced a dropped fragmented
first token and a stale poll restarting generation. The new tests preserve the
token and reject the stale update. Real PostgreSQL 17 tests execute both actual
admission RPCs and the claim RPC: a stopped receipt creates no user message,
reserves no new execution, cannot claim, and leaves a newer request independent.
The existing individual/global worker cascade SQL regression also passes.

Final local verification: 157 tests across 13 focused files pass, together with
typecheck, relevant lint, owned-English, encrypted-access, encryption-schema and
`git diff --check`. The original self-hosted relay review was handled earlier in
the PR; this follow-up preserves that cancellation error boundary.

## Hosted acceptance verification still required

These measurements prove the tested components, not the reported authenticated
Vercel browser path. Neither the 15-second display delay nor Stop-to-provider
timing has yet been measured end to end on the replacement preview. The in-app
browser connection timed out and no authenticated browser session was available.
The issues remain in progress until that verification is complete.

On the replacement preview, test a new conversation, an existing conversation,
Stop before response headers, Stop during reasoning/content, individual worker
Stop, global Stop during worker execution, and Stop after steering a worker.
Use the same GLM low configuration. Correlate browser request IDs with
`[numo-chat] timing` and `[numo-stop]` logs and inspect the provider generation ID.
Verify that text remains stopped, worker descendants stop, and no continuation
starts without another user action. Repeat after navigating away and returning.

OpenRouter documents stream cancellation and provider-dependent billing:
<https://openrouter.zendesk.com/hc/en-us/articles/51691588409883-How-do-I-cancel-a-streaming-request-and-which-providers-stop-billing-when-I-do>.
Reasoning parameters are documented at
<https://openrouter.ai/docs/guides/best-practices/reasoning-tokens>.
GLM's published reasoning capabilities are at
<https://huggingface.co/zai-org/GLM-5.3-Flash>.
