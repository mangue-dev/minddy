---
id: productivity
title: Views, cycles, routines, and the task notebook
summary: Personal and project workflows for seeing, planning, and repeating work.
category: workflows
audience: end-user
tags: [views, cycle, routine, notebook, scratchpad, triage, inbox]
lastReviewed: 2026-10-11
---

Saved views filter and sort issues while the kanban board remains grouped by status. A personal cross-project view lets a user see work across projects. The cycle is a personal weekly or fortnightly planning surface that can include issues from multiple projects. It is distinct from a project objective. The Inbox is a sidebar popover, not a page: it lists notifications grouped by date, with unread, all, and mentions filters, and shows pending project invitations to accept or decline. Opening an old inbox link redirects there. Deleting an issue, objective, feedback post, routine, or project sends it to a recoverable trash.

Routines are private Numo requests triggered by a schedule, issue creation or status entry, assignment, a followed-issue comment, feedback receipt, or a new page database entry and use the owner's AI budget. Typed nested AND/OR conditions can keep an item armed until a later edit matches; target-status exit cancels the arming. Pausing or changing configuration invalidates waiting items, and activation does not replay old events. Database creation, duplication, import and moves count as arrivals; restoration does not. Feedback receipt includes pending/private posts without publication. Each occurrence has a stable conversation and bounded retry identity. Manual runs work for every trigger type. Their instructions can mention issues, pages, or objectives, and Numo receives that context in every new occurrence conversation. Numo uses Minddy tools directly and delegates repository work only when needed. Personal statistics give each user a view of completed issues, pace, and time spent, with breakdowns by project, category, and objective. Numo can read these same numbers — active days, streaks, all-time totals, median time per ticket by effort — through `get_user_stats`, and plan consumption plus recent agent and routine executions through `get_plan_usage`; both are read-only and cannot change settings or budget. The task notebook is a private, optional scratchpad for quick notes and checkboxes before they become issues. A notebook note can be promoted into an issue when it grows into work that the project should track.
