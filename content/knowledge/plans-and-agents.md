---
id: plans-and-agents
title: Implementation plans and code agents
summary: Keep product intent separate from repository-grounded implementation work.
category: automation
audience: both
tags: [plan, code agent, pull request, repository, implementation]
lastReviewed: 2026-09-02
---

An issue description explains the problem, expected behavior, constraints, and definition of done. Its implementation plan is separate. A real code-level plan should come from the code agent because it reads the linked repository; Numo must not invent file paths, functions, components, migrations, or code snippets it cannot verify.

The code agent can plan an issue without changing its status, or implement it and run checks — in an isolated cloud environment, or on a local folder attached from the desktop app. It reports back on the issue and attaches its pull request. Plans use markdown task checkboxes. Existing plans should be extended or patched rather than rewritten wholesale, so completed tasks and concurrent edits are preserved.
