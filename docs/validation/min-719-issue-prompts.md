# MIN-719: copied issue prompts

Review of the prompts copied from issues for external coding agents, recorded
2026-10-16.

## Structure

Every builder in `lib/issue-prompt.ts` renders one action line, a `<context>`
payload announced as data, the plan status and branch guidance, the shared
instructions plus the action's own, and a conditional Minddy MCP appendix.
User-controlled text has its structural tags (`</issue>`, `</context>`,
`</request>`…) neutralized; other markup is kept as written. The notebook
prompt (`lib/scratchpad-prompt.ts`) applies the same rule to `</notes>` and
gains a short work-guidance sentence and an honest MCP fallback.

Forge context comes from `GET /api/issues/prompt-context`
(`lib/server/issue-prompt-context.ts`): every pull request linked to the issue
with its state, URL and branches, and the project's repository and default
branch. Any failure renders `<pull_requests status="unavailable" />` rather
than "no pull request".

MIN-723 took the read off the copy's critical path, which had waited up to
2.5 seconds on every copy. `lib/issue-prompt-context.ts` keeps each issue's
context for 30 seconds and warms it on intent: hovering, focusing or
right-clicking a card, opening the side panel, or changing a multi-selection
(one request per 150 ms window). A copy serves the cached entry at once and
waits at most 300 ms for a missing one; past that it copies with the context
marked unavailable while the read finishes for the next copy. The command
palette relies on that bounded wait alone.

## Instruction length

Shared block plus action block, measured by `promptInstructions` (issue data,
plan and branch lines and the MCP appendix excluded). A test keeps each one at
200 words or fewer.

| Action | Words |
| --- | --- |
| Implement, with a plan | 107 |
| Implement, without a plan | 116 |
| Generate plan | 123 |
| Review plan | 115 |
| Verify implementation | 144 |
| Custom request | 81 |
| Multiple issues | 112 |

## Covered cases

Builder tests cover no linked pull request, one open, several open, only
merged or closed, unavailable metadata and missing forge fields; scope
(plan and review stop before implementing, custom keeps the user's scope and
adds no status change); escaping of hostile titles, descriptions and custom
requests; the branch-name suggestion; and multi-issue prompts mixing these
states. Caller tests evaluate the issue-card handlers with the loaded context,
and the loader and server reader have their own tests.

## Not evaluated

No live agent runs were made across languages, stacks or agent environments
for this change. The wording follows the cited vendor guidance, but its effect
on scope adherence and verification quality is unmeasured; compare real runs
before claiming improvement. The command palette still copies without
relations, as before this change, because it does not load them.
