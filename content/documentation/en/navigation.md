---
{
  "id": "navigation",
  "locale": "en",
  "title": "Navigation and search",
  "summary": "Navigate personal and project work, use tabs and panels, and find accessible items with search and keyboard shortcuts.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-18",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-718 hybrid issue search; MIN-726 issue search order",
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "lib/use-hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (Documentation command and mobile transition source review; unchanged evidence retained); agent:/root (MIN-685 sidebar context menu source and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-695 badge propagation: source and unit-test review of app-shell-chrome, app-sidebar, mobile-navigation, app-tab-strip and lib/app-tab-indicators; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root (en changed-passage parity and label review); agent:/root (en MIN-685 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-718 added passages with catalog UI labels; agent review, not human acceptance); agent:/root (en MIN-695 badge paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-18"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Find personal work and switch projects",
    "Find work and use keyboard actions"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-navigation.png",
      "alt": "Project navigation beside the demonstration issue board.",
      "caption": "Use the project sidebar to switch between issues, objectives, pages and triage.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-search.png",
      "alt": "Search results for a demonstration issue identifier.",
      "caption": "The palette finds the issue by identifier alongside project pages; opening a result preserves its access rules.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        364
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

Use navigation to choose your personal work or a project, and the command palette to find a specific issue or action. Panels, mobile navigation and desktop tabs provide different ways to reach that work; check the selected project and instance before making changes.

## Find personal work and switch projects {#navigation}

The main navigation gives access to personal work and your projects. Select a project to see its own issues and secondary destinations, including triage, objectives, pages and project settings. The back row moves up one navigation level; it can change the sidebar's contents while the main page remains open. Select a destination to navigate there.

Counters and warnings follow you between levels. The control that leads back to **Home** shows the total waiting to be triaged across the projects **Home** lists, the current one included, and the Smart Assign warning when one of your projects needs rules. A back row shows the counter of the level it returns to. Inside a project, **Triage** and **Feedback** keep that project's own counts. Desktop tabs carry the same badge as their sidebar entry: the warning on **Home**, and the counts on **Inbox**, **Code review** and a project's **Triage** and **Feedback**, updated even when the tab is in the background.

Personal cycles and cross-project views span projects you can access. Project objectives, wiki and feedback belong to one project. Check the active project before creating work or changing settings.

![Project navigation beside the demonstration issue board.](/documentation/en/work-navigation.png)

### Act from a sidebar row {#sidebar-menus}

Right-click a row in the sidebar to act on what it represents without opening it first. Link rows also offer **Open in a new tab** and **Copy link**. An action that moves something to the trash always comes last, after a separator.

- The **All issues** row offers **New issue**, and the **Routines** row offers **New routine** when you own a project.
- A project row, or the project name at the top of its panel, offers **New** (an issue, objective or page in that project) and **Project settings**. The project owner also sees **Move to trash**, which asks for the same confirmation as the project settings. The same menu also offers **Hide project**, or **Show project** for a project you hid; see [Hide a project for yourself](/docs/projects#hide-project).
- A project tab offers its own creation entry: **New issue** on Issues, **New objective** on Objectives, **New page** on Pages and **New feedback** on Feedback, which opens the internal feedback composer.
- A routine row offers **Open latest run** and, to the project owner, **Run now**, **Pause** or **Resume**, **Edit** and **Move to trash**. See [Manage and verify runs](/docs/scheduled-routines#runs).
- A pull request row offers the state changes its current state allows, **Merge** when it is ready, and fix actions when something blocks it. See [Review and merge](/docs/code-work#decision).

The action applies to the row you clicked, even when another project or item is open.

### Panels and mobile navigation {#panels}

On mobile, a loading bar at the top indicates that navigation is in progress, including while pending page saves finish.

An issue opens in a detail panel so the underlying board remains available. Numo opens from its floating button in a shared conversation panel. Inbox opens as a navigation popover with notifications and invitations. Older dedicated Inbox and Numo links lead to the current entry points; they do not establish separate current screens.

On mobile, open the navigation drawer to choose the same destinations. Panels use the available screen width, so close or return from the current panel to see the list again. Use visible buttons when a keyboard shortcut is unavailable.

### Desktop tabs {#tabs}

The desktop app adds native tabs and a server picker around the application. A tab is a navigation surface, not a different project membership or account. Verify the selected instance when switching servers. Use the [desktop app section](/docs/applications#desktop-app) for installation, native shortcuts and update behavior; the product's page and issue permissions still apply.

## Find work and use keyboard actions {#search-and-shortcuts}

The Documentation command opens the public manual in your current language.

Open the command palette from the navigation search control. Search for a distinctive title or issue identifier and choose a result. Results are limited to work your account can access; a known identifier does not grant access to another project.

Press Command+K on macOS or Ctrl+K on Windows/Linux to open the command palette; Command/Ctrl+P is an alternative application binding. Outside editable text, ? opens shortcut help and C opens issue creation. On a hovered issue card or its supported detail controls, S opens status, P priority, E effort, A assignee, L categories, D due date and O objective. These single-key actions do not intercept typing in an input, textarea or content editor. Navigation sequences such as G then H (Home) and G then I (Inbox) use two successive keys; G then W reaches Pages only in a project context.

Use the keyboard shortcuts help to inspect the commands available on your platform. minddy distinguishes application shortcuts, issue-property actions and native desktop tab or window shortcuts. Check where focus is before using a command: typing inside an editor and acting on the surrounding issue are different contexts.

![Search results for a demonstration issue identifier.](/documentation/en/work-search.png)

### Order of issues in search {#issue-search-order}

Every issue search lists issues in the same order: the palette, `@` mentions, the relation, duplicate and pull request pickers, the feedback **Link to an existing issue** dialog, and the search used by Numo and MCP agents. **In progress** and **In review** issues come first, then **Backlog** and **Todo** issues. **Triage**, **Done**, **Canceled** and **Duplicate** issues always come last and stay selectable. Within each group, the best text match comes first. An identifier typed in full, such as `MIN-42`, puts that issue first, whatever its status.

### Search issues by meaning {#search-by-meaning}

When a query describes the work instead of naming it, issue search also finds issues with a close meaning, even when they use other words. For example, “login fails after a password reset” can find an issue titled “Session lost when the password changes”. This applies to the command palette, `@` mentions in descriptions, pages, comments and the Numo composer, the relation pickers, **Mark as duplicate…** in triage, **Link an issue** on a pull request, Numo's **Add context** → **Issue** menu and **Link to an existing issue** on feedback.

Text matches and exact identifiers always come first and keep their order. Shortly after you stop typing, at most five issues found by meaning are added after them under **Related by meaning**. An issue already listed is not repeated, and the highlighted row does not move. Each picker keeps its own rules, so only issues it could already offer appear: a relation picker, for example, still offers only issues of the same project that are not linked yet. The command palette searches the projects you can read, up to the 25 most recently updated; its bulk-selection actions do not use search by meaning.

Search by meaning has these limits:

- The query needs at least two words, or one word of at least six letters. Identifiers such as `MIN-42`, `#42` or `42`, and very short queries, use text search only.
- It relies on the index that Smart-fill builds from issue titles and descriptions. An issue not indexed yet, or whose author turned off [**Index issues**](/docs/issues#smart-fill-preferences), is found by its words only. Issues in the trash never appear.
- If you turned off **Index issues** in **Account settings** → **Preferences**, your searches compare words only. The same applies when the instance administrator turned off **Smart Fill relations**, when your AI budget is exhausted, or when the provider does not answer within a few seconds. The text results remain and no error is shown.
- An `@` query whose text already matches a person, a project or a page is not searched by meaning. In a project with more than 3,000 indexed issues, only the 3,000 most recently indexed are compared; the others are found by their words.

Each new query uses one AI call, counted in your **Automations** share and listed in usage history as **Issue search**. A query repeated within about 15 minutes is normally not charged again.

### Use an equivalent visible control {#shortcut-alternatives}

Issue fields have visible property pickers as well as keyboard actions. Use those pickers on mobile or when a shortcut is intercepted by the browser or operating system. Close an overlay or return focus to the intended surface before trying another action.

Search can find an issue absent from the current filtered view. If a result is missing, confirm the project, account and instance, then use a more distinctive query. Do not create a duplicate merely because the current board hides the task. The public documentation has its own localized text search, independent of Numo and provider configuration.
