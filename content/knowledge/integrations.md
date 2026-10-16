---
id: integrations
title: Integrations and public API
summary: Connect a project to external apps, repositories, and webhooks.
category: developer
audience: developer
tags: [api, integration, webhook, github, gitlab, repository]
lastReviewed: 2026-10-16
---

minddy can link GitHub or GitLab repositories to a project. Repository linking gives Numo pull-request context, lets minddy attach pull requests to issues, and makes the repository's skills available to Numo. Numo does not change repository code; coding agents connected through MCP do that work. Git credentials are reusable across projects after a user connects the provider account. Project settings → Git can also enable an issue sync for a linked repository: its forge issues are imported (landing in triage) and kept in step with webhooks, with the open/closed state of issues mirroring in both directions.

Project integrations accept server-to-server input. An issues integration creates incoming work in triage; a feedback integration creates feedback posts. Integration keys are shown once to the user and must be kept server-side. Webhooks are outbound project notifications whose destination is configured by the project owner. The public API is for an app's own tools to create issues and feedback in minddy.
