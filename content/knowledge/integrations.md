---
id: integrations
title: Integrations and public API
summary: Connect a project to external apps, repositories, and webhooks.
category: developer
audience: developer
tags: [api, integration, webhook, github, gitlab, repository]
lastReviewed: 2026-08-20
---

minddy can link GitHub or GitLab repositories to a project. Repository linking enables pull-request context and the code-agent workflow. Git credentials are reusable across projects after a user connects the provider account.

Project integrations accept server-to-server input. An issues integration creates incoming work in triage; a feedback integration creates feedback posts. Integration keys are shown once to the user and must be kept server-side. Webhooks are outbound project notifications whose destination is configured by the project owner. The public API is for an app's own tools to create issues and feedback in minddy.
