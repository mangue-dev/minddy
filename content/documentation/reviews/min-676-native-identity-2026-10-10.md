# MIN-676 frozen coding-agent identity documentation review

Date: 2026-10-10. Reviewer: agent:/root/native_identity_docs. This is an agent
source and language review, not human reader acceptance or a new hosted
execution. Paid Claude Code remains untested.

## Article brief and scope

The audience is a member choosing a coding agent in account AI settings,
following delegated issue work, or asking Numo which worker is active. The
outcome is to distinguish the current account selection from the actual engine
saved on a run, and to understand the controls supported by that engine.

All six locales update `code-work` (revision 5; workflows `N03`, `N04`),
`ai-settings-and-usage` (revision 10; workflows `A04`, `A08`, `A10`) and
`numo` (revision 7; workflows `N01`, `N02`, `T05`, `N08`, `N05`). Existing
section IDs and coverage mappings remain unchanged. Applicability remains the
0.11.1 candidate and allowlisted MIN-676 private hosted preview, including its
explicit unvalidated Claude Code execution and renewal conditions.

## Source review

The review inspected `components/agent/agent-engine-badge.tsx`,
`components/agent/agent-conversation.tsx`,
`components/assistant/delegated-work-card.tsx`,
`components/settings/native-agent-connections.tsx`,
`components/settings/account-ai-keys-section.tsx` and
`lib/agent-engine-display.ts`. Account selection and connection rows use the
existing MCP agent logos. Worker cards, details and conversation controls use
the run's saved `agent_engine`; they never infer a historical worker from the
current account preference. Missing, unknown and legacy engine metadata use a
generic localized code-agent label. Native conversations hide OpenCode API
model and reasoning controls and image attachments, and explain CLI-managed
defaults. OpenCode retains its API controls.

The review also inspected
`lib/server/assistant/account-worker-context.ts`,
`lib/server/assistant/worker-harness-context.ts` and
`lib/server/numo/turns.ts`. Ordinary Numo turns receive safe current account
selection and capability metadata before delegation. Documentation-help turns
retain their separate context. Frozen launch results and validated worker
events take precedence for an existing run. The context names the engine and
instructs Numo to identify the worker. A failed settings lookup instructs Numo
to check settings instead of inventing an engine; it does not block the chat.
Routine guidance now distinguishes the owner's selected engine and API or
connected subscription defaults.

No connection credential, profile, lease, private account identifier or email
is added to the documented Numo context. Prior provider execution and
procedural evidence remains in the existing validation records. This review
does not establish renewal, revocation, new paid Claude execution or a
seamless first-attempt launch.

## Language and illustration review

The additions in `en`, `fr`, `de`, `es`, `it` and `pt-BR` were read against the
English source for complete equivalent meaning, natural localized wording,
engine names, historical-run behavior, CLI defaults and truthful private-preview
limitations. This is agent review; no human language acceptance is claimed.
All locale revisions and `sourceRevision` values advance together.

Figure `delegate-code-work-workflow` is now explicitly captioned as a
historical OpenCode example in all six locales. Its real original capture date
and assets remain unchanged. It demonstrates the retained implementation and
PR evidence; it is not a native selection screenshot. Figures
`ai-keys-and-models-defaults-workflow` and the other retained controls continue
to describe the existing OpenCode or independent workflows. Revision markers
advance with their articles. No new screenshot, sign-in, paid inference or
responsive diagram is claimed. Essential engine identification and control
differences are fully stated in the text.

## Verification

`npm run check:documentation` passes: 252 locale articles and 92/92 workflows
published in all six languages. `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` pass. The parent task owns
runtime/UI verification and the combined final checks; passing documentation
metadata checks alone does not establish operational acceptance or public
rollout readiness.
