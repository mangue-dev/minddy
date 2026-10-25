---
{
  "id": "workspace-encryption",
  "locale": "en",
  "title": "Workspace encryption",
  "summary": "Check encryption behavior for your release and preserve credential and workspace recovery keys.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/self-hosting.md",
      "scripts/self-hosting-encryption.mjs",
      "lib/server/encryption/data-policy.json",
      "desktop/src/local-installer.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the local paragraph now distinguishes the desktop app's built-in installer, which keeps the default, from a clone you prepare yourself; no installation run, no screenshot recaptured, existing figures carried forward unchanged)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "encryption-and-data-boundaries",
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Configure workspace encryption and preserve its keys"
  ],
  "figures": [
    {
      "id": "workspace-encryption-flow",
      "kind": "diagram",
      "src": "/documentation/en/workspace-encryption-flow.svg",
      "alt": "Diagram: Dedicated root outside PostgreSQL. Wrapped project, user and system keys. Authorized server decryption. Database + Storage + matching keys restore.",
      "caption": "Restoring encrypted content requires matching data and keys, including the root kept outside the database.",
      "revision": 8,
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
            "title": "Dedicated root outside PostgreSQL"
          },
          {
            "title": "Wrapped project, user and system keys"
          },
          {
            "title": "Authorized server decryption"
          },
          {
            "title": "Database + Storage + matching keys restore"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "workspace-encryption-flow"
  ]
}
---

## Choose the new-install setting {#workspace-encryption}

The `--encryption` installer and bootstrap options in this article ship with this release's tooling. The v0.11.0 installer and bootstrap do not accept them. Its application runtime recognizes `MINDDY_CONTENT_ENCRYPTION_ENABLED`; the reference Compose service loads the protected file through `env_file`. An explicit flag change therefore requires recreating the application service with the same environment and checking the schema and actual behavior. Do not treat a generated `MINDDY_DATA_ROOT_KEY` as proof that workspace content is encrypted. Use matching, explicitly verified tooling and configuration for the selected release before onboarding users or changing an existing instance.

New local and server installers enable workspace encryption by default and generate a dedicated `MINDDY_DATA_ROOT_KEY`. For a new server, pass `--encryption enabled` or `--encryption disabled` explicitly if needed. Both choices preserve credential encryption and generate the independent root; the opt-out concerns workspace content. The desktop app's built-in local installer keeps the default. For a clone you prepare yourself, record the selected configuration with the command below before opening the clone in the app. The root is a 32-byte random value encoded as exactly 64 hexadecimal characters, kept outside PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Diagram: Dedicated root outside PostgreSQL. Wrapped project, user and system keys. Authorized server decryption. Database + Storage + matching keys restore.](/documentation/en/workspace-encryption-flow.svg)

## Handle existing data and reruns {#existing-data}

Existing configuration without the flag stays disabled until you change it deliberately. Reruns retain the saved flag and root; a conflicting explicit installer choice fails. Never generate a replacement to repair a missing key on an enabled instance: recover the original key. Apply the required schema and verification before importing data. Bounded maintenance advances legacy conversion and rotation; setting the flag does not certify complete conversion of old content or retained copies. Turning the flag off does not decrypt protected data or authorize new plaintext writes to protected scopes.

## Keep a recoverable encryption set {#recovery}

The server decrypts content for authorized users and AI processing, so this is at-rest encryption rather than end-to-end secrecy from the application operator. Login emails and routing metadata remain readable, and external providers and exports require separate protection. Preserve current and historical root keys for retained backups. Encrypt and restrict access to a full backup containing both configuration and data. Rehearse a database-plus-Storage restore with matching keys. Changing the root needs a guarded offline rewrap while applications are stopped; a casual environment replacement makes protected content unreadable.
