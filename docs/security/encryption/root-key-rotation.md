# Offline data root-key rotation

This procedure changes the root that wraps Minddy's project, user and system
data keys. It does not change the data keys or rewrite application ciphertext.
It requires a complete write outage and an administrative PostgreSQL connection.
No production rotation has been performed as part of MIN-591.

## Preparation

1. Verify a restorable backup of PostgreSQL, Storage and the current protected
   environment. Retain the old root with backups made before rotation.
2. Stop every Minddy web instance, scheduler, agent worker and preview deployment
   connected to this database. Keep PostgreSQL running. A read served from an old
   server after the swap will fail, even if no writes occur.
3. Prepare a new independent root using `openssl rand -hex 32`. Provide the
   current root as `MINDDY_DATA_ROOT_KEY` and the new root as
   `MINDDY_DATA_NEXT_ROOT_KEY` through protected process configuration. Do not
   place either value in command arguments, SQL, logs or Git.
4. Configure `PGHOST`, `PGUSER`, `PGDATABASE` and any required `PGPORT`,
   `PGPASSWORD`, `PGPASSFILE` and `PGSSLMODE` for the database administrator.
   The command requires `psql` on the host and strips both root values from the
   `psql` child process environment. Use the same database selected for the
   backup; never point this command at a different environment.

## Rewrap

Run the read-only checks first:

```sh
npm run encryption:rewrap-root -- --verify-root
npm run encryption:rewrap-root
```

The first command authenticates every stored wrapped key with the current
root. The second authenticates and locally rewraps every key with the candidate
root, without changing PostgreSQL. Both print counts only. If either fails,
leave the current deployment configuration unchanged and investigate.

With all application instances stopped and the backup verified, run:

```sh
npm run encryption:rewrap-root -- --apply --confirm-writes-stopped
```

The command reads all key versions and both purposes. One PostgreSQL transaction
locks the registry, checks that every recorded key and wrapped value still
matches the preflight, then replaces the wrapped values. Any mismatch rolls
back the entire transaction. It verifies the committed registry with the new
root before reporting success. The root values themselves never enter SQL.
The lock blocks registry readers while the transaction runs.

After success, replace `MINDDY_DATA_ROOT_KEY` with the new value in **every**
Minddy runtime, remove `MINDDY_DATA_NEXT_ROOT_KEY`, and run
`npm run encryption:rewrap-root -- --verify-root` with the new root before
restarting. Restore web, scheduler and worker processes only after this check.
Keep the old root with older backups for their retention period. New backups
must include the new root in their protected environment snapshot.

## Interrupted or failed command

Keep Minddy stopped. If the command failed before commit, the old root still
authenticates all keys. A connection failure during commit may leave the result
unknown. Run `--verify-root` first with the old root, then with the new root,
without printing either value. Exactly one should authenticate a nonempty
registry. If the old root works, repeat the dry run and apply after correcting
the cause. If the new root works, update every runtime to the new root. If
neither works, restore the verified backup and its matching old root before
reopening traffic. An empty registry has no wrapped keys to convert, so verify
the selected database and backup identity before switching roots.

This operation must not be run against legacy AWS KMS wrapped keys. The old
root preflight rejects them before any database write.
