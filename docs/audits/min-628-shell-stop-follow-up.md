# MIN-628 Assistant Shell Stop follow-up

## Reproduction on the previous preview

The authenticated demonstration account reproduced the reported prompt in the
actual Assistant Shell on deployment `dpl_6j7MHAFAV6fLFyWNawK6gxWNL12P`, commit
`c733bec66`: list the user's projects and issues, then click Stop while the
project lookup is displayed. The first click opened a confirmation dialog and
sent **zero Stop requests**. Three tool results and 60 content events arrived
after that click. The streamed turn ended 26,250 ms later, with a complete final
answer. Database metadata and OpenRouter generation inspection confirm that
two subsequent GLM generations ran after the click, neither canceled.

The earlier transport and hook tests did not click this composer button. They
therefore missed the confirmation inserted ahead of `onAbort`.

## Changes

- `components/assistant/chat-input.tsx` invokes `onAbort` directly on the first
  Stop click. This shared composer serves Numo and code agents. A worker
  steering draft continues to expose Send.
- `DelegatedWorkStopButton` also invokes the run-specific interruption directly
  on its first click in both the delegated card and its detail panel. Shared
  stopping, disabled, spinner and failed-request retry behavior is preserved.
- `lib/server/assistant/loop.ts` keeps its Stop listener and durable polling
  armed throughout accounting, checkpoints and tool execution. A stopped
  project/issue read aborts its actual Supabase transport, publishes no late
  result and starts no subsequent generation. Cross-instance polling runs
  every 250 ms. Mutations already in flight retain their durable completion
  boundary, then return the authoritative stopped state.
- `lib/server/assistant/abortable-read-client.ts` attaches cancellation to
  per-tool query builders without altering shared clients. `execute-tool.ts`
  applies this to project and issue listings.
- `lib/server/assistant/conversation-config.ts` normalizes inherited reasoning
  against the effective model's capabilities, as the picker does. The previous
  shell displayed GLM Light while null/default requests actually stored medium.
  The exact effect of that unsupported effort at OpenRouter is not established;
  the correction makes the stored request match the displayed supported level.
- `requestNumoRequestStop` retires the exact owned active claim before preparing
  a pre-admission receipt. Known owned turn IDs avoid redundant conversation
  creation checks; a mediated parent stops concurrently with its submission
  receipt. Cleanup remains awaited and conversation projection retains its
  version comparison. Request-correlated phase logs measure authorization,
  authority revocation and cleanup separately.

The first replacement preview delivered the Stop request to Vercel in 17 ms
and froze the UI in 7 ms, but did not revoke execution until 2,456 ms after the
click. It sent no later generation, and its stored GLM effort was correctly low.
That measurement exposed the redundant encryption, duplicate receipt insertion
and database reads before the authority write. The subsequent retirement-first
change targets this measured delay; it is not inferred from an optimistic UI.

## Regression evidence

The actual shared composer plus chat hook failed three DOM/network tests on
`c733bec66`, including a first Stop click during `executing_tool` sending zero
durable Stop requests. Four composer tests pass after the correction.

Four delayed project/issue tool cancellation tests fail against the previous
loop and pass after the correction. Additional tests cover the real Supabase
transport, isolation from shared queries and an in-flight mutation completing
after its claim is revoked without retry or late publication.

The default-model configuration regression fails with actual medium instead of
expected low on the previous configuration resolver and passes with the fix.

Three delegated-card/panel DOM tests fail before the correction with zero
interruption requests; four pass afterward. Three delayed Stop-setup regressions
fail before the retirement-first change and pass afterward, including a slow
projection read and a mediated submission awaiting receipt encryption.

Local verification passes: 134 tests in eleven focused files, typecheck, relevant
lint, owned-English, encrypted-access, encryption-schema and whitespace checks.
The encryption consumer inventory includes the reviewed query transport wrapper;
authorization and encrypted-content readers remain unchanged.

## Authenticated replacement-preview proof

Deployment `dpl_CAQYC3ccD9PXg6HPDJMgVotMizdp`, commit `c716e5e16`, was tested in
the actual Assistant Shell with the repository's authenticated demonstration
account. GLM 5.3 Flash was selected as Light; the durable rows now store low.
The generation inspections used the existing production OpenRouter account key.
Safe browser, durable-turn, Vercel and provider metadata is recorded in
[min-628-shell-preview-evidence.json](./min-628-shell-preview-evidence.json).

| Actual click case | UI idle | Handler authority revocation | Provider/execution result |
| --- | ---: | ---: | --- |
| Reported project/issue prompt, during tools | 8 ms | 773 ms | No tool result or subsequent model generation |
| First text deltas | 8 ms | 454 ms | StreamLake reports canceled |
| After visible text begins | 7 ms | 466 ms | Together reports canceled |
| Before response headers | 4 ms | No execution admitted | Zero attempts and provider generations |

The Stop requests reached Vercel 14–25 ms after the actual DOM click. Revocation
values above are measured from the handler's clock; Vercel arrival precedes that
clock and is recorded separately. Both actual text generations report
`cancelled: true`, with no normal completion. All conversations retained exactly
one stopped turn, no active claim or worker, and no additional attempt or turn
in checks 94–429 seconds later.

This is not a claim of zero-time provider cancellation. Live network bytes
continued for up to 1,421 ms after clicking while cross-instance observation
and upstream cancellation propagated; the frozen UI did not append these bytes.
The final HTTP response and SSE done also include cleanup and durable journal
persistence. A final stopped checkpoint can rewrite `completed_at`, so that
column alone does not measure the earlier claim revocation. Cancellation before
headers required 4.2 seconds to return its durable receipt, but started no work.

## Remaining first-response latency

The cold tool probe spent 5,412 ms inside admission plus about 2 seconds before
the handler clock. Its Parasail generation latency was 1,450 ms. The text probe
admitted in 2,696 ms, but StreamLake's actual provider latency was 7,364 ms.
These are separate app and provider contributions; correcting the effort to low
does not remove them all.

The follow-up overlaps independent billing/quota-reset, usage/BYOK and protected
message/intent preparation. Deferred-read regressions demonstrate the previous
serialization and retain quota denial, reset windows, error precedence and
protected admission. A new admission-protection phase supports hosted comparison.
Replacement-preview startup verification for this additional change is pending.

OpenRouter's [streaming documentation](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/streaming.mdx)
requires closing the streaming connection and notes provider-dependent support;
actual provider inspection above confirms support for the tested endpoints.
No production deployment or database schema change was performed. Production
button/cascade validation remains a separate acceptance step.
