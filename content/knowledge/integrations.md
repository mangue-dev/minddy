---
id: integrations
title: Integrations and public API
summary: Connect a project to external apps, repositories, and webhooks.
category: developer
audience: developer
tags: [api, integration, webhook, github, gitlab, repository]
lastReviewed: 2026-09-13
---

minddy can link GitHub or GitLab repositories to a project. Repository linking gives Numo pull-request context and enables delegated code work in a server sandbox. Git credentials are reusable across projects after a user connects the provider account.

Project integrations accept server-to-server input. An issues integration creates incoming work in triage; a feedback integration creates feedback posts. Integration keys are shown once to the user and must be kept server-side. Webhooks are outbound project notifications whose destination is configured by the project owner. The public API is for an app's own tools to create issues and feedback in minddy.
