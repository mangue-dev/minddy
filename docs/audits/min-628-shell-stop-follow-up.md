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

Local verification passes: 124 tests in ten focused files, typecheck, relevant
lint, owned-English, encrypted-access, encryption-schema and whitespace checks.
The encryption consumer inventory includes the reviewed query transport wrapper;
authorization and encrypted-content readers remain unchanged.

Hosted replacement-preview measurements are recorded separately after the
signed code commit is deployed. Provider-only timings are not substituted for
the actual click-to-Stop path.
