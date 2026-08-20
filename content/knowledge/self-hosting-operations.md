---
id: self-hosting-operations
title: Operate a self-hosted minddy instance
summary: Back up, upgrade, restore, troubleshoot, and understand the lifecycle contract for self-hosted minddy.
category: deployment
audience: developer
tags: [self-hosting, self host, backup, restore, upgrade, rollback, maintenance, migration, operations]
lastReviewed: 2026-08-21
---

Use this article after installation. The detailed versioned runbook is `docs/self-hosting-operations.md`; the release's compatibility row and release assets are authoritative for exact versions, image digests, and Supabase revisions. These procedures are for an operator or an agent working with explicit operator-provided infrastructure, not for Minddy Cloud.

## Non-negotiable lifecycle rules

An upgrade is: **block writes → create and verify a complete backup → apply target migrations with target code → deploy the target application → verify → reopen writes**. Upgrade one published immutable `vMAJOR.MINOR.PATCH` release at a time. Do not skip releases, deploy a moving branch, combine a minddy upgrade with a PostgreSQL major upgrade or Supabase image upgrade, or start target application code before its migrations. Migrations are forward-only. Existing installations with pre-baseline history must follow `pnpm repair:squashed-migrations` and its backup/schema-drift warnings before bootstrapping.

Keep the current release and configuration restartable. Do not blindly copy `.env.example` during an upgrade. Preserve encryption secrets, coordinate callers before rotating webhook or cron secrets, and restart—not rebuild—after changing `MINDDY_PUBLIC_*` values.

## What a complete backup contains

A valid backup captures one write-consistent point in time and includes all of:

- PostgreSQL, including `auth`, `storage` metadata, application tables, policies, and migration history;
- raw bytes from the Supabase Storage backend, whether local volumes or an S3-compatible backend;
- minddy and Supabase configuration, secrets, and any pgsodium root key;
- the exact minddy source commit/tag, Supabase image versions, Compose files, and storage configuration.

A database dump alone is not enough: it contains Storage metadata but not file bytes. Storage bytes alone are not enough: they do not contain object metadata, policies, accounts, or migrations. For S3, take an immutable raw backend snapshot/version while Storage is stopped; do not restore database records through the `/storage/v1/s3` API. Encrypt backups, store them off-host, checksum them, and prove a test restore.

The repository provides safety-gate wrappers, but they do not infer a storage backend, outage, database, or restore target:

```bash
pnpm self-host:backup -- --backup-dir /mnt/backup/minddy/<timestamp>-<release>
pnpm self-host:update -- --from-release vX.Y.Z --to-release vX.Y.Z \
  --backup-dir /mnt/backup/minddy/<verified-backup>
pnpm self-host:restore -- --backup-dir /mnt/backup/minddy/<verified-backup> \
  --confirm-blank-target
```

## Upgrade checklist

Before the maintenance window, announce the outage, confirm a recent restore and off-host capacity, read release notes and migration/configuration diffs, verify the source tags and ancestry, prepare the target worktree, install its frozen dependencies, and build it. During the outage, stop the app, workers, and scheduler and block public Supabase API access; stopping only the web app still permits direct PostgREST or Storage writes.

After the backup, start Storage if it was stopped, run `pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local`, and run `pnpm verify:supabase` with the Supabase URL, anon key, service-role key, and database URL. Keep maintenance active while testing sign-in, project and issue create/edit, attachment upload/download, Realtime in two sessions, and one harmless scheduled job. Reopen in this order: application, Supabase public access, scheduler.

## Restore and rollback

Restore is destructive for a blank target and is not a merge. Keep the restore proxy closed until verification completes. Check `SHA256SUMS`, provision the PostgreSQL major and Supabase image versions recorded by the backup, restore configuration/secrets and the pgsodium root key before useful startup, initialize an empty stack, and verify the database URL and raw Storage target are truly empty. Restore database and Storage bytes together, reapply recorded policies/configuration, run the target bootstrap and verification, then test Auth, issues, attachments, Realtime, and scheduled work on a distinct restore origin.

There are no generated down migrations. If a migration is incompatible, roll back the application, PostgreSQL, Storage bytes, and configuration as one matching backup set; do not point old application code at a changed schema unless the release notes explicitly say it is compatible.

## Network, jobs, and diagnosis

The reverse proxy must redirect public HTTP to HTTPS and agree with `MINDDY_PUBLIC_APP_URL`, Supabase Auth URLs, OAuth callbacks, and proxy headers. Never expose PostgreSQL, Studio, Supavisor, agent-runner, or internal service ports to the Internet. Keep `CRON_SECRET`, service-role keys, encryption keys, and backup locations out of logs. Disable scheduled jobs during maintenance and restore.

Use `pnpm self-host:doctor` after installation and maintenance. It reports configuration, compatibility, container health, database/migration and Storage verification when supplied a DB URL, scheduler, agent runner, network/TLS health, and disk space without printing credentials. Common failures are missing Docker/Supabase CLI, incomplete Supabase API values, Storage API or service-role errors, an app URL mismatch, a missing compatibility entry, unhealthy Compose services, or missing scheduler/runner containers. Correct the underlying configuration and rerun the idempotent bootstrap or diagnostic; never delete a non-empty `avatars` bucket just to clear a warning.

Minddy maintainers support the latest public release and its documented previous-release path for the two compatibility-matrix topologies. They do not operate the host, provide an SLA, recover operator data, or support unpinned derivative deployments. Minddy Cloud remains a separate operated service and is never part of a self-hosted recovery path.

