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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
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
      "scripts/self-hosting-doctor.mjs",
      "docs/self-hosting.md",
      "docs/self-hosting-clean-room.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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

Run the read-only doctor from the exact release checkout and installed environment. Use `--mode full` with the upstream Compose path or managed with the provider database connection. It checks compatibility, configuration, container state, DNS/TLS, app health, disk space and scheduler; database/migration and Storage verification require the appropriate connection. Its redaction is useful, but inspect a report before sharing it. A passing liveness check does not prove account email, readable encrypted content or restored files.

```bash
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

## Map the symptom to a safe check {#symptoms}

| Symptom | Check |
| --- | --- |
| Broad 401 responses after restoration | Verify that JWT, anon and service-role keys belong to the same stack. |
| Failed uploads or 404 files | Compare Storage policies, object records, raw bytes and keys. |
| Missing database relations | Preserve the first migration error and check disk, locks and the target URL. Rerun release bootstrap only after resolving the cause; never mark failed migrations applied by hand. |
| Realtime failures | Check publication, JWT, the WebSocket proxy and service logs. |
| Idle cron or 401 jobs | Verify scheduler state, canonical origin and `CRON_SECRET` privately. |
| Version compatibility fails | Compare `MINDDY_RELEASE` with a row of `deploy/self-hosted/compatibility.json` and `MINDDY_IMAGE` with that row or the verified immutable digest. The installer copies `MINDDY_RELEASE` from the deployment template. |

## Retain evidence and retry deliberately {#recovery}

Fix missing Docker/CLI prerequisites or incomplete API values and repeat the idempotent installer using the preserved environment. Correct runtime public URLs and recreate the application; rebuilding the OCI image is unnecessary. Do not delete non-empty buckets, reset database data or rotate roots to clear warnings. Optional-disabled capability reports can be expected when those providers are intentionally absent. Share release, profile, timestamps, controlled error codes and redacted diagnostics for support. Remove passwords, tokens, `Authorization` headers, cookies, private object URLs and user content.


If a fresh image download stops with a long progress log and no registry error, the v0.11.0 installer can exceed its subprocess output buffer. Later installers pull quietly with a larger buffer and, if the output still exceeds it, stop with an explicit instruction. In either case, run `compose pull --quiet` in the exact installed Compose context, then rerun the same installer with `--skip-pull` to use those loaded images, preserving the environment. This workaround does not repair a registry or signature failure. If offline function compilation reports a `jose` version mismatch, stop. The v0.11.0 tooling requests 6.2.3 while its direct frozen dependency resolves to 6.2.12; obtain a corrected release/tooling combination before treating that installation as accepted. In later releases, the pin matches the frozen dependency, so a mismatch means `pnpm install --frozen-lockfile` did not complete in that checkout. Do not silently relax the dependency identity check.


The v0.11.0 OCI runner also fails to start because `agent-runner-storage.mjs` is missing from its runtime image, so the application never becomes healthy. Later releases remove the runner and its code sandboxes. Upgrade to such a release instead of mounting runner files or weakening container isolation.
