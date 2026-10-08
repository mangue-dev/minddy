# MIN-664 operator recovery execution evidence

Executed by `agent:/root/operator_documentation` on 2026-10-08. This record
contains no deployment environment, password, session, TOTP secret, or backup
archive. It records an engineering rehearsal, not approval of an unchanged
published distribution or a human operator acceptance test.

## Identity and isolation

The immutable application identity was v0.11.0 at
`62c02313363be7c09116c592d70019c51420d70a`, with OCI digest
`sha256:07325c9894ae1d0cb587d870b65abccaf7b9a73f93dba585d8dae6487744615d`.
Published asset checksums and the official Sigstore certificate identity were
verified. Supabase was fetched at
`549db119c44c25167461812041ba198bde2b31a4`. The host was macOS with the
Linux aarch64 Docker Desktop daemon 28.4.0 and Compose 2.39.2-desktop.1.
Docker had no running containers before this rehearsal. All services and data
belonged to the disposable profile; no production deployment took place.

## Installation adaptations actually required

The tagged environment template said `MINDDY_RELEASE=0.10.30`. The installer
has no `--release` option. The protected environment was generated with
`--skip-start`, then its release was corrected to `0.11.0` before validation
and startup. The initial verbose image pull exceeded the installer's 1 MiB
subprocess output buffer. The same Compose context completed `pull --quiet`,
then the installer resumed with its actual `--skip-pull` flag.

The frozen dependency install selected jose 6.2.12 while the tagged offline
bundle required 6.2.3. Compilation used the already locked 6.2.3 package in the
scratch dependency tree. The signed OCI runner also lacked its imported
`agent-runner-storage.mjs`; a persistent Compose override mounted the matching
tagged source file read-only. Neither adaptation changes the immutable tag or
published image. The current candidate fixes are separately tested in source.

## Cold backup

After 227 migrations and bootstrap verification, programmatic password login,
a real TOTP enrollment/challenge, a SQL recovery marker, and a private Storage
upload/download succeeded. This did not establish SMTP delivery or an
application UI journey.

All 16 services were stopped before the backup. The actual database and Storage
mount sources were obtained with `docker inspect`. Docker Desktop had created
new `/var` bind directories inside its Linux VM, so copying the corresponding
macOS path would have captured an empty directory. A Linux GNU helper instead
mounted the inspected data bindings read-only, staged the pinned upstream
`docker` directory with `cp -a`, and archived the staged coherent filesystem
with `tar --numeric-owner --acls --xattrs -czf`. The database image archived
its `db-config` volume separately. The immutable database image ID was
`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`.

The sealed set contained ten checksummed files, including database and raw
Storage data, the Vault/pgsodium key volume, protected application environment,
Compose deployment and the persistent runner override. Archive size was
17,150,433 bytes. The private backup directory had mode 0700 and the copied
environment mode 0600. GnuPG AES256 outer encryption and decryption preserved
the exact archive checksum. A short private GnuPG home was necessary because
the first deep temporary path exceeded Unix socket length. No off-host recovery
was tested.

## Blank-target restoration

Checksums were verified before extraction. The new target had no database
directory, Storage objects or existing key volume. Source containers were
removed without deleting source volumes or bind data. GNU tar extracted cold
PostgreSQL and raw Storage with numeric ownership, ACLs and extended attributes;
`db-config` was restored to a verified-new volume. The restored environment
retained its original secrets and changed only deployment paths. The target
PostgreSQL image was compared with the saved image ID before startup.

The first extraction attempt omitted Docker's `-i` while feeding archive bytes
to standard input and failed. It was not accepted. A second fresh target used
`docker run --rm -i --network none` and successfully extracted the same sealed
set. The offline functions bundle was recompiled before startup. Backend and
application health checks ran with public ingress and jobs stopped, followed
by maintenance and ordinary doctor checks.

A macOS file-sharing Storage target then returned HTTP 500 with `ENOTSUP`
for extended attributes. The same archive's `docker/volumes/storage` branch
was extracted with GNU tar into the verified-new Linux volume
`min664-restored-storage-linux`. A persistent target Compose override mounted
that volume at `/var/lib/storage`; only Storage and imgproxy restarted for this
adaptation. The same user identity, password, restored TOTP factor, SQL marker
and Storage bytes were then verified. The restored object SHA256 was
`d832d41b374a941b12ab10d6e594fea6d43bf7726d0ff63105517c058e94d745`.
The application health endpoint returned HTTP 200.

## Later candidate UI alignment

The previous recovery assertions belong to the restored v0.11.0 engineering
profile. For separate current-source UI checks, the owner authorized the
additional candidate migrations against this disposable backend. Official
bootstrap with `--existing-env` applied 15 migrations without a reset or
service stop, advancing the ledger from 227 to 242. Exact current source
identity and SQL hashes are in `operator-candidate-schema-alignment.json`.
This later change is not a published v0.11.1 compatibility claim and does not
rewrite the earlier immutable recovery evidence.

## Evidence and remaining acceptance

`operator-operational-validation.json` and `operator-evidence/` retain the
sanitized actual outcomes and failed checks. The unchanged tagged install,
native Linux server lifecycle, adjacent-release application upgrade,
provider-managed backup/restore, public DNS/TLS, SMTP confirmation/recovery,
and independent off-host recovery have not been accepted. Reader UI checks
performed by other agents have their own records. Agent language review is
explicitly recorded separately from human reader review.

## Subsequent verified rehearsals

The preceding remaining-acceptance list records the first recovery phase. Later
controlled evidence is separate: `operator-upgrade-execution.json` verifies the
actual v0.10.30 to explicitly adapted v0.11.0 update, preservation of Auth/MFA,
project/issue data and Storage bytes, and a physical rollback into a blank source
release target. It retains the original failures and excludes a PostgreSQL major
or Supabase image change. `operator-adapted-clean-install.json` records a distinct
fresh adapted v0.11.0 full installation, all 16 services, 227 migrations, ordinary and
correctly scoped maintenance doctor, and actual Auth/TOTP/issue/Storage checks.
`operator-adapted-tooling-restoration.json` separately exercises relocation of the
sealed 89ab helper/compiler set into a new directory and fresh tagged checkout,
saved worker-image loading, compilation 6.2.12, actual readonly runner mount
identities, health and ordinary doctor. The v0.10.30 physical rollback alone does
not validate that later helper branch.

The unchanged-release clean-room preflight remains blocked because its historical
contract is absent; it is not an installer failure and does not invalidate these
explicitly adapted rehearsals. No unchanged-tag installation, native-host
lifecycle, provider-managed restore, public TLS or independent off-host recovery
is inferred. Root's local Mailpit signup/recovery and product-reader checks have
separate evidence; this operator lot does not claim external email delivery or
human review. The original QA backend was reopened with 242 migrations and its
original Auth/TOTP, Storage checksum and HTTP200 verified.
