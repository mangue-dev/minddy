---
{
  "id": "backups-and-restoration",
  "locale": "it",
  "title": "Backup e ripristino",
  "summary": "Conserva database, Storage, configurazione e chiavi di crittografia, scegli un metodo di backup e ripristina un insieme completo su una destinazione vuota.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H11",
    "H12",
    "H14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "update-an-instance"
  ],
  "aliases": [
    "back-up-the-reference-instance",
    "self-hosting-operations",
    "logical-and-provider-backups",
    "restore-and-roll-back"
  ],
  "tags": [
    "Eseguire un backup a freddo del profilo full su file",
    "Creare backup logici o gestiti dal provider",
    "Ripristinare un insieme completo su una destinazione vuota",
    "Ripristinare un insieme completo su destinazione vuota"
  ],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/it/restore-and-roll-back-flow.svg",
      "alt": "Schema: Backup completo esterno verificato. Destinazione vuota isolata e versioni uguali. Ripristinare database, byte e chiavi insieme. Verificare account, contenuti e file prima di aprire.",
      "caption": "Segui le fasi in questo ordine. Backup completo esterno verificato. Destinazione vuota isolata e versioni uguali. Ripristinare database, byte e chiavi insieme. Verificare account, contenuti e file prima di aprire.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Backup completo esterno verificato"
          },
          {
            "title": "Destinazione vuota isolata e versioni uguali"
          },
          {
            "title": "Ripristinare database, byte e chiavi insieme"
          },
          {
            "title": "Verificare account, contenuti e file prima di aprire"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "restore-and-roll-back-flow"
  ]
}
---

Un backup recuperabile comprende database, byte di Storage, configurazione e chiavi corrispondenti. Scegli la procedura fisica del profilo full oppure quella logica o del provider in base alla tua installazione. Il ripristino richiede una destinazione vuota e sostituisce i suoi dati; prova l’insieme completo prima di affidarti alla copia.

## Eseguire un backup a freddo del profilo full su file {#back-up-the-reference-instance}

Questa procedura Linux riguarda solo il profilo full con lo Storage filesystem della distribuzione Supabase ufficiale fissata dalla matrice. Il ripristino fisico richiede la stessa architettura e l’esatta immagine PostgreSQL. Per managed, S3 e installazioni dai sorgenti usa il percorso logico o del provider. Annuncia l’interruzione delle scritture e ferma anche i worker esterni. Scegli una destinazione cifrata, sufficientemente capiente e fuori dai dati attivi. Non eseguire mai `down --volumes` sulla fonte. La copia comprende database, Auth, metadati e byte Storage, migrazioni, policy, chiavi Vault, configurazione e identità delle versioni.

### Impostare il contesto Compose installato {#context}

Sostituisci i percorsi e la release dell’esempio con quelli dell’istanza installata. Imposta `MODE=full` e conserva l’eventuale override di ripristino in ogni comando Compose. Usare soltanto il Compose upstream omette l’overlay e l’ambiente minddy. Non eseguire il file di ambiente come codice shell e non stamparlo. La sequenza seguente ferma tutti i servizi prima di copiare i file PostgreSQL.

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

### Completare e verificare il backup {#backup}

Esegui la copia seguente mentre le scritture sono ferme. Registra codice e immagini, archivia i dati e il volume `db-config` e conserva i file di deployment e l’ambiente protetto. Se non trovi `db-config`, interrompi la procedura. Conserva gli asset verificati, i digest OCI e l’immagine database per digest. Poiché il backup comprende sia la chiave radice sia i dati cifrati, la sua riservatezza dipende dalla cifratura esterna e dai controlli di accesso.

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

### Verificare il risultato {#verify}

Copia l’insieme sigillato su un disco o host indipendente e verifica `SHA256SUMS` sulla destinazione. Una seconda copia sullo stesso host non protegge dalla perdita dell’host. Conserva separatamente i certificati TLS se la tua politica lo richiede. Se stai eseguendo solo un backup, riavvia con `compose up -d --wait` dopo la verifica. Prima di affidarti alla copia, ripristinala su una destinazione vuota e isolata, accedi con MFA e controlla ticket e allegati con gli stessi SHA-256. Conserva anche le chiavi storiche.


Se l’istanza usa la soluzione fissata per il runner, conserva `RUNNER_FIX_OVERRIDE` e `RUNNER_FIX_DIR` insieme all’eventuale override di ripristino. Questi file fanno parte dell’insieme necessario per il recupero. Ripristina i percorsi assoluti oppure adatta esplicitamente entrambi i mount alla nuova posizione prima di avviare il runner.

Il comando di backup a freddo rileva anche un volume con nome per Storage su filesystem e ne archivia i byte separatamente. Un bind mount rimane incluso in `supabase-docker.tar.gz`. Nessuno dei due casi copre un backend S3 o gestito da un fornitore.

## Creare backup logici o gestiti dal provider {#logical-and-provider-backups}

Per installazioni dai sorgenti, database gestiti e Storage personalizzato, associa comandi di database, byte e proxy alla stessa istanza. `self-host:backup`, `self-host:update` e `self-host:restore` sono controlli preliminari di sola lettura: non eseguono queste operazioni. Un backup completo conserva PostgreSQL con auth, storage e storia delle migrazioni, byte grezzi dei file, configurazione, chiavi e identità esatte di minddy e Supabase allo stesso punto, senza scritture concorrenti.

### Supabase gestito da un provider {#provider}

Per Supabase gestito registra progetto, versione database, identificatore del backup o snapshot e punto di recupero. Chiudi minddy, worker e scritture pianificate; usa poi i controlli di coerenza o manutenzione supportati dal provider per le scritture dirette di Auth, PostgREST e Storage. Se non sono disponibili, documenta il limite: fermare soltanto l’applicazione non basta. Usa gli export SQL seguenti solo se ruolo database e provider li supportano, includendo Auth, metadati Storage, storia delle migrazioni e policy gestite. Conserva separatamente i byte grezzi degli oggetti tramite export supportato o snapshot immutabile del backend. Conserva ambiente protetto e chiavi minddy, oltre alle impostazioni Auth/SMTP, URL, proxy e job sotto il tuo controllo. Ruoli di piattaforma e chiavi `pgsodium` possono appartenere al provider: non presentarli come file locali. I blocchi seguenti con `SUPABASE_COMPOSE_DIR`, `docker compose`, `supabase.env`, `pgsodium` e tar filesystem riguardano solo un backend controllato dall’operatore. Valida il ripristino completo in un progetto vuoto separato prima di affidarti alla copia. Per questa revisione non è stato eseguito alcun backup o ripristino del provider.

### Bloccare scritture ed esportare SQL {#outage}

Chiudi l’applicazione, i worker, lo scheduler e l’API pubblica. Fermare solo il server web lascia aperte le scritture di PostgREST e Storage. Imposta `SUPABASE_DB_URL` in privato e scegli una `BACKUP_DIR` nuova e cifrata. Esporta SQL con gli strumenti della versione installata. Ogni file SQL deve essere non vuoto; `data.sql` deve contenere le istruzioni `COPY` per `auth.users`, `storage.objects` e le tabelle dell’applicazione. L’export ordinario omette la storia delle migrazioni: servono i due export separati mostrati. Conserva anche le policy gestite di Storage e Realtime.

```bash
set -euo pipefail
export MINDDY_REPO=/srv/minddy/source
export MINDDY_CURRENT_DIR=/srv/minddy/current
export SUPABASE_COMPOSE_DIR=/srv/supabase/docker
export MINDDY_ENV_FILE=/etc/minddy/minddy.env
export BACKUP_ROOT=/mnt/backup/minddy
export FROM_TAG=v0.11.0
```

```bash
export BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-${FROM_TAG}"
export BACKUP_DIR="$BACKUP_ROOT/$BACKUP_ID"
test ! -e "$BACKUP_DIR"
install -d -m 0700 "$BACKUP_DIR/database" "$BACKUP_DIR/config"
git -C "$MINDDY_CURRENT_DIR" rev-parse HEAD > "$BACKUP_DIR/minddy-commit.txt"
git -C "$MINDDY_CURRENT_DIR" describe --tags --always --dirty > "$BACKUP_DIR/minddy-version.txt"
cd "$SUPABASE_COMPOSE_DIR"
docker compose images > "$BACKUP_DIR/supabase-images.txt"
docker compose ps > "$BACKUP_DIR/supabase-services.txt"
```

```bash
cd "$MINDDY_REPO"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/data.sql" --use-copy --data-only \
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_schema.sql" --schema supabase_migrations
supabase db dump --db-url "$SUPABASE_DB_URL" \
  -f "$BACKUP_DIR/database/history_data.sql" --use-copy --data-only \
  --schema supabase_migrations
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -At \
  -f scripts/export-managed-policies.sql \
  > "$BACKUP_DIR/database/managed_policies.sql"
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select jsonb_build_object(
    'auth.users', (select count(*) from auth.users),
    'public.projects', (select count(*) from public.projects),
    'public.issues', (select count(*) from public.issues),
    'public.attachments', (select count(*) from public.attachments),
    'storage.buckets', (select count(*) from storage.buckets),
    'storage.objects', (select count(*) from storage.objects)
  )::text
" > "$BACKUP_DIR/database/counts.json"
```

### Conservare byte e configurazione {#bytes}

Se gestisci uno Storage filesystem, ferma storage e `imgproxy` dopo l’export SQL e archivia la directory preservando proprietari numerici, ACL e attributi estesi. Su S3 crea uno snapshot o una versione immutabile dei byte grezzi. Non ripristinare tramite `/storage/v1/s3`, che crea metadati in conflitto con quelli ripristinati. Il provider controlla ruoli e file di piattaforma: usa la sua procedura supportata e registrane la portata. Copia in privato configurazione minddy e Supabase, proxy, job, template Auth, SMTP ed eventuale chiave radice `pgsodium`. Includi `MINDDY_DATA_ROOT_KEY` e gli altri segreti conservati. L’SQL non contiene i byte degli allegati.

```bash
install -m 0600 "$MINDDY_ENV_FILE" "$BACKUP_DIR/config/minddy.env"
install -m 0600 "$SUPABASE_COMPOSE_DIR/.env" "$BACKUP_DIR/config/supabase.env"
tar --exclude='./volumes' --exclude='./.git' \
  -C "$SUPABASE_COMPOSE_DIR" \
  -czf "$BACKUP_DIR/config/supabase-compose.tar.gz" .
cd "$SUPABASE_COMPOSE_DIR"
if docker compose exec -T db test -f /etc/postgresql-custom/pgsodium_root.key; then
  docker compose exec -T db cat /etc/postgresql-custom/pgsodium_root.key \
    > "$BACKUP_DIR/config/pgsodium_root.key"
  chmod 0600 "$BACKUP_DIR/config/pgsodium_root.key"
fi
```

```bash
cd "$SUPABASE_COMPOSE_DIR"
docker compose stop storage imgproxy
test -d "$SUPABASE_COMPOSE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$SUPABASE_COMPOSE_DIR/volumes" \
  -czf "$BACKUP_DIR/storage-files.tar.gz" storage
tar -tzf "$BACKUP_DIR/storage-files.tar.gz" > "$BACKUP_DIR/storage-files.list"
cd "$BACKUP_DIR"
find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
sha256sum --check SHA256SUMS
```

### Verificare il risultato {#logical-and-provider-backups-verify}

Genera e verifica `SHA256SUMS` sull’insieme completo, cifralo, copialo fuori dall’host e verifica di nuovo. Registra versioni, immagini, conteggi e hash dei campioni. Un export riuscito non prova il ripristino. Esegui una prova su una destinazione vuota con le versioni e la configurazione salvate prima di affidarti al backup; documenta i limiti del provider.

## Ripristinare un insieme completo su una destinazione vuota {#restore-and-roll-back}

Il ripristino sostituisce i dati della destinazione e non unisce due istanze. Recupera la copia esterna sigillata, verifica `SHA256SUMS` e lascia intatta la fonte. Ferma ingressi, scheduler e worker della destinazione. Il ripristino fisico full richiede l’architettura e l’immagine database salvate. Prepara il tag e l’upstream fissato in directory nuove, con dipendenze bloccate. Accertati che non esistano directory database, oggetti Storage o un volume `db-config` di destinazione. Non avviare il normale installer o bootstrap prima di estrarre il backup fisico.

![Schema: Backup completo esterno verificato. Destinazione vuota isolata e versioni uguali. Ripristinare database, byte e chiavi insieme. Verificare account, contenuti e file prima di aprire.](/documentation/it/restore-and-roll-back-flow.svg)

### Ripristinare i file del profilo full {#physical}

Prima della sequenza fisica, definisci il contesto Compose della fonte come nell’articolo sul backup a freddo. Usa poi percorsi e volumi di destinazione nuovi. La sequenza rimuove i container della fonte già fermi senza rimuoverne i volumi, ripristina insieme PostgreSQL a freddo e Storage, recupera `db-config` con l’immagine salvata e confronta l’immagine prima dell’avvio. Nel file protetto cambia solo percorsi, origini e redirect Auth. Conserva JWT, password, chiavi Vault e dell’applicazione e identità di release e immagine. Includi sempre `RESTORE_OVERRIDE`: ometterlo può selezionare i volumi della fonte. Ricompila la funzione offline, avvia dipendenze, applicazione e runner e verifica in manutenzione prima di aprire gli ingressi.


Prima del primo `compose down`, definisci [il contesto Compose installato dell’istanza fonte](/it/documentazione/backups-and-restoration#context), includendo l’override esistente.

Se esiste `storage-volume.tar.gz`, ripristinalo in un nuovo volume Linux con nome e collega quel volume esatto tramite l’override persistente prima di avviare Storage. Il controllo che la destinazione sia vuota si applica anche a questo volume.

```bash
compose down
export CURRENT_RELEASE_DIR=/srv/minddy/releases/saved-source
export SUPABASE_DIR=/srv/minddy/supabase-restored
export MINDDY_ENV_FILE=/etc/minddy/restored.env
export RESTORE_OVERRIDE=/etc/minddy/restore-volumes.yml
export RESTORE_DB_CONFIG=minddy-restored-db-config
(cd "$BACKUP_DIR"; sha256sum --check SHA256SUMS)
test ! -d "$SUPABASE_DIR/docker/volumes/db/data"
test -z "$(find "$SUPABASE_DIR/docker/volumes/storage" -type f -print -quit 2>/dev/null)"
if docker volume inspect "$RESTORE_DB_CONFIG" >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing restore volume." >&2
  exit 1
fi
sudo tar --numeric-owner --acls --xattrs -xzf "$BACKUP_DIR/supabase-docker.tar.gz" \
  -C "$SUPABASE_DIR"
install -m 0600 "$BACKUP_DIR/instance.env" "$MINDDY_ENV_FILE"
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  : "${RUNNER_FIX_DIR:?Set the new absolute restore runner tooling directory}"
  : "${RUNNER_FIX_OVERRIDE:?Set its new absolute restore runner override path}"
  test "$RUNNER_FIX_OVERRIDE" = "$RUNNER_FIX_DIR/compose.runner-fix.yml"
  test ! -e "$RUNNER_FIX_DIR"
  sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
  tar -xzf "$BACKUP_DIR/runner-fix-files.tar.gz" -C "$RUNNER_FIX_DIR"
  (cd "$RUNNER_FIX_DIR"; sha256sum --check SHA256SUMS)
  gzip -dc "$BACKUP_DIR/runner-sandbox-image.tar.gz" | docker image load
  export RUNNER_SANDBOX_IMAGE="$(cat "$RUNNER_FIX_DIR/sandbox-image.txt")"
  docker image inspect "$RUNNER_SANDBOX_IMAGE" >/dev/null
  install -m 0600 "$BACKUP_DIR/runner-fix-override.yml" \
    "$RUNNER_FIX_DIR/compose.runner-fix.source.yml"
  cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: $RUNNER_SANDBOX_IMAGE
    volumes:
      - $RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro
      - $RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro
EOF
  chmod 0600 "$RUNNER_FIX_OVERRIDE"
fi
cat > "$RESTORE_OVERRIDE" <<EOF
volumes:
  db-config:
    name: $RESTORE_DB_CONFIG
  deno-cache:
    name: minddy-restored-deno-cache
  caddy_data:
    name: minddy-restored-caddy-data
  caddy_config:
    name: minddy-restored-caddy-config
EOF
compose() {
  local files=(
    -f "$SUPABASE_DIR/docker/docker-compose.yml"
    -f "$CURRENT_RELEASE_DIR/deploy/self-hosted/compose.full.yml"
    -f "$RESTORE_OVERRIDE"
  )
  if [ -n "${RUNNER_FIX_OVERRIDE:-}" ]; then
    files+=(-f "$RUNNER_FIX_OVERRIDE")
  fi
  docker compose --env-file "$MINDDY_ENV_FILE" "${files[@]}" "$@"
}
BACKUP_HELPER_IMAGE="$(cat "$BACKUP_DIR/postgres-image-id.txt")"
docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null
docker volume create "$RESTORE_DB_CONFIG"
docker run --rm -i --network none --user 0:0 --entrypoint tar \
  --mount "type=volume,src=$RESTORE_DB_CONFIG,dst=/keys" \
  "$BACKUP_HELPER_IMAGE" -xzf - -C /keys < "$BACKUP_DIR/db-config.tar.gz"
if [ -f "$BACKUP_DIR/storage-volume.tar.gz" ]; then
  export RESTORE_STORAGE_VOLUME=minddy-restored-filesystem-storage
  if docker volume inspect "$RESTORE_STORAGE_VOLUME" >/dev/null 2>&1; then
    echo "Refusing to overwrite an existing Storage restore volume." >&2
    exit 1
  fi
  docker volume create "$RESTORE_STORAGE_VOLUME"
  docker run --rm -i --network none --user 0:0 --entrypoint tar \
    --mount "type=volume,src=$RESTORE_STORAGE_VOLUME,dst=/objects" \
    "$BACKUP_HELPER_IMAGE" --numeric-owner --acls --xattrs -xzf - -C /objects \
    < "$BACKUP_DIR/storage-volume.tar.gz"
  cat >> "$RESTORE_OVERRIDE" <<EOF
  $RESTORE_STORAGE_VOLUME:
    external: true
services:
  storage:
    volumes:
      - $RESTORE_STORAGE_VOLUME:/var/lib/storage
EOF
fi
compose create db
test "$(docker inspect "$(compose ps --all -q db)" --format '{{.Image}}')" = \
  "$BACKUP_HELPER_IMAGE"
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
if [ -f "$BACKUP_DIR/runner-fix-files.tar.gz" ]; then
  install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" \
    "$CURRENT_RELEASE_DIR/deploy/self-hosted/functions-bundle.json"
fi
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

### Ripristinare un insieme logico {#logical}

Per un ripristino logico, prepara uno stack vuoto con versioni, configurazioni e chiavi registrate. Prima di importare SQL, verifica l’identità del database e del backend Storage grezzo di destinazione. Ripristina ruoli, schema e dati in transazione, poi storia delle migrazioni e policy. Ferma Storage e recupera i file o lo snapshot S3 in un backend nuovo e vuoto; non caricarli tramite API. Managed richiede il processo supportato dal provider, non l’estrazione filesystem dell’esempio. Usa il commit minddy salvato e configura chiavi e origini della destinazione isolata.


I comandi seguenti per estrazione logica, `run.sh` e Storage filesystem riguardano solo un backend controllato dall’operatore. Con Supabase gestito ripristina database e byte grezzi su una destinazione vuota del provider con il suo processo supportato, poi configura e avvia minddy con [la procedura dai sorgenti](/it/documentazione/installation#source). Non eseguire Compose locale per un progetto supabase.com.

```bash
export RESTORE_DB_URL='postgresql://postgres:...@restore-db:5432/postgres'
export RESTORE_SUPABASE_URL='https://restore-supabase.example.test'
export RESTORE_APP_URL='https://restore-tickets.example.test'
export RESTORE_ANON_KEY='...'
export RESTORE_SERVICE_ROLE_KEY='...'
export RESTORE_SUPABASE_DIR=/srv/restore/supabase/docker
install -d -m 0700 "$RESTORE_SUPABASE_DIR"
tar -C "$RESTORE_SUPABASE_DIR" \
  -xzf "$BACKUP_DIR/config/supabase-compose.tar.gz"
install -m 0600 "$BACKUP_DIR/config/supabase.env" "$RESTORE_SUPABASE_DIR/.env"
cd "$RESTORE_SUPABASE_DIR"
sh run.sh start
psql "$RESTORE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc \
  'select current_database(), inet_server_addr(), version()'
```

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/roles.sql" \
  --file "$BACKUP_DIR/database/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/database/data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/history_schema.sql" \
  --file "$BACKUP_DIR/database/history_data.sql" \
  --dbname "$RESTORE_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/database/managed_policies.sql" \
  --dbname "$RESTORE_DB_URL"
```

```bash
cd "$RESTORE_SUPABASE_DIR"
docker compose stop storage imgproxy
test -d "$RESTORE_SUPABASE_DIR/volumes/storage"
tar --numeric-owner --acls --xattrs \
  -C "$RESTORE_SUPABASE_DIR/volumes" \
  -xzf "$BACKUP_DIR/storage-files.tar.gz"
docker compose up -d storage imgproxy
```

```bash
export RESTORE_RELEASE_DIR="/srv/restore/minddy/releases/$BACKUP_ID"
git -C "$MINDDY_REPO" worktree add --detach "$RESTORE_RELEASE_DIR" \
  "$(cat "$BACKUP_DIR/minddy-commit.txt")"
cd "$RESTORE_RELEASE_DIR"
install -m 0600 "$BACKUP_DIR/config/minddy.env" .env.local
export MINDDY_PUBLIC_SUPABASE_URL="$RESTORE_SUPABASE_URL"
export MINDDY_PUBLIC_SUPABASE_ANON_KEY="$RESTORE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$RESTORE_SERVICE_ROLE_KEY"
export MINDDY_PUBLIC_APP_URL="$RESTORE_APP_URL"
pnpm install --frozen-lockfile
pnpm build
pnpm verify:supabase --db-url "$RESTORE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```


Dopo il build dai sorgenti e la verifica precedente, avvia l’applicazione recuperata con `pnpm start` o con il supervisore registrato nella [procedura dai sorgenti](/it/documentazione/installation#source). Mantieni ingressi pubblici e job chiusi fino al superamento dei controlli seguenti.

### Verificare il risultato {#restore-and-roll-back-verify}

Confronta i conteggi, accedi con gli account e la MFA ripristinati, leggi progetto, ticket e pagina cifrati e scarica un campione di ogni bucket verificandone lo SHA-256. Prova integrazioni, revoche, Realtime, job, OAuth, MCP e callback. Registra percorsi, volumi, versioni, durata e finestra di perdita dei dati osservata. Dopo un errore di migrazione, usa l’insieme precedente. Le scritture successive alla copia possono andare perse durante il rollback. Non inventare SQL inverso e non considerare i container sani una prova di ripristino.
