---
id: feedback
title: Public feedback boards
summary: Collect, triage, and connect user requests to product work.
category: collaboration
audience: both
tags: [feedback, board, votes, public, requests, sso]
lastReviewed: 2026-10-10
---

A project can publish a feedback board where users submit requests and vote. Feedback posts are separate from issues: they describe a user need and keep a public status. The team can discuss a post internally, reply publicly, merge duplicates, or promote it to an issue. Once linked, the post's public status follows the issue.

The board can be embedded in a product flow through its public URL. Published project pages and shared views can also be shown as tabs beside the public board. Optional SSO pre-identifies visitors with a short-lived signed token; visitors without SSO can identify themselves with a one-time email code instead, and a **My feedback** page tracks their posts and votes. Server-to-server feedback ingestion uses a project integration key, not the public board. Numo can help configure and triage the board, but public replies are only sent when explicitly requested.

Feedback can optionally belong to a project objective. Members choose it in the feedback properties or internal creation form; Numo and MCP change it only on explicit request. Owners can choose a default for a feedback integration in Settings → Integrations. New submissions inherit it, including with `analyze: false`; existing posts keep their choice. The objective detail lists linked feedback, without adding it to issue progress. Promotion inherits the objective and categories and does not infer an objective when none was chosen. Changing feedback later does not move an existing linked issue. Merges require matching objectives, including both having none.
