---
id: core-tracker
title: Projects, issues, and objectives
summary: The core concepts that organize work in minddy.
category: concepts
audience: end-user
tags: [project, issue, ticket, objective, status, priority]
lastReviewed: 2026-10-17
---

Projects hold a team's issues, members, categories, saved views, pages, integrations, and feedback board. An issue is one discrete piece of work. It has a title and can also carry a description, status, priority, effort, assignee, objective, categories, a due date, recurrence, linked issues (including blocking dependencies), sub-issues, comments, resources, and an implementation plan.

Smart Fill is an optional account preference that fills an issue's missing priority, effort, categories, and objective, and, after the issue is saved, links it to related issues in the same project (related, blocks, or blocked by). It runs in the background, adds at most three relations per pass, abstains when unsure, never touches a pair that already has a relation, and never re-adds a link someone removed. Its links appear in the issue's relations and timeline under Smart-fill and are removed like any relation. The separate "Index issues" preference controls whether issue titles and descriptions become encrypted vectors used to find candidates; when off, candidates are found by shared words only.

Objectives group issues around one outcome and show their progress. An objective with a target date also shows a momentum signal — accelerating, steady, slowing, or stalled (with separate states for objectives not started, complete, or canceled) — computed from recently completed issues, with an estimated finish date when there is enough activity to make one meaningful. Without a target date, the momentum panel, history, pace statistics, and finish estimate are hidden; overall progress remains available. Adding a target date shows the panel again. Triage is the arrival area for work that needs review before it enters the normal board. Each user also has a personal cross-project cycle for weekly or fortnightly planning. Saved views filter and sort the board without changing the issues themselves. minddy uses statuses such as triage, backlog, todo, in progress, in review, done, canceled, and duplicate.

Saved issue and objective drafts require confirmation before deletion. Triage filters incoming tickets by priority, effort, assignee, objective, categories and integration; values within one property are alternatives and different properties are combined. Reset clears the property filters.
