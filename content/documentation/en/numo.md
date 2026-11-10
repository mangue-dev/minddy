---
{
  "id": "numo",
  "locale": "en",
  "title": "Numo",
  "summary": "Work with Numo, understand its permissions and execution, connect MCP services and recover waiting or interrupted work.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 37,
  "sourceRevision": 37,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "app/(app)/home/page.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts",
      "lib/server/numo-notes.ts",
      "lib/server/numo/memory-prompt.ts",
      "components/settings/account-numo-memory-section.tsx",
      "lib/server/assistant/long-message.ts",
      "lib/server/assistant/create-page-database.ts",
      "lib/server/numo/journal-content.ts",
      "lib/server/numo/journal-prompt.ts",
      "lib/server/numo/wake.ts",
      "lib/server/assistant/proactive-guard.ts",
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts",
      "lib/numo-watches.ts",
      "lib/server/numo/watch-proposal.ts",
      "components/assistant/watch-proposal-card.tsx",
      "lib/server/numo/watch-prompt.ts",
      "lib/server/assistant/context-compaction.ts",
      "lib/server/assistant/conversation-config.ts",
      "components/assistant/conversation-settings.tsx",
      "components/settings/account-numo-section.tsx"
    ]
  },
  "review": {
    "revision": 37,
    "fact": "agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-946: AI budget warning sentence of #home-word, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-953: recurring reminders section and the last paragraph of #reminders, source audit against lib/numo-watches.ts, lib/server/numo/watches.ts, watch-clock.ts, watch-proposal.ts, lib/server/assistant/proactive-guard.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: step 2 of #work-with-numo, the default-model paragraph, the compaction paragraph of #continue and the model sentence of #numo-execution-model, source audit against lib/server/assistant/conversation-config.ts, lib/server/assistant/context-compaction.ts, components/assistant/conversation-settings.tsx and messages/*.json; no browser walkthrough; no figure shows the model control or the compaction step; existing figures kept, not recaptured); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-955: the paragraph on what Numo can change in #numo-permissions-and-approvals, source audit against lib/server/assistant/settings-coverage.ts, lib/server/account-settings.ts and the update_member_role tool; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-914 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-915 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-927 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-929 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-923 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-930 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-946 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-953 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-955 passage with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Complete a project task with Numo",
    "Understand what Numo can change",
    "Understand durable Numo turns",
    "Connect a personal MCP service to Numo",
    "Recover stopped or waiting Numo work"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/work-with-numo-workflow.png",
      "alt": "Numo demonstration conversation with page context, a priority-change request and its saved answer.",
      "caption": "Existing demonstration thread, localized for display. The saved answer names AUR-11 and AUR-7; this capture does not prove a new execution.",
      "revision": 37,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/en/numo-permissions-and-approvals-workflow.svg",
      "alt": "Permission matrix for Numo project actions, personal connections and routines.",
      "caption": "Project access and explicit instructions limit Numo actions; external content cannot grant permission.",
      "revision": 37,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo: access and authorization",
        "headers": [
          "Action or context",
          "Who authorizes it",
          "Boundary"
        ],
        "rows": [
          [
            "Project work",
            "Member with project access",
            "Existing project permissions still apply"
          ],
          [
            "Owner settings",
            "Project owner",
            "Membership, repository and feedback settings"
          ],
          [
            "Credentials and security",
            "Account holder, in settings",
            "Configure keys, Git and two-factor authentication directly"
          ],
          [
            "Public feedback reply",
            "An explicit user request",
            "Reading a request does not authorize a public reply"
          ],
          [
            "Personal MCP",
            "The conversation caller",
            "No other member’s personal connections"
          ],
          [
            "Scheduled routine",
            "Current project owner",
            "Owner’s connections and AI budget"
          ],
          [
            "Remote MCP result",
            "Untrusted service content",
            "Cannot authorize additional actions"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/en/numo-execution-model-flow.svg",
      "alt": "Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for your answer when input is needed. Replay durable events; reconcile uncertain writes.",
      "caption": "Read the stages in order. Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for your answer when input is needed. Replay durable events; reconcile uncertain writes.",
      "revision": 37,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Persist the intent, message and request UUID"
          },
          {
            "title": "Claim turn, checkpoint tools and their outcomes"
          },
          {
            "title": "Wait for your answer when input is needed"
          },
          {
            "title": "Replay durable events; reconcile uncertain writes"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/numo-mcp-connections-workflow.png",
      "alt": "Personal MCP settings, empty connection list and Add another MCP server control.",
      "caption": "Numo connections are personal; project routines use the project owner’s connections.",
      "revision": 37,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/numo-mcp-connections-config-workflow.png",
      "alt": "Notion connection wizard showing the sign-in method known from the catalog.",
      "caption": "Sign-in step for a catalog service. No credentials were entered and no server was contacted.",
      "revision": 37,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        560,
        354
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

Numo works from your conversation’s context and your account’s permissions. Begin with a bounded request, check the result, and use the permission and execution sections to understand scheduled work. For a waiting or failed turn, inspect the saved state before repeating a request.

## Complete a project task with Numo {#work-with-numo}

Open the issue or project you want to work on, then use the floating Numo button. The current page becomes conversation context. Contextual actions that hand work to Numo open this same panel. You need access to the project and available AI usage or a compatible personal key.

1. Check the context shown in the composer. Name the issue explicitly if several items are relevant. To add an issue as context, type `@` in the composer or use **Add context**, which groups the context into the same sections as the `@` menu, issues under **Issues** and your connected MCP servers under **MCP servers**; a description also lists issues found [by meaning](/docs/navigation#search-by-meaning) under **Related by meaning**.
2. On minddy Cloud, Numo runs the model and reasoning level chosen by your instance's administrator, as Smart Fill and Smart Assign do, and the composer shows no model control. With a personal key for Numo, the provider logo next to the microphone chooses the conversation's provider, model and reasoning level; hovering it names the current model. When the model offers no reasoning control, the reasoning slider stays on **No reasoning**; on a model that always reasons, **No reasoning** runs its lightest level. The same logo switches the conversation back to **minddy Cloud**.
3. Send a bounded request, for example: “Read this issue and propose acceptance criteria. Do not change its status.”
4. Read the answer and follow its issue or source links. For an action request, open the changed object and check the result. Issues, objectives, projects, pages and members that Numo found appear in its answer as mention pills: a pill opens its target, and one you cannot see shows as **Unavailable**. Numo also writes these mentions into what it writes, such as issue descriptions and plans, objective descriptions, comments, pages and the notebook, only for items it identified; a member mentioned there is notified as with any mention.

In a new, empty conversation, four suggestion rows above the composer offer requests suited to the current page, for example **Summarize this issue** or **Write an implementation plan** when an issue is open in the side panel. Choosing a row fills the composer without sending it, so you can edit the request first. The rows disappear as soon as the composer contains text and return when you clear it. They appear in the desktop layout, not on a phone. The composer at the bottom of **Home** shows the same rows, with suggestions such as **Choose what to focus on today** or **Find what's overdue**. **Home** is itself a Numo conversation, the same as the panel without its header: each visit opens a new one, unless a reply is still running, and it stays separate from the one open in the panel; the one before stays in the history, and the **New conversation** button at the top right starts another. Once Numo has written its summary, the rows on **Home** are the suggestions written with it ([Numo's summary on Home](#home-word)).

On **Home**, and in the Numo panel when it is expanded or has focus, you can start typing without clicking the composer: a quick burst of keys typed outside a text field goes into the composer, which takes focus. A single key on its own still runs its keyboard shortcut, for example C to create an issue, about 0.2 seconds later on those screens. G followed by one key stays a navigation sequence; a third key in the burst turns it into text.

To ask about a passage, select it in an editor, such as a page or an issue description, then choose **Ask Numo** in the selection toolbar on desktop. The panel opens without sending anything: next to the page or issue it comes from, the passage appears as a context pill showing its first words, and hovering the pill shows the whole passage. Type your question, for example “Rewrite this more concisely” or “Make issues from this”, and send it. The passage goes with that message only. To leave it out, remove its pill with its cross.

Numo can also look at the images in an issue or objective description, a plan, a comment, a page or your notebook when the conversation model accepts images. Without that capability, Numo says it could not view an image instead of describing it.

Numo can also write a file for you to download: a report or a document as PDF, an export as CSV, or a text, Markdown, HTML, JSON, XML, SVG or calendar file. Ask for it in your request; Numo can build it from files you added to the conversation. The file appears as a card under its answer: selecting the card opens its preview when the format allows it, **Download** saves it, and the menu next to it offers **Preview** and **Copy contents**. The file stays in your conversation’s private storage; to share it with the project, ask Numo to attach it to an issue, an objective or a comment it posts there. A PDF uses the standard fonts: characters outside Western European alphabets, and emoji, are left out.

When you paste a text longer than 12,000 characters into the composer, such as logs, it joins your message as a **Pasted text** attachment instead of filling the composer. Numo reads the whole file before relying on it, so a CSV built from your logs covers every line. A long message that reaches Numo another way is attached the same way: the message keeps its first lines and names the file.

When you ask for something to track, or for a list of items that share fields, such as job applications with their company, status and date, Numo creates a [database](/docs/databases) with those columns and its first entries rather than a page.

With a personal key, the default Numo model comes from **Account settings → AI → Numo → Conversations**, saved for that provider: App default or a model you choose. A conversation's own choice takes precedence. On minddy Cloud there is no model to choose. See [AI settings and usage](/docs/ai-settings-and-usage#ai-keys-and-models).

![Numo demonstration conversation with page context, a priority-change request and its saved answer.](/documentation/en/work-with-numo-workflow.png)

### Continue a conversation {#continue}

The conversation list keeps earlier conversations reachable. Continue the existing conversation when it contains the needed decisions. Numo organizes and tracks work: it reads and updates issues, plans, pages and other minddy content, and can read linked pull requests. When you ask, it can also comment on a pull request, resolve review conversations that are already addressed and merge it. When Numo searches issues, text matches and exact identifiers come first; a descriptive search can add issues of the same project found by meaning, which Numo is told to check before relying on them. It does not write code or push commits. To have code written, copy the issue's prompt for your own coding agent; see [Code work and pull requests](/docs/code-work#external-coding-agents).

When a conversation grows too long to resend cheaply, about 90,000 tokens or three quarters of what the model can read if that is less, Numo compacts it before its next call: the reply shows **Compacting the context…**, then **Context compacted**. Numo summarizes the older messages and tool results and keeps your last message and the latest exchanges word for word; later replies start from that summary. The summary counts toward AI usage like the rest of the reply. If it fails, the step reads **Couldn't compact the context** and Numo answers from the whole conversation.

If Numo asks for input, submit the requested choice before expecting dependent work to continue. A usage or failure card explains why a turn stopped. Verify any external write before asking it to repeat the action.

## Understand what Numo can change {#numo-permissions-and-approvals}

Numo acts within the current user's access and role. A project member cannot gain owner-only settings by requesting them in chat. A reader's Numo, in chat or through `@Numo` in a comment they are allowed to post, uses only read tools and is billed to the reader. Owners manage project membership, integrations, repository linking and feedback settings. Personal settings belong to the current account.

Numo can change your account preferences, hide or show projects for you and, when you own a project, its settings, members and their roles. Some gestures stay yours: provider keys and AI models, Git connections, sign-in, two-factor authentication and connected apps, the avatar and project icon, ownership transfers, data export and account deletion.

### Authorize the action {#authorization}

Describe the intended change and its scope. Reading a request does not authorize a public answer: Numo sends public feedback replies only when explicitly asked. Remote MCP instructions or results cannot authorize additional actions. Connect a service only if you trust it with the information and actions you intend to send.

A request may reach an external provider. Disabling its connection stops new calls but cannot recall one already sent. Verify a timed-out write at the destination before retrying.

### Personal and scheduled context {#context}

Conversations cannot borrow another member's personal MCP connections. Project routines use the project owner's connections and AI budget. After an ownership transfer, the former owner's routines in the project are paused; the new owner creates the routines that should continue. An old occurrence cannot keep using the former owner's credentials. Numo runs on the server: it does not read files on your computer or use your personal sessions.

Numo can leave a message in your Inbox, with a push alert, when a routine finds something that needs your attention or when you ask it to tell you later. The message goes only to the account Numo works for, which in a routine is its owner. The Messages from Numo switch in [notification preferences](/docs/notifications-and-inbox#notification-preferences) turns these messages off.

![Permission matrix for Numo project actions, personal connections and routines.](/documentation/en/numo-permissions-and-approvals-workflow.svg)

### Numo's memory {#memory}

Numo keeps short memories about you so you don't have to repeat yourself: a preference such as "write my issue titles in English", a fact such as "the Mobile project is paused until January", or a standing instruction. It saves one when you ask ("remember that…") or when you state a preference you clearly want applied next time, and says so in its reply. Your memories then apply in every conversation.

A memory applies to all your projects or to one; Numo asks when it can't tell which. A project memory is used in that project's conversations, and when Numo works on that project from another conversation. Memories are yours alone: other members don't see them and their Numo doesn't use them. Routines and `@Numo` in a comment read your memories but can't change them. You can keep up to 100 memories of 1,000 characters each; at the limit, Numo asks which one to replace.

**Account settings → Numo → Memories** lists every memory with the project it applies to. **Edit** changes its text, **Delete** removes it, and **Forget everything** removes them all; a deletion can't be undone. You can also ask Numo to forget something. **Numo's memory** in the **Numo** card above turns memory off: Numo then neither reads nor saves memories, and the saved ones are kept.

### Numo's journal {#journal}

Numo keeps a journal of what waits for you and of what it did for you while you weren't watching: "PR #12 has waited for your review for 3 days", "I did the web research asked for in MIN-42". It writes an entry when you ask it to keep track of something ("note that I'm waiting for the client"), and, in a routine or an `@Numo` comment, when it changes your content. It closes the entry once the matter is settled. The conversation then shows **Noted in the journal** or **Journal entry closed**. The journal is yours alone, sends no notification, and closed entries are deleted within 180 days. **Home** sums it up ([Numo's summary on Home](#home-word)); to see every entry, ask Numo in a conversation, or tell it to close one.

### Numo's summary on Home {#home-word}

When **Home** opens its new conversation, Numo writes first, under the greeting: a few sentences that sum up its journal, with what waits for you first, then what it did that touches your content, then what it offers to do on its own. The records it names, such as an issue or a page, open in one click. When Numo produced something for you, such as a summary of your projects or research, the summary gives its key facts and figures rather than sending you to a conversation. Numo rewrites the summary in the background after each turn that writes or closes a journal entry, so it is up to date before you open **Home**, and opening the page doesn't call the AI. When an entry it covers is settled in the meantime, **Home** hides the summary until Numo has written the next one. Showing the summary marks the entries it covers as seen: a later summary leaves out what was settled and mentions again only what still waits for you. When your AI budget is on track to run out before it resets, the summary opens with it: the day it runs out at the current pace and the share already used, in percent. When nothing in the journal is open or unseen and the budget will last, there is no summary.

Once you write, the greeting and the summary stay at the top of the conversation you start under them on **Home**, the summary as Numo's opening message; without a summary, the conversation starts with your message. It is saved as Numo's first message of that conversation: Numo reads it when it answers, as the continuation of what it said, and the panel and the history show it too. Above the composer, up to four suggestions written with the summary replace the usual rows, or none when nothing specific fits. They also serve as quick answers, for example **Yes, do it on your own from now on**, and each one is a complete request. Choosing one fills the composer without sending it. With Numo in the background off, **Home** opens on the greeting and the usual rows, with no summary. On an instance without AI, there is no conversation: **Home** shows the greeting and your account notices, such as pending invitations or the desktop app.

### Numo in the background {#background}

**Account settings → Numo → Numo in the background** is on by default: Numo works for you while you're away. When something in your projects concerns you, such as an issue assigned to you, a mention or a failed routine, or matches what one of your memories asks it to watch for, Numo wakes up a few minutes later and acts with the same tools and model as in a conversation. With the memory "for every new issue in MIN that needs web research, do it and post the result as a comment", it researches each new issue, posts the comment and notes it in its journal, where it writes what it did and what waits for you. **Home** sums up what it noted. The switch needs Numo's memory: while memory is off, background Numo is off, and it comes back on with the memory.

In a shared project, Numo changes only what is yours: issues assigned to you or that you created, objectives you lead, pages you created. Creating content there, or changing anything else, needs a memory that asks for it. In every project, including one where you work alone, it doesn't trash or restore anything, act on a pull request, call an external MCP tool, administer the project (settings, members, integrations), change your account settings or reply publicly to feedback unless one of your memories allows that action. The server checks that the memory exists, is yours and applies to the project the action touches. Numo sends an Inbox message only when a memory asks for it, or for something urgent, and then at most twice in 24 hours.

If you are an instance administrator with two-factor authentication on, Numo in the background can also [administer the instance](/docs/instance-administration#numo). It reads the AI model configuration and the AI costs on its own, so you can give it a memory such as "watch the AI models configured on the instance and tell me when a cheaper one does the job". Changing or importing the model configuration, looking up an account or changing its plan needs a memory that allows that action; without one, Numo asks in its journal and **Home** shows the question. Your account is checked before each of these actions: once it loses the administrator role or two-factor authentication, Numo loses them too.

When an action needs a permission it doesn't have, Numo asks in its journal and offers to do it on its own next time. To allow it, tell Numo in a conversation, for example "yes, always do that": it saves a memory and uses it at its next wake. To restrict Numo, give it a memory such as "in the Design project, only note things in the journal", edit or delete the memory that allowed an action, or turn the switch off: a wake that hasn't started yet is then cancelled, and one already running finishes. Screening your events, each wake and Numo's summary on **Home** count toward your AI usage, and an administrator sets how many wakes a member gets in 24 hours, 20 by default. Each wake runs in a conversation of its own, not listed with your conversations and deleted after 30 days.

### Numo's reminders {#reminders}

Ask Numo in a conversation to think of something for you later: "once MIN-42 is done, remind me to tell the client", "when the 0.40 objective is done, create the release issue", or "remind me on Friday at 9:00 to send the invoice". Numo sets a reminder on an issue (a status, or a comment from someone else), an objective (a status) or a date, and the conversation shows **Reminder set**. Until the condition is met, nothing runs and nothing counts toward your AI usage: minddy checks it every five minutes.

Once the condition is met, the reminder fires once. For something you'll do yourself, you get an Inbox message from Numo with your instruction. For something you asked Numo to do, the message says Numo is on it, and Numo carries out the instruction in the conversation where you set the reminder (in a new one if that conversation was deleted or is busy), with the tools and rights you have at that moment; that turn counts toward your AI usage. Nobody watches that turn, so Numo doesn't ask questions, change its memory, or trash, merge or administer anything; it says in its reply what it left for you. If your usage limit is reached, or the turn fails, you get a message and Numo doesn't act. With **Messages from Numo** turned off, no message arrives. When Numo changed something on a reminder, an issue, a page or a comment for example, it notes what it did in its journal, and [Numo's summary on Home](#home-word) tells you about it. A reminder that only sends you a message doesn't appear there.

A reminder whose condition is never met expires after 90 days, and you can keep 20 at a time. While its issue or objective is in the trash, a reminder waits; it is cancelled when the record is deleted for good or when you lose access to its project.

A one-off reminder fires once, for one issue, objective or date; for something that comes back, set a [recurring reminder](#recurring-reminders). Only you set a reminder, in a conversation with Numo: routines, `@Numo` mentions, Numo in the background and a reminder's own run can't set, change or cancel one. **Account settings → Numo → Reminders** lists the reminders you keep, and **Cancel reminder** removes one. To change a reminder, ask Numo.

### Recurring reminders {#recurring-reminders}

A reminder can also come back on a schedule: "every evening at 19:00, review my issues and prepare tomorrow", or "every Monday at 9:00, check the model costs and warn me if they drift". Numo sets it for every day, Monday to Friday, one day a week or one day a month, at a time on your clock, which it keeps across daylight saving changes. A month shorter than the day you chose uses its last day. A recurring reminder doesn't expire, and you can keep 5 active ones among your 20.

Each time, Numo carries out the instruction in a new conversation named after the reminder and the day, with the tools and rights you have at that moment; that run counts toward your AI usage. Nobody watches it, so Numo doesn't ask questions or change its memory, and it keeps to the limits of [Numo in the background](#background): in a project with other members it changes only what is yours, and it takes no sensitive action. Your memories don't lift those limits here; only the reminder's own permissions do. Numo notes its result in its journal, which [Numo's summary on Home](#home-word) reports. No message announces each run.

To let a recurring reminder do more, ask for it when you set the reminder. It can be allowed to notify you when nothing is urgent, change content that isn't yours in a shared project, act on pull requests, call your external MCP tools, reply publicly to feedback, use the trash, remove members, invitations and integrations, change your account settings, or administer your projects and, for an administrator, the instance. Numo then saves nothing itself: the conversation shows a card that lists what the reminder will be allowed to do, and **Allow and set reminder** saves it. Your own rights are checked again at every run: a reminder allowed to administer the instance gets no admin tool once your account is no longer an administrator, and a reminder is cancelled when you lose access to its project. Numo can't add a permission to a reminder, or reword one that holds permissions: it proposes a replacement, which you confirm on a new card.

A run that minddy missed by more than six hours is skipped. When a run doesn't finish, or your usage limit is reached, you get a message. After 3 runs in a row that don't finish, the reminder is paused and a message tells you. **Account settings → Numo → Reminders** shows each recurring reminder's schedule, its next run, what it is allowed to do and its last run, with a link to that conversation. **Pause reminder** stops it and **Resume reminder** restarts it at its next run.

A recurring reminder is yours; a routine belongs to a project. Only you see your reminder and its conversations, it runs with your rights and on your AI usage, and it can hold permissions. Every member of the project sees a routine and its runs, it runs on the project owner's usage and connections, it can also start on an event, and it never reaches instance administration. Use a recurring reminder for your own habits and a routine for work the team shares.

## Understand durable Numo turns {#numo-execution-model}

Interactive messages, contextual actions and scheduled routines enter Numo conversations. On a personal key, the conversation's model and reasoning level are chosen in the composer; on minddy Cloud they come from the instance. Numo acts through its minddy tools and any personal MCP connections you added; it needs no repository. A routine creates a new occurrence conversation using its saved instruction and owner/project context. No desktop session needs to remain online.

![Diagram: Persist the intent, message and request UUID. Claim turn, checkpoint tools and their outcomes. Wait for your answer when input is needed. Replay durable events; reconcile uncertain writes.](/documentation/en/numo-execution-model-flow.svg)

### Separate durable execution from its display {#state}

A user intent is persisted as a durable turn with its request UUID and message. The state advances through `queued` and `running`, then `completed` or `waiting_input`; `stopping`/`stopped` and `retryable`/`failed` describe interruption and failure. SSE displays persisted activity but does not own execution. Reconnecting reads recorded messages/events after its sequence. Duplicate and stale events do not create another task. Project context is separate from access: an owner-only chat stays private.

### Treat uncertain mutations explicitly {#mutations}

Before mutation, the system records the operation and checkpoint. Completed results are reused. An interrupted read can retry, but a mutation whose outcome is unknown enters `reconciling` rather than automatically repeating. Inspect the actual destination before retrying an external write. Routine owner connections and budget remain subject to ownership and cost guards; another member cannot borrow the previous owner’s personal MCP credentials.

Stopping Numo ends its turn. An external action already sent may still complete. A conversation that was waiting on code work from an earlier version is stopped automatically and returns to idle.

## Connect a personal MCP service to Numo {#numo-mcp-connections}

In account settings, open **MCP** and use the **MCP for Numo** card. Links to the former MCP for Numo tab open there. Choose a catalog service or add another public HTTPS MCP server. The catalog and registry search do not bypass provider registration or approval requirements. Numo can prepare a connection in an interactive conversation, but an unattended routine cannot create one.

Connecting runs as a wizard. A custom or registry server first asks for its name and HTTPS address; a catalog service opens on the sign-in step. A catalog service, a saved connection or a registry entry that declares a token already knows its sign-in method: the step shows it, and **Use another method** changes it. Otherwise, choose **Sign in with OAuth**, **Bearer token** or **No authentication**. **Advanced settings** hold the transport (Streamable HTTP by default, legacy SSE supported) and encrypted custom headers. Put secrets in credentials or headers, never the URL. Local commands and private-network endpoints are unsupported. For an existing OAuth app, register the displayed callback URL and enter its client ID and secret. After saving, the last step waits for sign-in, then tests the connection and shows how many tools Numo found. In the desktop app, only the provider's sign-in page opens in the system browser: you don't need to be signed in to minddy there, and the app finishes the connection when you return.

![Personal MCP settings, empty connection list and Add another MCP server control.](/documentation/en/numo-mcp-connections-workflow.png)

### Test, reconnect and remove {#manage}

Use the connection menu to test, edit, reconnect, disable or remove it. An orange authentication warning needs reconnection. Blank credential fields preserve existing secrets; changing the URL clears them and custom headers. Remove a saved bearer token with its dedicated control; `{}` clears custom headers.

Disabling stops new calls, not requests already sent. Calls have a 30-second deadline, 1 MiB transport limit and 64 KB result limit. Verify timed-out writes remotely before retrying. Project routines use the owner's connections; other members cannot borrow them.

![Notion connection wizard showing the sign-in method known from the catalog.](/documentation/en/numo-mcp-connections-config-workflow.png)

## Recover stopped or waiting Numo work {#recover-numo-work}

Return to the existing conversation and read its last messages and cards. Distinguish a question awaiting input, an account budget limit, a routine cap and a technical failure. Closing the panel is not proof that work stopped.

When the connection to minddy drops before Numo replies, for example when the phone app goes to the background, the conversation shows a connection card. Once you're back online or return to the app, minddy checks whether your message arrived. If it did, Numo's work resumes or its answer appears. If it didn't, the message leaves the conversation and **Resend** sends it again. **Try again** checks right away.

For a live question card, answer every required question and submit the set. Past cards are records and cannot submit a new answer. Skipping does not supply missing information or authorize dependent changes.

### Budget and failures {#recovery}

An account-limit card shows the reset date when known and may offer plan or personal-key options. A routine-limit card links to routine management; inspect the per-run cap. Several conversations can run at the same time; they share the account budget. Repeating the same request does not remove the limit.

A failed turn can continue from a saved checkpoint only when that checkpoint survived. Inspect issue changes, pages and external services before retrying: a write may have succeeded even when its response was lost. State what remains and ask to continue the existing work. If no recoverable checkpoint exists, provide that verified state in a new request. Record the error and affected conversation when reporting a persistent failure; exclude credentials.

## Choose an objective for feedback {#feedback-objectives}

Feedback objectives require an explicit choice. Ask Numo to link a request to a named project objective, or to remove that link; Numo resolves the request and objective before changing it. General review or categorization does not authorize objective assignment. An integration can supply a default chosen by the owner. Promotion inherits the feedback objective and categories; it keeps the objective empty when none was chosen.
