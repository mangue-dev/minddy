---
id: productivity
title: Views, cycles, routines, and the task notebook
summary: Personal and project workflows for seeing, planning, and repeating work.
category: workflows
audience: end-user
tags: [views, cycle, routine, notebook, scratchpad, triage, inbox]
lastReviewed: 2026-09-13
---

Saved views filter and sort issues while the kanban board remains grouped by status. A personal cross-project view lets a user see work across projects. The cycle is a personal weekly or fortnightly planning surface that can include issues from multiple projects. It is distinct from a project objective. The Inbox is a sidebar popover, not a page: it lists notifications grouped by date, with unread, all, and mentions filters, and shows pending project invitations to accept or decline. Opening an old inbox link redirects there.

Routines are scheduled Numo requests that run on a project and use the owner's AI budget. Their instructions can mention issues, pages, or objectives, and Numo receives that context in every new occurrence conversation. Numo uses Minddy tools directly and delegates repository work only when needed. Personal statistics give each user a view of completed issues, pace, and time spent, with breakdowns by project, category, and objective. Numo can read these same numbers — active days, streaks, all-time totals, median time per ticket by effort — through `get_user_stats`, and plan consumption plus recent agent and routine executions through `get_plan_usage`; both are read-only and cannot change settings or budget. The task notebook is a private, optional scratchpad for quick notes and checkboxes before they become issues. A notebook note can be promoted into an issue when it grows into work that the project should track.
