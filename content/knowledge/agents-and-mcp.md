---
id: agents-and-mcp
title: Agents and MCP
summary: Connect coding agents so they can read and update minddy directly.
category: automation
audience: both
tags: [agent, mcp, oauth, codex, claude, cursor]
lastReviewed: 2026-08-20
---

minddy exposes an OAuth-based MCP server. Compatible coding agents can read issues and their context, update status and properties, write plans and comments, create linked issues and objectives, and work with project pages. The MCP setup page provides the endpoint and setup instructions for supported clients.

Numo is the assistant built into minddy. The optional code agent works from an issue, clones a linked GitHub or GitLab repository into an isolated environment, and can plan, implement, run checks, and attach its pull request to the issue. The MCP server and Numo are available on every plan; available AI usage and model choices depend on the account plan or an optional personal API key.
