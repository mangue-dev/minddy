---
{
  "id": "storage-and-attachments",
  "locale": "en",
  "title": "Keep Storage durable and diagnose attachments",
  "summary": "PostgreSQL stores Storage object metadata and application file references.",
  "topic": "Operate an instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H07"
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "logical-and-provider-backups",
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "storage-and-attachments-flow",
      "kind": "diagram",
      "src": "/documentation/en/storage-and-attachments-flow.svg",
      "alt": "Diagram: Authorized application file access. PostgreSQL object metadata. Raw filesystem or S3 backend bytes. Matching configuration and recovery keys.",
      "caption": "These components have distinct responsibilities. Authorized application file access. PostgreSQL object metadata. Raw filesystem or S3 backend bytes. Matching configuration and recovery keys.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "storage-and-attachments-flow"
  ]
}
---

## Separate object records from file bytes {#storage-and-attachments}

PostgreSQL stores Storage object metadata and application file references. The Storage backend holds the actual bytes. Both belong to the same instance and backup point. The full filesystem profile persists bytes in the pinned upstream docker/volumes/storage directory; a configured S3-compatible backend needs a separate raw backend snapshot. Ephemeral container files are not durable Storage. Watch capacity for database, attachments and backup copies and keep backups off the active Storage disk.


![Diagram: Authorized application file access. PostgreSQL object metadata. Raw filesystem or S3 backend bytes. Matching configuration and recovery keys.](/documentation/en/storage-and-attachments-flow.svg)

## Verify authorized access {#access}

Private page and issue files pass application authorization before the service generates an allowed download. Publishing a page exposes files only within its published set through signed URLs; it does not make the bucket public or open the private application route. A stored object existing on disk does not prove its metadata, policies, encryption key or application permissions are correct. With a demo account, upload and download a file and compare its SHA-256. Repeat after restoration for each bucket used by the instance.

## Recover a missing or inaccessible file {#recover}

Run the Supabase verifier, check the correct stack and service-role configuration, then compare object records with the raw backend bytes and preserved keys. Correct the Storage service, policy or configuration failure before retrying. Never delete a non-empty avatars bucket to clear a readiness warning. Restoring database records alone cannot restore bytes. For S3 restoration, restore the raw backend snapshot rather than reimporting through /storage/v1/s3, which can create conflicting metadata.

```bash
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

## Docker Desktop filesystem Storage {#docker-desktop}

On the tested macOS Docker Desktop profile, a host bind mount returned ENOTSUP when Storage wrote extended attributes. A new Linux named volume avoided that failure. For a new installation with no object bytes, the following persistent override replaces only the Storage mount. Keep RESTORE_OVERRIDE in the installed Compose context. Do not switch an existing populated mount to an empty volume or overwrite an existing restore override: stop writes and preserve its bytes using the backup and restoration procedures first.

```bash
: "${RESTORE_OVERRIDE:=/etc/minddy/storage-volume.yml}"
export RESTORE_OVERRIDE
test ! -e "$RESTORE_OVERRIDE"
export STORAGE_VOLUME=minddy-filesystem-storage
if docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1; then
  echo "Refusing to replace an existing Storage volume." >&2
  exit 1
fi
cat > "$RESTORE_OVERRIDE" <<EOF
services:
  storage:
    volumes:
      - $STORAGE_VOLUME:/var/lib/storage
volumes:
  $STORAGE_VOLUME:
EOF
# Apply this overlay with the installed Compose context before the first start.
```
