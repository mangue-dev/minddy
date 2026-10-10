---
name: maintain-documentation
description: Audit and update Minddy's public documentation against the current product using a swarm of agents. Use for stale articles, release documentation maintenance, or a corpus-wide accuracy review, including all six locales. For a refresh limited to illustrations and screenshots, use refresh-documentation-visuals.
---

# Maintain documentation

Find discrepancies between the manual and verified product behavior, correct
them, and retain a coherent six-language publication set. Invoking this skill
requests a swarm audit and corrections, not just a list of proposed edits.
Default to the whole public corpus unless the user names a narrower scope.

## Establish scope and evidence

Follow the repository's `AGENTS.md` and Git workflow. Reuse the branch for this
work and preserve existing changes. Keep these skills tracked in Git.

Read these repository references before delegating:

- [Editorial guide](../../../docs/documentation-editorial-guide.md): factual
  verification, writing, translations, technical inline code and illustrations.
- [Article contract](../../../content/documentation/README.md): JSON
  frontmatter, revisions, reviews and publication gates.
- `content/documentation/coverage.json`: workflow-to-article and section mapping.
- [Agent access](../../../docs/documentation-agent-access.md): the public
  Markdown, search and index contract shared with HTML and Numo.

Identify the target release or candidate commit, editions and installation
profiles. Inspect article `compatibility.evidence` and prior review records;
compare relevant source changes since the last verified revision. Check actual
UI labels in `messages/` and implementations in `app/`, `components/`, `lib/`,
`scripts/`, `supabase/` and `desktop/` as applicable. Distinguish candidate
behavior from the shipped runtime; never call source inspection a successful
UI or operational execution. Resolve a material version ambiguity with the
user while continuing independent source review.

## Launch and coordinate the swarm

Use the environment's agent or team tools to launch multiple focused agents,
within its concurrency limit. Assign disjoint article groups by feature and
audience, for example core work, accounts and integrations, automation and
Numo, or self-hosted operations. Ensure every in-scope article has an owner.
Give each agent the target version, references, allowed files and this brief:

> Compare the assigned articles with their source evidence and current product
> behavior. Find outdated labels, entry points, permissions, defaults, limits,
> missing reader steps, recovery instructions and edition/profile differences.
> Correct verified discrepancies in your assigned articles. Report each changed
> claim with its source path or runtime evidence, affected workflows/sections,
> revision changes, verification performed and unresolved questions. Keep
> essential uncertainty visible; do not invent review approval or execution.

Keep parallel work to file inspection and edits. The coordinator owns shared
files such as the coverage ledger, legacy routes, glossary and renderers; agents
report requested shared changes instead of editing them concurrently. Assign
one writer per file. Review and accept the factual English correction before
assigning translation work. Then divide affected locale files among language
reviewers, preserving the full meaning in `en`, `fr`, `de`, `es`, `it`, `pt-BR`.

Arrange an independent agent review of changed claims and reader outcomes.
Give the reviewer the articles and raw evidence, not an instruction to approve.
Resolve disagreements against the evidence. If agent tools are unavailable,
state that limitation and perform the same audit sequentially; do not claim a
swarm or independent review occurred.

All browser checks, captures, builds and operational rehearsals are coordinated
by the parent and run one at a time. Agents must not start their own servers,
Docker, builds or browser batches. Follow `AGENTS.md` resource limits, including
the restriction on restarting the documentation capture environment. Record
checks requiring a separately arranged bounded run as pending.

## Correct and reconcile

Keep feature guides, stable article and section IDs, aliases and cross-links.
Update `coverage.json` and `legacy-routes.json` only if the mapping changes.
Preserve prerequisites, permissions, expected results, warnings, recovery and
Cloud/self-hosted/platform differences. Format technical references as inline
code and preserve exact executable syntax. Write contributor prose in English
and reader articles in their locale using the actual translated UI labels.

Increment changed locale revisions, set `sourceRevision` to the corrected
English revision, and reconcile figure revisions under the article contract.
Update compatibility and dates only for verification actually performed.
Record sanitized evidence under `content/documentation/reviews/`, including
reviewer identity, method, article revision, actual date and limitations. Keep
private records out of public article bodies and exports. Agent reviews must
be identified as agent reviews, never as human acceptance.

If essential facts remain unresolved, leave the affected article set in draft
and report the publication impact; never fabricate metadata to pass a gate.
Retain still-valid earlier execution evidence with its original date and
clearly distinguish it from a fresh run. A source audit cannot replace the
complete released-profile rehearsal of an operator procedure.

Use [refresh-documentation-visuals](../refresh-documentation-visuals/SKILL.md)
for stale figures; it handles real controls and responsive illustrations.
Do not change application behavior to make the manual true. Report product
defects separately unless fixing them is part of the user's request.

## Verify and deliver

Run these lightweight checks sequentially:

```bash
npm run check:documentation
npm run check:knowledge
npm run check:owned-english
git diff --check
```

Run the smallest relevant tests if changing a renderer, parser or delivery
contract. Use `npm run check:documentation:release` before claiming the manual
is fully published. Review all affected locales, links, revision metadata and
required figures; a passing checker does not establish factual accuracy.

Complete the repository's DCO commit and `npm run work:pr` workflow. Report
corrected article/workflow IDs, evidence, checks and any unresolved gaps. Do
not deploy without an explicit deployment request. If this work came from the
Minddy scratchpad, reread it before saving the whole document, preserve other
sections, and mark only completed tasks. Synchronize an issue and its plan
when the user supplied their identifiers.
