# Public v0.10.29 → v0.10.30 lifecycle replay

Completed using only the two published annotated releases and their public operations/clean-room instructions. The application was updated to v0.10.30, verified, backed up, and the complete pre-update v0.10.29 snapshot was restored onto blank storage at a different private origin. This follows the documented saved-source rollback path. No source, compatibility row, migration, image, or runbook was patched. No production endpoint, authenticated Cloud service, external AI provider or real recipient was used.

## Public artifacts and preflight

Independent verification ran 2026-09-08T19:05:57Z–19:06:30Z. All six core release assets passed SHA256SUMS for both tags. Annotated tag objects, manifest tags and commits, container.txt identities and official GitHub release-workflow Cosign signatures matched:

| Release | Tag object | Commit | OCI index digest |
| --- | --- | --- | --- |
| v0.10.29 | a9c6968d6c7f4aec3f9c504f26eb94ec443c4623 | ec9fafd59beae57d793f611d3009810e798897cf | sha256:0c60f2cb0cf05847ac753f3a88bd101917e61b29bbcfc4767dfa86c88eb61688 |
| v0.10.30 | 5f9e352e0a5faed471a207fc395462cb2ca20791 | 9332261a186f57fc4fb2ab5406718d352aa19137 | sha256:8d720d570c95fdc1be39649aacbb302cc1717dbae22485512420ded3e4ef1ebd |

The unmodified v30 tooling reported public-pair preflight PASS at 19:07:22Z. Both compatibility rows use the same Supabase release, commit and image set; UPDATE.md and the public migration diff contain no new SQL migration. Frozen dependency installs passed in separate tagged target and restored-source checkouts. The original single-release installation preceded v30 publication under its explicit authorization; this pair preflight therefore precedes the lifecycle phase, not the earlier installation. The report does not rewrite that chronology as a pristine two-release-first installation.

## Backup, update and restore outcomes

| Checkpoint | UTC | Elapsed/meaning |
| --- | --- | --- |
| Close writes for v29 cold backup/update | 19:08:26 | Start of measured update outage |
| v29 backup sealed | 19:08:48 | 22 seconds |
| Encrypted local second copy verified | 19:09:14 | SHA256SUMS verified after decryption |
| v30 reopened and ordinary doctor passed | 19:11:01 | 155 seconds write outage, including backup and image update |
| v30 password/TOTP and data readback complete | 19:13:13 | 4m47s from outage start |
| Stop v30 for safety backup and restore rehearsal | 19:14:16 | Source subsequently preserved stopped |
| v30 backup and second copy sealed | 19:14:39 | 23 seconds |
| Blank restore target verified immediately before extraction | 19:16:25.945 | Database directory, Storage files and db-config volume absent |
| Restored v29 ordinary doctor passed | 19:17:24 | About 58 seconds from blank-target checkpoint; 188 seconds from stopping v30, including backup/preparation |
| Restored password/TOTP and data readback complete | 19:21:00 | About 4m34s from blank-target checkpoint; 6m44s from stopping v30 |

The v29 and v30 backups each include a fully stopped physical PostgreSQL/filesystem Storage snapshot, the db-config keys, protected environment, deployment files, source/upstream commit identities, PostgreSQL image ID, service/image records, source counts and identifiers, and checksums. A standard OpenSSL AES-256-CBC/PBKDF2 encrypted envelope was made with a private random passphrase file; a second local copy was compared, decrypted privately and its inner checksums verified. Protected unencrypted working backup sets and decrypted verification copies remain in the disposable VM. This demonstrates copying and verification, not independently encrypted storage or off-host disaster protection. Passphrases and all backup contents remain private.

The update changed only the four documented deployment identity fields in a protected target environment copy. Existing credentials, URLs and feature choices were retained. Bootstrap ran before the new image; the maintenance doctor passed with scheduler/Caddy stopped, and the ordinary doctor passed after reopening. The source cold backup remained unchanged.

Restore used a fresh pinned Supabase checkout and a separate saved v29 checkout. The database data directory, Storage file set and named database-key volume were proven absent before extraction. Source containers/networks were removed without deleting their data/volumes. The disposable inbox was removed as instructed to release networks; no restored email workflow was needed. The saved PostgreSQL image ID matched before the restored database started. No normal installer or bootstrap was run against the blank restore target. Both restored maintenance and ordinary doctors passed. Only documented deployment paths, origins, bind addresses and Auth redirects changed; the saved v29 release/image and secrets were retained.

## Account and data readback

Both v30 and the restored v29 accepted the existing synthetic account password and retained TOTP. The restored account remains confirmed and its verified MFA factor is recorded without secrets. Database comparisons preserve the user, project, both issues, attachment and Storage UUIDs, issue titles/status/priority/effort, migration history and revoked integration record. Counts remain auth.users=1, projects=1, issues=2, attachments=1 and storage.objects=1.

Project `c3e316db-ab5a-40ee-be09-6b562351662c`, ROOM-1 `42205f54-5572-49bf-a637-5c265aa4fc99`, ROOM-2 `6cd24e82-01e3-4edc-9ca8-e597ea9b0466`, attachment `b00ef09f-974b-423d-9141-bbba0720bb33` and revoked integration `942bb22b-94b9-4b8f-a92d-cea97d2ba37c` remain intact. Browser readback confirms ROOM-1's original title/description and ROOM-2's integration Activity. Both downloaded attachment copies are 25 bytes, equal to `clean-room-storage-marker`, SHA-256 `c314b7c37b0649174ba8834fb579baa63a60dff59cc32c82742e716c5a90564b`. Reusing the revoked key returns HTTP401 invalid_api_key after update and restore; no additional issue was created.

The restored public origin is `http://127.0.0.1`, distinct from source `http://localhost`, with Supabase at `http://127.0.0.1:8000`. OAuth discovery, protected-resource metadata and MCP server-card URLs use the restored origin; configured Auth redirects point there. Attachment links are relative and resolve on the restored origin. No new email confirmation callback was exercised after restore.

## Disabled AI and marketing scope

On restored v29, clicking Ask Numo displayed “No AI provider is configured” and “This instance does not include a minddy AI quota. Connect your own API key to use Numo.” The only configuration link is local `/settings?tab=agent`. The configuration gate prevented proceeding to an AI execution; no key or local model was added. The screenshot and snapshot preserve the visible result.

A standard Playwright context HAR, full mode with content omitted and no URL filter, covers the restored fresh password/TOTP login, data/attachment readback and AI gate. Explicit BrowserContext.close() flushed the recording. The retained evidence contains only hostname, method, response status and request timestamp: 498 requests from 19:19:26.480Z to 19:21:18.235Z, all hostname 127.0.0.1 (495 status200, 3 status101). The AI window 19:21:16Z–19:21:52Z contains one local GET200. The private HAR was deleted at 19:21:52.608844Z. This browser-context evidence does not establish server egress or Chromium/npm background behavior; the earlier sealed phase provides its separate bounded namespace captures.

The initial unauthenticated root served shared marketing copy and pricing/download links. That is a presentation finding, not evidence that Stripe billing or managed quota controls were enabled. Authenticated settings exposed no managed billing controls and doctors report managed billing/Stripe unconfigured. No checkout, billing activation, external commercial link, or real payment was exercised. The corrected integration-icon/tooltip and Activity evidence is in the separate sealed supplement; the initial early text-snapshot absence is not a confirmed UI defect.

## Preserved final state

The browser is closed. The VM remains running with restored v29 at http://127.0.0.1; no further tests are scheduled. Its Compose context is `/home/clementguerin.guest/acceptance/compose-restored-context.sh` and always includes `/home/clementguerin.guest/minddy-clean-room/restore-volumes.yml`. Database-key volume: `minddy-public-restored-db-config`; auxiliary deno/caddy volumes also use the `minddy-public-restored-` prefix. Restored data: `/home/clementguerin.guest/minddy-clean-room/supabase-restored`. Original source data remains `/home/clementguerin.guest/minddy-clean-room/supabase`; original v29 and target v30 environment/checkouts remain retained.

Private sealed backups: `/home/clementguerin.guest/minddy-clean-room/backups/20260908T190826Z-v0.10.29` and `/home/clementguerin.guest/minddy-clean-room/backups/20260908T191415Z-v0.10.30`. Encrypted envelopes remain in `backup-envelopes`, local second copies and private verified sets in `backup-second-copy`, all under the same clean-room directory. Public release assets and verification records are retained. Host disk was monitored throughout; last observed 12 GiB free (parent subsequently reported 13 GiB), above the 5 GiB stop threshold.

No lifecycle command required a product workaround. Earlier registry retries and the corrected restrictive-umask harness incident remain explicitly qualified in the original sealed installation report. The primary phase, attribution/HAR supplement and recovery report remain sealed separately. This is an explicitly requested AI replay, not a human novice replay or a security pentest.

References: https://github.com/mangue-dev/minddy/releases/tag/v0.10.29 ; https://github.com/mangue-dev/minddy/releases/tag/v0.10.30 ; https://github.com/mangue-dev/minddy/blob/v0.10.29/docs/self-hosting-clean-room.md ; https://github.com/mangue-dev/minddy/blob/v0.10.29/docs/self-hosting-operations.md ; https://github.com/microsoft/playwright-cli ; https://github.com/microsoft/playwright/blob/main/docs/src/api/params.md ; https://docs.openssl.org/master/man1/openssl-enc/ .
