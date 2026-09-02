---
id: settings-and-data
title: Settings, access, and data
summary: What users and project owners can configure, and how data is handled.
category: settings
audience: end-user
tags: [settings, members, privacy, data, account, project]
lastReviewed: 2026-09-02
---

Project owners manage project settings, members, categories, integrations, feedback boards, and project automations. Account settings belong only to the current user and include identity, interface language, personal preferences, notifications, and code-agent defaults. From their profile, users pick a generated avatar or upload their own image, and the avatar follows them across projects, comments, and conversations. A project member can work on issues and categories according to the available product permissions, but cannot change owner-only settings.

minddy does not sell data or use it for advertising. The Data section of account settings lets users download a JSON transfer file and restore it on another minddy instance. The transfer is additive and preserves project, issue, page, and personal-data IDs whenever the destination can safely reuse them; conflicts receive new IDs and are reported after import. Project memberships are restored only when the referenced project already exists on the destination. Passwords, API keys, OAuth tokens, repository credentials, and billing subscriptions are never transferred. Repository access tokens are encrypted before storage and are used only when a user triggers an action that needs the connected repository.
