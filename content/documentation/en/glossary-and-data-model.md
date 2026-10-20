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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "content/knowledge/feedback.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "caption": "Shared project work and personal planning use different objects with their own access boundaries.",
      "revision": 5,
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

A project is the shared workspace for members, issues, categories, saved views, pages, integrations and its feedback board. Each person in it has a role: one owner, members who work on the content, and readers who follow it. An issue is a discrete unit of work with status, assignee and optional plan, due date, objective, categories, relations, comments and resources. An objective groups project issues around a result and tracks progress. A personal cycle selects one user’s weekly or fortnightly work across projects; it is not a shared sprint or project objective.


![Diagram: Project: shared work and knowledge. Issue: work; objective: intended result. Personal cycle: one user's cross-project work. Page: durable context; feedback: user need.](/documentation/en/glossary-and-data-model-flow.svg)

## Separate knowledge from requests {#knowledge-and-feedback}

A page stores durable context such as a specification, decision or runbook and can contain nested pages, attachments and discussion. A page database stores property columns with entries that are full pages. A feedback post describes a user need with votes and a public status, separately from an internal issue. Linking a post to an issue makes its public status follow that work. A saved view filters/sorts existing issues without changing them. The task notebook is private personal notes and checkboxes; promote an item when the project should track it.

## Connect the objects in a concrete workflow {#example}

For a release, create an objective in its project, describe the decision in a page and attach that page to implementation issues. A member adds selected issues to their personal cycle. Customer feedback can link to the relevant issue without exposing its private discussion. A routine starts a new Numo conversation with project context on a schedule or when a chosen event matches its conditions, such as an issue entering a status or a new database entry; it is not a recurring issue and does not change repository code. Keep object IDs and ownership when integrating: related context does not imply identical access.
