---
{
  "id": "task-notebook",
  "locale": "en",
  "title": "Capture notes in the private notebook",
  "summary": "Write quick notes and turn a selected task into project work when it needs tracking.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/productivity.md",
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "work-with-numo",
    "create-and-organize-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-task-notebook.png",
      "alt": "Localized demonstration tasks in the personal notebook.",
      "caption": "The notebook keeps personal steps outside the project issue hierarchy. The sample task states remain unchanged.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "task-notebook-steps"
  ]
}
---

## Capture the thought {#task-notebook}

Open the task notebook from the personal application controls, or use Command+Shift+K on macOS and Ctrl+Shift+K on Windows/Linux when focus is outside editable text. It is an account-owned scratchpad for notes and checkboxes. Add context, organize it into sections if useful, and use task checkboxes to track small personal steps before they become project issues.

The notebook is private rather than a project wiki. Choose a project page for information that colleagues must share. Numo can read or update the notebook when you request it, but another member's project membership does not make your notebook a shared document.

![Localized demonstration tasks in the personal notebook.](/documentation/en/work-task-notebook.png)

## Promote a task {#promote-note}

Open the task’s menu and choose its promotion action when the note becomes project work. This closes the notebook and opens Numo with a prepared request containing the task and its subtasks. The current project is used when you are browsing one; from a global surface, specify the destination project in the conversation. Review the request before sending it. This route needs available AI usage or a compatible personal key; opening it has not yet created an issue. After Numo reports creation, open the issue to check its identifier, scope and properties. Promotion should preserve the context needed to understand the task; add missing acceptance conditions to the issue.

If creation fails or the result is unclear after a network error, search for the resulting issue before promoting again. Keep unrelated notebook sections intact when asking Numo to change a task, and read the result to confirm it changed the intended checkbox rather than replacing the whole notebook.
