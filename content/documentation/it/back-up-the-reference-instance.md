---
{
  "id": "back-up-the-reference-instance",
  "locale": "it",
  "title": "Eseguire un backup a freddo del profilo full su file",
  "summary": "Questa procedura Linux riguarda solo il profilo full con lo Storage filesystem della distribuzione Supabase ufficiale fissata dalla matrice.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11"
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
      "docs/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "logical-and-provider-backups",
    "restore-and-roll-back",
    "update-an-instance"
  ],
  "aliases": [
    "self-hosting-operations"
  ],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Eseguire un backup a freddo del profilo full su file {#back-up-the-reference-instance}

Questa procedura Linux riguarda solo il profilo full con lo Storage filesystem della distribuzione Supabase ufficiale fissata dalla matrice. Il ripristino fisico richiede la stessa architettura e l’esatta immagine PostgreSQL. Per managed, S3 e installazioni dai sorgenti usa il percorso logico o del provider. Annuncia l’interruzione delle scritture e ferma anche i worker esterni. Scegli una destinazione cifrata, sufficientemente capiente e fuori dai dati attivi. Non eseguire mai down --volumes sulla fonte. La copia comprende database, Auth, metadati e byte Storage, migrazioni, policy, chiavi Vault, configurazione e identità delle versioni.

## Impostare il contesto Compose installato {#context}

Sostituisci i percorsi e la release dell’esempio con quelli dell’istanza installata. Imposta MODE=full e conserva l’eventuale override di ripristino in ogni comando Compose. Usare soltanto il Compose upstream omette l’overlay e l’ambiente Minddy. Non eseguire il file di ambiente come codice shell e non stamparlo. La sequenza seguente ferma tutti i servizi prima di copiare i file PostgreSQL.

```bash
set -euo pipefail
export MODE=full
export CURRENT_RELEASE_DIR=/srv/minddy/releases/vX.Y.Z
export SUPABASE_DIR=/srv/minddy/supabase
export MINDDY_ENV_FILE=/etc/minddy/instance.env
export BACKUP_ROOT=/mnt/backup/minddy
compose() {
  local files=()
  if [ "$MODE" = full ]; then
    files+=(-f "$SUPABASE_DIR/docker/docker-compose.yml")
  fi
  files+=(-f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.$MODE.yml")
  if [ -n "${RESTORE_OVERRIDE:-}" ]; then
    files+=(-f "$RESTORE_OVERRIDE")
  fi
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
compose ps
```

## Sigillare l’insieme corrispondente {#backup}

Esegui la copia seguente mentre le scritture sono ferme. Registra codice e immagini, archivia i dati e il volume db-config e conserva i file di deployment e l’ambiente protetto. Se non trovi db-config, interrompi la procedura. Conserva gli asset verificati, i digest OCI e l’immagine database per digest. Poiché il backup comprende sia la chiave radice sia i dati cifrati, la sua riservatezza dipende dalla cifratura esterna e dai controlli di accesso.

```bash
export BACKUP_DIR="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR"
compose ps --format json > "$BACKUP_DIR/services.json"
compose images --format json > "$BACKUP_DIR/images.json"
git -C "$CURRENT_RELEASE_DIR" rev-parse HEAD > "$BACKUP_DIR/source-commit.txt"
git -C "$SUPABASE_DIR" rev-parse HEAD > "$BACKUP_DIR/supabase-commit.txt"
DB_CONTAINER="$(compose ps -q db)"
test -n "$DB_CONTAINER"
DB_CONFIG_VOLUME="$(docker inspect "$DB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/etc/postgresql-custom"}}{{.Name}}{{end}}{{end}}')"
test -n "$DB_CONFIG_VOLUME"
BACKUP_HELPER_IMAGE="$(docker inspect "$DB_CONTAINER" --format '{{.Image}}')"
printf '%s\n' "$BACKUP_HELPER_IMAGE" > "$BACKUP_DIR/postgres-image-id.txt"
STORAGE_CONTAINER="$(compose ps -q storage)"
test -n "$STORAGE_CONTAINER"
STORAGE_VOLUME="$(docker inspect "$STORAGE_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}')"
compose stop
sudo tar --numeric-owner --acls --xattrs -C "$SUPABASE_DIR" \
  -czf "$BACKUP_DIR/supabase-docker.tar.gz" docker
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/instance.env"
docker run --rm --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$DB_CONFIG_VOLUME,dst=/keys,readonly" \
  "$BACKUP_HELPER_IMAGE" -czf - -C /keys . > "$BACKUP_DIR/db-config.tar.gz"
if [ -n "$STORAGE_VOLUME" ]; then
  docker run --rm --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$STORAGE_VOLUME,dst=/objects,readonly" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -czf - -C /objects . \
    > "$BACKUP_DIR/storage-volume.tar.gz"
fi
tar -C "$CURRENT_RELEASE_DIR" -czf "$BACKUP_DIR/deployment.tar.gz" deploy/self-hosted
if [ -n "${RESTORE_OVERRIDE:-}" ]; then
  install -m 0600 "$RESTORE_OVERRIDE" "$BACKUP_DIR/source-volume-override.yml"
fi
if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
  test -n "${RUNNER_FIX_DIR:-}"
  install -m 0600 "$RUNNER_FIX_OVERRIDE" "$BACKUP_DIR/runner-fix-override.yml"
  tar -C "$RUNNER_FIX_DIR" -czf "$BACKUP_DIR/runner-fix-files.tar.gz" \
    agent-runner.mjs agent-runner-storage.mjs SHA256SUMS Dockerfile.agent-sandbox sandbox-image.txt functions-bundle.json functions-bundle.tagged.json
  docker image save "$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")" | gzip > "$BACKUP_DIR/runner-sandbox-image.tar.gz"
fi
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR/supabase-docker.tar.gz"
(
  cd "$BACKUP_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum --check SHA256SUMS
)
```

## Verificare il risultato {#verify}

Copia l’insieme sigillato su un disco o host indipendente e verifica SHA256SUMS sulla destinazione. Una seconda copia sullo stesso host non protegge dalla perdita dell’host. Conserva separatamente i certificati TLS se la tua politica lo richiede. Se stai eseguendo solo un backup, riavvia con compose up -d --wait dopo la verifica. Prima di affidarti alla copia, ripristinala su una destinazione vuota e isolata, accedi con MFA e controlla ticket e allegati con gli stessi SHA-256. Conserva anche le chiavi storiche.


Se l’istanza usa la soluzione fissata per il runner, conserva RUNNER_FIX_OVERRIDE e RUNNER_FIX_DIR insieme all’eventuale override di ripristino. Questi file fanno parte dell’insieme necessario per il recupero. Ripristina i percorsi assoluti oppure adatta esplicitamente entrambi i mount alla nuova posizione prima di avviare il runner.

Il comando di backup a freddo rileva anche un volume con nome per Storage su filesystem e ne archivia i byte separatamente. Un bind mount rimane incluso in supabase-docker.tar.gz. Nessuno dei due casi copre un backend S3 o gestito da un fornitore.
