---
id: plans-and-agents
title: Implementation plans and Numo code work
summary: Understand plans, delegated repository work, and pull requests in a Numo conversation.
category: automation
audience: both
tags: [plan, Numo, code work, pull request, repository, implementation]
lastReviewed: 2026-09-13
---

An issue description explains the problem, expected behavior, constraints, and definition of done. Its implementation plan is separate. Ask Numo to inspect the linked repository before producing a code-level plan; Numo should not invent file paths, functions, components, migrations, or code snippets it has not verified.

Numo can plan an issue without changing its status, or delegate implementation and checks to a code worker in the configured server sandbox. The conversation shows the worker's progress and reports the result on the issue. Its pull request is attached to the issue and shows a live preview deployment when one exists. A failed turn can resume from its last saved checkpoint when that checkpoint survived. Plans use Markdown task checkboxes. Existing plans should be extended or patched instead of rewritten wholesale, so completed tasks and concurrent edits are preserved.
