---
id: plans-and-agents
title: Implementation plans and Numo code work
summary: Understand plans, delegated repository work, and pull requests in a Numo conversation.
category: automation
audience: both
tags: [plan, Numo, code work, pull request, repository, implementation]
lastReviewed: 2026-10-16
---

An issue description explains the problem, expected behavior, constraints, and definition of done. Its implementation plan is separate. Ask Numo to inspect the linked repository before producing a code-level plan; Numo should not invent file paths, functions, components, migrations, or code snippets it has not verified.

Numo can plan an issue without changing its status, or delegate implementation and checks to a code worker in the configured server sandbox. The conversation shows the worker's progress and reports the result on the issue. Implementation requires pull request delivery; a blocked publication is reported as a delivery failure. The vertical work card and activity panel show the recorded engine, model and thinking, elapsed execution time, branch and subagents. Use its actions menu to stop the worker, the branch icon to copy its name, and the PR button to open the pull request in Minddy. Validation is explicit and separate from publication; unfinished checks are unverified. Its pull request is attached to the issue and shows a live preview deployment when one exists. Numo can also handle pull requests directly — read one, merge it, update it, or comment in its threads — while anything that changes the branch itself still goes to the code worker. A failed turn can resume from its last saved checkpoint when that checkpoint survived. Plans use Markdown task checkboxes. Existing plans should be extended or patched instead of rewritten wholesale, so completed tasks and concurrent edits are preserved.

An issue can also be handed to a coding agent outside Minddy, such as Claude Code, Codex or Cursor, with Copy as prompt: generate or review a plan, implement, verify the implementation, or a custom request; several selected issues copy as one combined prompt. Copying runs no AI model. The prompt carries the issue's fields, relations, resource count and plan progress (never the plan text, which the agent reads through the Minddy MCP server or asks for), the linked repository, and every linked pull request with its state and branches when known. The agent continues an open pull request's branch, treats merged or closed ones as history, and otherwise gets a branch-name suggestion made of the issue identifier and a short title, which it adapts to the repository's own convention. Keeping the identifier in the branch, the pull request title or a "Fixes" line lets Minddy attach the pull request to the issue. When pull request information cannot be loaded, the prompt says so rather than claiming there is none.
