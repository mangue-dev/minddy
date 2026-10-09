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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "lib/server/encryption/data-policy.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "caption": "These components have distinct responsibilities. Dedicated root outside PostgreSQL. Wrapped project, user and system keys. Authorized server decryption. Database + Storage + matching keys restore.",
      "revision": 3,
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

The --encryption installer and bootstrap options in this article belong to the identified 0.11.1 candidate tooling. The published v0.11.0 installer and bootstrap do not accept them. Its application runtime recognizes MINDDY_CONTENT_ENCRYPTION_ENABLED; the reference Compose service loads the protected file through env_file. An explicit flag change therefore requires recreating the application service with the same environment and checking the schema and actual behavior. Do not treat a generated MINDDY_DATA_ROOT_KEY as proof that workspace content is encrypted. Use matching, explicitly verified tooling and configuration for the selected release before onboarding users or changing an existing instance.

New local and server installers enable workspace encryption by default and generate a dedicated MINDDY_DATA_ROOT_KEY. For a new server, pass --encryption enabled or --encryption disabled explicitly if needed. Both choices preserve credential encryption and generate the independent root; the opt-out concerns workspace content. For the local desktop path, prepare the selected configuration before opening the clone with the command below. The root is a 32-byte random value encoded as exactly 64 hexadecimal characters, kept outside PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Diagram: Dedicated root outside PostgreSQL. Wrapped project, user and system keys. Authorized server decryption. Database + Storage + matching keys restore.](/documentation/en/workspace-encryption-flow.svg)

## Handle existing data and reruns {#existing-data}

Existing configuration without the flag stays disabled until you change it deliberately. Reruns retain the saved flag and root; a conflicting explicit installer choice fails. Never generate a replacement to repair a missing key on an enabled instance: recover the original key. Apply the required schema and verification before importing data. Bounded maintenance advances legacy conversion and rotation; setting the flag does not certify complete conversion of old content or retained copies. Turning the flag off does not decrypt protected data or authorize new plaintext writes to protected scopes.

## Keep a recoverable encryption set {#recovery}

The server decrypts content for authorized users and AI processing, so this is at-rest encryption rather than end-to-end secrecy from the application operator. Login emails and routing metadata remain readable, and external providers and exports require separate protection. Preserve current and historical root keys for retained backups. Encrypt and restrict access to a full backup containing both configuration and data. Rehearse a database-plus-Storage restore with matching keys. Changing the root needs a guarded offline rewrap while applications are stopped; a casual environment replacement makes protected content unreadable.
