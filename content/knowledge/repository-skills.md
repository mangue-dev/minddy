---
id: repository-skills
title: Repository skills in Numo
summary: Understand where Numo finds reusable Agent Skills and how they apply to a conversation.
category: automation
audience: both
tags: [skills, agent skills, repository, slash menu, instructions, routines]
lastReviewed: 2026-10-16
---

Repository skills are reusable instructions owned by a project's code repository. Minddy discovers them from `SKILL.md` files below these conventional roots, in precedence order:

- `.agents/skills`
- `.claude/skills`
- `.github/skills`
- `.cursor/skills`
- `.codex/skills`
- `.gemini/skills`

Each skill lives in its own subdirectory. Its `SKILL.md` frontmatter supplies the name and description shown by Numo; the rest contains the instructions Numo receives when the skill is selected. Supporting files such as references, scripts, or assets may sit beside that entrypoint for coding agents that read the repository; Numo receives the `SKILL.md` instructions.

Numo synchronizes the available skill list when a conversation opens and whenever its project changes. Discovery reads the repository linked to the Minddy project on GitHub or GitLab, and a specific branch or ref can be selected. Files that exist only in a desktop checkout are not available to Numo; commit and push a skill before selecting it.

Users select up to five skills with the `/` menu, the Codex-style `$` shortcut, or the `+` menu. The `$` menu contains only repository skills, while `/` also keeps Numo's other commands. A skill's instructions can be previewed before they are sent. The selected skills appear as green badges and apply only to that user turn, unless the skills were selected in a routine's instructions, where Numo receives that context each time the routine runs. Repository skills are never installed into Minddy, do not become global account skills, and cannot override Minddy's system or safety instructions. Minddy provides no dedicated create or install flow: add or edit a skill as ordinary repository files, yourself or with your own coding agent, then push the change.
