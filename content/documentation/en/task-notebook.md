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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-728 one editor engine; MIN-725 notebook search in the command palette; UI/UX refinements batch: task list first in the notebook / menu",
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
      "components/scratchpad/scratchpad-trigger.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "components/scratchpad/scratchpad-editor.tsx",
      "lib/scratchpad-search.ts",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-728 one editor engine: source and unit-test review of the shared editor on this surface; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-725 notebook search in the command palette: source and unit-test review of lib/scratchpad-search.ts, the palette rows and the notebook focus; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of SCRATCHPAD_SLASH_FIRST in components/scratchpad/scratchpad-editor.tsx and the slashFirst ordering in components/editor/rich-editor.tsx; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (en editorial review of the MIN-728 passage); agent:/root (en MIN-725 added paragraph with catalog UI labels; agent review, not human acceptance); agent:/root (en slash menu order changed passage with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 7,
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

To find a task again, open the command palette with Command+K on macOS or Ctrl+K on Windows/Linux and type words from it. Tasks still to do appear under **Task notebook**, with their section; completed and canceled tasks and questions do not. Choose one to open the notebook on that task. Before you type, the palette does not list notebook tasks.

The notebook uses the same editor as project pages, with the same block handles: hover a block to drag it, open its menu or add a block with **+**. Type `/` to insert a task, listed first, or a heading, list, quote, **Callout**, code block, **Toggle** or divider, or choose **Dictate a task** to speak tasks aloud. The notebook is still saved as Markdown, so Numo and connected agents read the same tasks and states. Select text to format it or add a link. Paste or drop an image, or choose **Image** in the `/` menu, to insert it in a note. Other kinds of files belong in pages.

The **Notebook actions** menu (`…`) offers **Copy all as prompt**, which copies the whole notebook for your own coding agent, and **Remove done and dropped tasks**. Removal asks for confirmation, deletes completed and canceled tasks with the headings they leave empty, and keeps tasks to do or in progress. To copy less, use a heading's **Copy section as prompt** control or a task's **Copy as prompt**. If **Start the issue or task when I copy its prompt** is enabled in **Account settings** → **Issues**, copying also moves the copied pending tasks to in progress.

The notebook is private rather than a project wiki. Choose a project page for information that colleagues must share. Numo can read or update the notebook when you request it, but another member's project membership does not make your notebook a shared document.

![Localized demonstration tasks in the personal notebook.](/documentation/en/work-task-notebook.png)

## Promote a task {#promote-note}

Promotion uses Numo and needs available AI usage or a compatible personal key.

1. Open the task’s menu and choose **Promote to issue**. The notebook closes and Numo opens with a prepared request containing the task and its subtasks.
2. Check the destination project. The current project is used when you are browsing one; from a global surface, specify it in the conversation.
3. Review and send the request. Opening the conversation alone has not created an issue.
4. After Numo reports creation, open the issue and check its identifier, scope and properties. Check that the task’s context was preserved and add any missing acceptance conditions. The prepared request also asks Numo to remove the task from the notebook once the issue exists, so look for it in the issue rather than in the notebook.

If creation fails or the result is unclear after a network error, search for the resulting issue before promoting again. Keep unrelated notebook sections intact when asking Numo to change a task, and read the result to confirm it changed the intended checkbox rather than replacing the whole notebook.
