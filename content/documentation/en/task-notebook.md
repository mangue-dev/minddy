---
{
  "id": "task-notebook",
  "locale": "en",
  "title": "Task notebook",
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
  "revision": 4,
  "sourceRevision": 4,
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
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Capture notes in the private notebook"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-task-notebook.png",
      "alt": "Localized demonstration tasks in the personal notebook.",
      "caption": "The notebook keeps personal steps outside the project issue hierarchy. The sample task states remain unchanged.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1156,
        1048
      ],
      "theme": "light",
      "padding": 24
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

Promotion uses Numo and needs available AI usage or a compatible personal key.

1. Open the task’s menu and choose its promotion action. The notebook closes and Numo opens with a prepared request containing the task and its subtasks.
2. Check the destination project. The current project is used when you are browsing one; from a global surface, specify it in the conversation.
3. Review and send the request. Opening the conversation alone has not created an issue.
4. After Numo reports creation, open the issue and check its identifier, scope and properties. Check that the task’s context was preserved and add any missing acceptance conditions.

If creation fails or the result is unclear after a network error, search for the resulting issue before promoting again. Keep unrelated notebook sections intact when asking Numo to change a task, and read the result to confirm it changed the intended checkbox rather than replacing the whole notebook.
