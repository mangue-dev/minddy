# MIN-721 removal of Numo code work

Date: 2026-10-16. Reviewer: agent:/root/min721_docs. This is an agent source and
language review, not human acceptance, an operational rehearsal or a new capture.

## Brief and scope

MIN-721 removes Numo's code capability. Numo now organizes and tracks work only.
Removed: delegate, implement and fix actions with Numo, agent modes and the ⇧A
shortcut, the issue-card agent animation, delegated-work cards, code-worker
questions, Numo verification and automatic AI pull request review, code routine
templates, the agents usage segment and sandbox compute, cloud sandboxes, the
Agent VM, desktop-local execution, native Codex and Claude Code connections, the
Code agent account settings, branch prefix and the desktop diagnostic report.

Retained and documented: pull request display, linking, comments and merge,
**Merge with Numo**, the read-only `@numo` pull request review conversation,
copy-prompt actions for external agents, the auto-start-on-copy preference,
assistant model choice, Numo tracking tools, minddy MCP and repository skills
(still loaded into Numo turns and routines through `lib/server/assistant/skills.ts`).

## Affected articles and workflows

All six locales of:

- `code-work` (N03, N04): rewritten around copied prompts, minddy MCP and pull
  request review. Section `delegate-code-work` became `external-coding-agents`
  and `continuation` became `link-work`; `legacy-routes.json` maps the old
  fragments and `coverage.json` row N03 points to the new section.
- `numo` (N01, N02, N05, N08, T05): delegation, worker, sandbox and native-agent
  passages removed; `waiting_work` removed from the documented states; the
  execution diagram's third stage now describes waiting for user input.
- `ai-settings-and-usage` (A04, A08, A10): **Code agent** section
  (`native-agent-preview`) removed; `models` now covers local models only;
  consumption and plan text no longer mention code work or sandbox compute.
- `architecture-and-data-flows` (T03): trusted runner and repository sandboxes
  removed from the request flow and diagram.
- `scheduled-routines` (N06), `repository-skills` (N07), `issues` (W07),
  `applications` (A12), `install-locally` (H02), `git` (N10): removal edits.
- `automation-settings`: the running-code-work clause was removed and the
  deleted `lib/server/agent/quota.ts` and `execute.ts` evidence paths dropped.

## Figures

Removed in every locale, with their PNG assets, because they show retired UI
and cannot be recaptured in this change:

- `delegate-code-work-workflow` (`code-work`): delegated worker card.
- `plans-and-ai-usage-workflow` (`ai-settings-and-usage`): usage page with the
  retired "Numo code work" segment. The segment list is now described in text.
- `desktop-app-workflow` (`applications`): desktop settings with the retired
  Diagnostic report row.
- `bulk-issue-actions-steps` (`issues`, `work-bulk-actions.png`): bulk action menu
  with the retired "Implement with Numo" ⇧A action.

Updated diagram text and SVG fallbacks: `numo-execution-model-flow`,
`architecture-and-data-flows-flow`. Retained: `review-pull-requests-workflow`
(the pull request view still exists; caption no longer claims a delegated run).

## Open items

- `lib/server/assistant/knowledge.test.ts` still expects the repository-skills
  help topic to mention a server sandbox; the topic no longer does.
- `captures/shots/documentation-refresh/shot.mjs` still references the removed
  figures; it is capture tooling outside this documentation change.
- Several runtime messages still describe code work (for example
  `Account.aiGeneralDescription`, `Pricing.row_agent`, `Pricing.faq_usage_a`,
  `Privacy.aiProvidersChoice`); the articles describe the shipped behavior.
- Replacement captures of the usage page, desktop settings and bulk actions menu
  would help readers once the UI is final.
