---
id: settings-and-data
title: Settings, access, and data
summary: What users and project owners can configure, and how data is handled.
category: settings
audience: end-user
tags: [settings, members, privacy, data, account, project, Numo]
lastReviewed: 2026-10-07
---

Project owners manage project settings, members, categories, recurrences, the linked Git repository, import, integrations, and feedback boards. Account settings belong only to the current user and include identity, interface language, personal preferences, notifications, and the model and reasoning defaults for code work delegated by Numo. From their profile, users pick a generated avatar or upload their own image, and the avatar follows them across projects, comments, and conversations. A project member can work on issues and categories according to the available product permissions, but cannot change owner-only settings.

Numo can change most of these settings on request. Project-side, `update_project` covers name, key and accent color, auto-assign on create, Smart Assign and its per-member rules, Smart Triage's static rules engine, the project's automation switch, and the feedback AI review and translation options. Account-side, `update_account_settings` covers the display name, interface language, display theme, the keyboard send shortcut, where Numo-created issues land, auto-assign and Smart Fill preferences, the personal cycle knobs, the Inbox notification toggles, analytics consent, the automation preset with its start delay and per-effort switches, the agent branch prefix, and the server-sandbox region and size. Account settings → Automations holds the preset plus one automation switch per project the account owns. The agent branch prefix lives in the Git tab, and the server-sandbox region and size in the AI tab. Two things Numo can explain but never change: the code-worker model and reasoning level (Account settings → AI only), and the credentials themselves — AI provider keys, GitHub or GitLab connections, two-factor authentication, and the avatar file, which stay user-driven.

minddy does not sell data or use it for advertising. The Data section of account settings lets users download a JSON transfer file and restore it on another minddy instance. The transfer is additive and preserves project, issue, page, and personal-data IDs whenever the destination can safely reuse them; conflicts receive new IDs and are reported after import. Project memberships are restored only when the referenced project already exists on the destination. Passwords, API keys, OAuth tokens, repository credentials, and billing subscriptions are never transferred. Repository access tokens are encrypted before storage and are used only when a user triggers an action that needs the connected repository.
