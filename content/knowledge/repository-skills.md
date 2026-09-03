---
id: repository-skills
title: Repository skills in Numo
summary: Understand where Numo finds reusable Agent Skills and how they apply to a conversation.
category: automation
audience: both
tags: [skills, agent skills, repository, local, cloud, slash menu, instructions]
lastReviewed: 2026-09-04
---

Repository skills are reusable instructions owned by a project's code repository. Minddy discovers them from `SKILL.md` files below these conventional roots, in precedence order:

- `.agents/skills`
- `.claude/skills`
- `.github/skills`
- `.cursor/skills`
- `.codex/skills`
- `.gemini/skills`

Each skill lives in its own subdirectory. Its `SKILL.md` frontmatter supplies the name and description shown by Numo; the rest contains the workflow the agent loads. Supporting files such as references, scripts, or assets may remain beside that entrypoint and are available to the coding agent through the repository checkout.

Numo synchronizes the available skill list when a conversation opens and whenever its project or execution environment changes. In Cloud, discovery reads the repository linked to the Minddy project on GitHub or GitLab. In Local, it reads the checkout attached to that project in the desktop app, so a skill that exists only on the machine can be used in a direct local run. An isolated local worktree starts from Git content, so an uncommitted skill must be committed before it can exist in that worktree.

Users select up to five skills with the `/` menu or the `+` menu. The selected skills appear as green badges and apply only to that user turn. Repository skills are never installed into Minddy, do not become global account skills, and cannot override Minddy's system or safety instructions. Minddy provides no dedicated create or install flow; if asked, the coding agent can add or edit a skill as ordinary repository files.
