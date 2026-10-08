---
{
  "id": "project-settings",
  "locale": "en",
  "title": "Configure a project",
  "summary": "Change its name, key and appearance as its owner, and understand member access.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "S05"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "recurring-issues",
    "git-accounts-and-repositories",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/en/project-general.png",
      "alt": "General project settings with name, key, icon and a separate trash action.",
      "caption": "Check the project name and key before saving. Moving the project to trash is a separate action.",
      "revision": 1,
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
    "project-settings-steps"
  ]
}
---

## Open the project settings {#project-settings}

Open the project, then its settings. Project ownership controls administrative settings. Members can inspect the general section and leave the project but do not gain the owner's editing controls.

As owner, enter a nonempty name and a valid project key, then save. The key is normalized to uppercase and uses 2 to 5 ASCII letters. Review the resulting identifiers after changing it. Use the icon and appearance controls to distinguish the project in navigation; these visual choices do not change membership.

Other sections manage collaborators, recurring issues, Git, import, integrations, automation and feedback. Follow the corresponding task guide before enabling a provider or automatic work. Account preferences such as your interface language are separate from project configuration.


![General project settings with name, key, icon and a separate trash action.](/documentation/en/project-general.png)

## Leaving and deleting {#project-removal}

A member can use the leave action to remove their own access. Ask the owner to invite you again if you later need the project. Leaving is not deleting the project for everyone.

Project deletion is an owner action in the danger zone. Read the consequences and confirmation before using it, especially when the project contains issues, pages, files or integrations. If a normal save fails, keep your intended values, read the error and refresh the project before retrying; avoid repeatedly submitting a destructive action because its first result is uncertain.
