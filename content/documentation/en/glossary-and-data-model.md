---
{
  "id": "glossary-and-data-model",
  "locale": "en",
  "title": "Glossary and data model",
  "summary": "A project is the shared workspace for members, issues, categories, saved views, pages, integrations and its feedback board.",
  "topic": "Technical concepts",
  "type": "explanation",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "T01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Understand projects, issues, objectives and personal work"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/en/glossary-and-data-model-flow.svg",
      "alt": "Diagram: Project: shared work and knowledge. Issue: work; objective: intended result. Personal cycle: one user's cross-project work. Page: durable context; feedback: user need.",
      "caption": "These components have distinct responsibilities. Project: shared work and knowledge. Issue: work; objective: intended result. Personal cycle: one user's cross-project work. Page: durable context; feedback: user need.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Project: shared work and knowledge"
          },
          {
            "title": "Issue: work; objective: intended result"
          },
          {
            "title": "Personal cycle: one user's cross-project work"
          },
          {
            "title": "Page: durable context; feedback: user need"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Choose the right object {#glossary-and-data-model}

A project is the shared workspace for members, issues, categories, saved views, pages, integrations and its feedback board. An issue is a discrete unit of work with status, assignee and optional plan, due date, objective, categories, relations, comments and resources. An objective groups project issues around a result and tracks progress. A personal cycle selects one user’s weekly or fortnightly work across projects; it is not a shared sprint or project objective.


![Diagram: Project: shared work and knowledge. Issue: work; objective: intended result. Personal cycle: one user's cross-project work. Page: durable context; feedback: user need.](/documentation/en/glossary-and-data-model-flow.svg)

## Separate knowledge from requests {#knowledge-and-feedback}

A page stores durable context such as a specification, decision or runbook and can contain nested pages, attachments and discussion. A page database stores property columns with entries that are full pages. A feedback post describes a user need with votes and a public status, separately from an internal issue. Linking a post to an issue makes its public status follow that work. A saved view filters/sorts existing issues without changing them. The task notebook is private personal notes and checkboxes; promote an item when the project should track it.

## Connect the objects in a concrete workflow {#example}

For a release, create an objective in its project, describe the decision in a page and attach that page to implementation issues. A member adds selected issues to their personal cycle. Customer feedback can link to the relevant issue without exposing its private discussion. A routine starts a new scheduled Numo conversation using project context; it is neither a recurring issue nor a trigger on every project change. Keep object IDs and ownership when integrating: related context does not imply identical access.
