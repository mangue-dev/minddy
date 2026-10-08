---
{
  "id": "self-hosted-diagnostics",
  "locale": "en",
  "title": "Instance diagnostics",
  "summary": "Run the read-only doctor from the exact release checkout and installed environment.",
  "topic": "Operate an instance",
  "type": "troubleshooting",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-configuration",
    "authentication-and-email",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [
    "Diagnose a self-hosted installation"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Start with the installed profile {#self-hosted-diagnostics}

Run the read-only doctor from the exact release checkout and installed environment. Use --mode full with the upstream Compose path or managed with the provider database connection. It checks compatibility, configuration, container state, DNS/TLS, app health, disk space, scheduler and runner; database/migration and Storage verification require the appropriate connection. Its redaction is useful, but inspect a report before sharing it. A passing liveness check does not prove account email, readable encrypted content or restored files.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Map the symptom to a safe check {#symptoms}

For broad 401 responses after restoration, verify JWT, anon and service-role keys belong to the same stack. For failed uploads or 404 files, compare Storage policies, object records, raw bytes and keys. For missing relations, preserve the first migration error, check disk, locks and the target URL and rerun release bootstrap only after resolving the cause. Never mark failed migrations applied by hand. For Realtime, check publication, JWT, WebSocket proxy and service logs. For idle cron or 401 jobs, verify scheduler state, canonical origin and CRON_SECRET privately.

## Retain evidence and retry deliberately {#recovery}

Fix missing Docker/CLI prerequisites or incomplete API values and repeat the idempotent installer using the preserved environment. Correct runtime public URLs and recreate the application; rebuilding the OCI image is unnecessary. Do not delete non-empty buckets, reset database data or rotate roots to clear warnings. Optional-disabled capability reports can be expected when those providers are intentionally absent. Share release, profile, timestamps, controlled error codes and redacted diagnostics for support. Remove passwords, tokens, Authorization headers, cookies, private object URLs and user content.


If a fresh image download stops with a long progress log and no registry error, the v0.11.0 installer can exceed its subprocess output buffer. In the exact installed Compose context, compose pull --quiet completed in the disposable test. Then rerun the same installer with --skip-pull to use those loaded images, preserving the environment. This workaround does not repair a registry or signature failure. If offline function compilation reports a jose version mismatch after a frozen install, stop: this release requests 6.2.3 while its direct frozen dependency resolves to 6.2.12. Obtain a corrected release/tooling combination before treating the standard installation as accepted; do not silently relax the dependency identity check.


The v0.11.0 OCI runner also fails to start because agent-runner-storage.mjs is missing from its runtime image. The current source Dockerfile now includes that dependency. A disposable engineering rehearsal supplied the matching tagged file as a read-only mount; that is an explicitly modified profile, not acceptance of the unchanged signed image. Do not publish the runner port or remove its isolation to bypass startup failures.
