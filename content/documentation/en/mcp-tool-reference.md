---
{
  "id": "mcp-tool-reference",
  "locale": "en",
  "title": "Use Minddy MCP safely and discover its current tools",
  "summary": "Minddy exposes /api/mcp with Streamable HTTP, stateless tools and OAuth 2.1.",
  "topic": "Technical concepts",
  "type": "reference",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source and final correction review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and final correction review)",
    "date": "2026-10-08"
  },
  "related": [
    "numo-execution-model",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Discover the instance catalog {#mcp-tool-reference}

Minddy exposes /api/mcp with Streamable HTTP, stateless tools and OAuth 2.1. Connect as your own account through browser consent; old static mdyk_ keys are not accepted. Start with minddy_list_projects to obtain accessible project UUIDs, then read the connected server tool schemas. /llms-full.txt is generated from those registrations and provides the exact current parameters. Do not guess tools from an old copied list. Project-scoped tools recheck access and return stable error codes.

## Read issues before changing their plans {#issue-plans}

minddy_get_issue accepts an issue UUID, an issue identifier such as DEMO-42, or a bare issue number; project_id is supplied separately. Its plan_tasks provide zero-based task_index values. minddy_update_plan_task accepts a tasks batch with pending, in_progress, completed or cancelled states. The whole batch fails on an invalid index. Use minddy_append_to_plan for additions and minddy_edit_issue_text with a unique exact old_string/new_string for a passage. Re-read if the match is stale; replacing the entire plan can overwrite another person’s progress. Questions under ## Questions do not count as plan tasks.

## Use revision guards and owner scope {#pages-and-routines}

minddy_list_pages maps hierarchy; minddy_search_pages finds title/body excerpts and minddy_get_page reads the full Markdown, comments and database values. Use append/edit tools for partial changes and current version guards for full replacement. Preserve file/image URLs exactly. minddy_create_page with database=true creates a database; minddy_update_page_database requires database revision for schema edits, previous value for cells and preview/apply tokens for conversions. Owner-only routine tools create, pause, retime or remove scheduled requests. Read existing routines first to avoid duplicates. Resource uploads through minddy_add_resource are capped at 10 MB; page tools do not invent file URLs.

## Verify the returned state {#example}

The sanitized example updates the first task of an already-read plan. Replace the project UUID and issue with values from discovery; task_index must come from the latest read. Confirm returned plan_tasks and plan_progress. On access errors, check the account/project authorization; on stale conflicts, read again and apply only the intended change. Do not retry an uncertain external mutation before checking its result.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
