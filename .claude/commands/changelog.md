---
description: "[deprecated] Use the /changelog skill at .claude/skills/changelog/ instead. This legacy command is kept only to avoid breaking historical references; it does nothing."
arguments: []
---

This command is deprecated. The active `/changelog` workflow lives in `.claude/skills/changelog/SKILL.md` — it aggregates completed Notion issues and git commits since the last published changelog and publishes via `scripts/publish-changelog.mjs`. No SQL generation, no version bump.

If you arrived here from an old prompt or shortcut, stop and re-invoke `/changelog`; the skill version will trigger.
