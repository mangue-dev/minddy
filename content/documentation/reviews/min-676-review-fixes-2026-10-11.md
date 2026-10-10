# MIN-676 experimental Claude and reconnect review

Review date: 2026-10-11. Reviewer: agent:/root. Article:
`ai-settings-and-usage`, revision 13 in `en`, `fr`, `de`, `es`, `it` and `pt-BR`.
Workflows: A04, A08 and A10. This is source and fixture review with equivalent
localized meaning checks, not human acceptance or provider execution.

The user requests an experimental Claude integration and fixes for Codex
retry/credential-generation review findings. The revised account guide names
the localized Experimental badge, explains that a Free account is insufficient,
and describes explicit continuation after reconnecting. All prior availability,
hosted-authentication, billing and native-capability limitations remain.

Source evidence: `components/settings/native-agent-connections.tsx`,
`lib/server/agent/vm/native-runtime.ts`,
`lib/server/agent/native-worker-selection.ts`, `lib/server/agent/launch.ts`,
`app/api/agent-runs/[runId]/steer/route.ts`,
`components/agent/agent-conversation.tsx` and
`lib/server/numo/worker-mediation.ts`. The shared worker badge also retains the
experimental Claude label. `native-worker-history.ts` verifies ownership and
frozen repository/model identity before replaying decrypted history privately;
the user's visible launch prompt remains unchanged. Protocol fixtures distinguish actual
Claude subscription execution from simulated stream/MCP success. Published
Anthropic SDK type declarations identify `authentication_failed`, result
`subtype`/`is_error` and terminal `api_error_status` fields.

No API-provider or usage control changed, so the existing required figures
`ai-keys-and-models-workflow` and `plans-and-ai-usage-workflow` retain their
recorded reviews. The experimental native picker is reviewed separately in
the local UI. Prior live Codex HTTP 401/cold-restore evidence is retained; no
new live provider acceptance is claimed.

Verification: 212 targeted tests pass across 14 files, including native retry,
Claude stream/MCP/auth export, owned cold continuation, standalone steering,
Numo warm refusal, history scope and shared identity display. Typecheck, lint,
agent VM build, native prototype build, documentation (92/92 workflows in six
locales), knowledge, owned-English and whitespace checks pass locally.

The actual Docker-backed settings UI was inspected in French. The Claude
selector and connection label display Experimental; the unconnected state,
model/effort controls and sandbox settings remain available. No login or model
run was started. Codex was restored as the selected connected account afterward.
`docs/validation/assets/min-676-claude-experimental.png` records the inspected
narrow dark-mode viewport; it contains no login codes or account credentials.
No provider refresh, expiry or hosted PR-delivery claim is added by this review.
