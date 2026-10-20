---
{
  "id": "code-work",
  "locale": "en",
  "title": "Code work and pull requests",
  "summary": "Hand an issue to your own coding agent with a copied prompt and minddy MCP, then review and merge the linked pull request.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 17,
  "sourceRevision": 17,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-721 removal of Numo code work (copied prompts and MCP for external agents, pull request review and merge retained); MIN-685 sidebar context menus; MIN-693 project roles; MIN-718 hybrid issue search; MIN-737 account settings reorganization; MIN-686 shared reader for pull request images; UI/UX refinements batch: Link to a pull request offered only with a linkable pull request",
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
      "components/agent/use-agent-menu-actions.tsx",
      "components/agent/custom-prompt-dialog.tsx",
      "components/settings/account-preferences-section.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-unresolved-conversations.tsx",
      "lib/server/agent/pr-mention.ts",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/pull-requests/pr-link-issue.tsx",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "components/markdown-image.tsx",
      "components/pull-requests/pr-image-diff.tsx",
      "components/image-viewer.tsx",
      "components/issue-card.tsx"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min721_docs (MIN-721 source review: Numo code work, sandboxes, native code agents and AI pull request review removed; copied prompts, MCP, pull request review, Merge with Numo and read-only @numo mention verified in source; no operational rerun, no new capture); agent:/root (MIN-685 sidebar context menu source and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (board pull request linking and card merge readiness: source and unit-test review of use-issue-menu-actions, pr-link-target-picker, bulk-pull-request-links and issue-pr-context; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (bulk link rule, unlink from all pull requests and optimistic links: source and unit-test review of bulk-pull-request-links and use-link-issues-to-pull-request; no browser walkthrough with live pull requests; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Starting an issue card in components/settings/account-issues-section.tsx; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-686 pull request images: source and unit-test review of MarkdownImage and PrImageDiff opening the shared reader, Close and Escape dismissal; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of LinkablePullRequestsProbe in components/pull-requests/pr-link-target-picker.tsx (open pull requests, drafts included) and the gated board-card menu entry in components/issue-card.tsx; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/min721_docs (en rewrite and retained-meaning review; agent review, not human acceptance); agent:/root (en MIN-685 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-718 added passages with catalog UI labels; agent review, not human acceptance); agent:/root (en board pull request linking paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (en added sentences, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-686 added sentence with catalog UI labels; agent review, not human acceptance); agent:/root (en Link to a pull request entry changed passage with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "issues",
    "minddy-mcp",
    "git"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Hand an issue to an external coding agent",
    "Review a linked pull request"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/review-pull-requests-workflow.png",
      "alt": "Changes tab of the open demonstration PR, with the greeting function diff and an unavailable GitHub authorization notice.",
      "caption": "Demonstration PR that remains open and unmerged. Its diff trims the name and uses World for an empty value. This instance cannot request user GitHub authorization; the readiness label does not grant merge permission or prove successful provider CI.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

Minddy tracks the work; your own coding agent, such as Claude Code, Codex or Cursor, changes the code. Copy a prompt from the issue, let the agent read and update the issue through minddy MCP, then review the linked pull request in Minddy before merging. Numo does not write code, open branches or run tests.

## Hand an issue to an external coding agent {#external-coding-agents}

Connect your agent to minddy MCP first so it can read the plan and update its tasks; see [Connect an external assistant to minddy MCP](/docs/minddy-mcp#external-minddy-mcp). The agent runs on your computer or in its own service, with its own subscription or API costs. Minddy does not supply it with repository access.

1. Open the issue and describe the expected behavior, constraints and acceptance checks. Write or review the plan in its Plan tab when the work has several steps.
2. Open the issue's actions menu and choose **Copy as prompt**. Choose **Generate a plan** (or **Review the plan** when one exists) to scope the work without coding, **Implement the issue** to start the change, **Verify the implementation** to have the agent review finished work against the plan and comments, or **Custom…** to write your own instruction.
3. Paste the prompt into your agent in the repository's working copy. Copying runs no AI model and uses no AI allowance.
4. Follow the plan progress in the issue as the agent updates its tasks through MCP. Answer its questions in the agent, or add decisions to the issue so the next prompt carries them.

The prompt contents, branch suggestion and language rules are described in [Copy a prompt for another coding agent](/docs/issues#copy-issue-prompt).

### Keep the work linked to the issue {#link-work}

When the repository is linked to the project, keep the issue identifier in the branch name, the pull request title or a `Fixes MIN-42` line. Minddy then attaches the pull request to the issue, and later prompts tell the agent to continue the open pull request on its branch. To attach an issue by hand, use **Link an issue** on the pull request. Its search accepts an identifier or title words, and a description also lists issues of the project found [by meaning](/docs/navigation#search-by-meaning) under **Related by meaning**.

From a board, right-click an issue without an open pull request and choose **Link to a pull request** to pick one of its project's open pull requests, drafts included. The entry appears only when that project has at least one such pull request to link to. With several issues selected, **Actions** offers the same choice for the whole selection, and **Link the other issues to #N** when some of them already have pull request N. **Link to a pull request** is not offered once a selected issue has any linked pull request; **Unlink N issues from their pull requests** removes every link of the selection first, after you confirm. Links show on the cards immediately, and a refused link is put back when the board refreshes. A card with an open pull request shows its number, coloured by state, and its merge readiness, the same indicator as on **Code review**.

In **Account settings → Issues → Starting an issue**, **Start the issue or task when I copy its prompt** moves an issue or notebook task that has not started yet into progress when you copy its prompt. Leave it off if you copy prompts only to read them.

## Review a linked pull request {#review-pull-requests}

Open the pull request linked to an issue, or find it in the pull request list. Repository access is still required; project membership alone does not grant forge permissions.

Read the description and activity, then inspect changed files and diff hunks. Open unresolved conversations and respond in the relevant thread rather than creating an unrelated comment. To hand the remaining feedback back to your agent, open **View conversations**, then **Fix all** and **Copy prompt**. File review marks help track your reading; they are not a provider approval. Check commits, CI results and linked issues to confirm the proposed change covers the requested work.

In a description, a comment or the diff of an image, click an image to open it across the whole window; an image diff opens its **Before** and **After** sides separately. Use **Close** or Escape to return to the pull request.

Mention `@numo` in a pull request comment to ask Numo for a read-only review in a conversation. It reads the pull request and answers; it does not push commits. A mention written on the forge counts only when its author is linked to the owner or a Member (not a reader) of a project that links the repository, and its usage is charged to that project's owner.

![Changes tab of the open demonstration PR, with the greeting function diff and an unavailable GitHub authorization notice.](/documentation/en/review-pull-requests-workflow.png)

### Review and merge {#decision}

Use **Request a review** to choose a reviewer when a second review is needed. Check the draft or ready-for-review state, unresolved discussions, requested reviews and provider merge policy.

Merge only after the applicable checks and reviews are satisfied and your provider account has permission. **Merge with Numo** lets Numo write the merge commit title and description from the pull request, then merges as soon as they are ready. A visible action can still be rejected by the forge. If the displayed state is stale, refresh and inspect the provider before repeating an action. A linked preview depends on a real provider deployment.

Right-click a pull request in the list to change its state, merge it or ask for a fix without opening it. An open pull request offers **Convert to draft** and **Close pull request**, a draft offers **Ready for review** and **Close pull request**, and a closed one offers **Reopen**; each change asks for confirmation. A merged pull request offers no state change. Write actions appear only when your provider account can write to the repository, and stay unavailable until the menu has re-read the pull request. **Merge** appears when the pull request is open, not a draft and ready to merge; it opens the pull request on its usual merge confirmation. **Copy fix prompt** and **Fix with Numo** appear when a check fails, a conversation is unresolved, or the branch conflicts or is out of date. **Fix with Numo** sends that prompt to Numo with the pull request as context. Numo can read the pull request, answer a review conversation that needs no code change and resolve conversations the branch already addresses, but it does not change code or push commits; for the code changes, use **Copy fix prompt** and paste it into your coding agent. Permissions and mergeability are checked again when you confirm.
