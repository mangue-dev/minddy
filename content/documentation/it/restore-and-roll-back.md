---
{
  "id": "restore-and-roll-back",
  "locale": "it",
  "title": "Ripristinare un insieme completo su destinazione vuota",
  "summary": "Il ripristino sostituisce i dati della destinazione e non unisce due istanze.",
  "topic": "Gestire un’istanza",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H14"
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
      "docs/self-hosting-operations.md",
      "docs/self-hosting-logical-operations.md"
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
    "update-an-instance"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/it/restore-and-roll-back-flow.svg",
      "alt": "Schema: Backup completo esterno verificato. Destinazione vuota isolata e versioni uguali. Ripristinare database, byte e chiavi insieme. Verificare account, contenuti e file prima di aprire.",
      "caption": "Segui le fasi in questo ordine. Backup completo esterno verificato. Destinazione vuota isolata e versioni uguali. Ripristinare database, byte e chiavi insieme. Verificare account, contenuti e file prima di aprire.",
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
    "restore-and-roll-back-flow"
  ]
}
---

## Ripristinare un insieme completo su destinazione vuota {#restore-and-roll-back}

Il ripristino sostituisce i dati della destinazione e non unisce due istanze. Recupera la copia esterna sigillata, verifica SHA256SUMS e lascia intatta la fonte. Ferma ingressi, scheduler e worker della destinazione. Il ripristino fisico full richiede l’architettura e l’immagine database salvate. Prepara il tag e l’upstream fissato in directory nuove, con dipendenze bloccate. Accertati che non esistano directory database, oggetti Storage o un volume db-config di destinazione. Non avviare il normale installer o bootstrap prima di estrarre il backup fisico.

![Schema: Backup completo esterno verificato. Destinazione vuota isolata e versioni uguali. Ripristinare database, byte e chiavi insieme. Verificare account, contenuti e file prima di aprire.](/documentation/it/restore-and-roll-back-flow.svg)

## Ripristinare i file del profilo full {#physical}

Prima della sequenza fisica, definisci il contesto Compose della fonte come nell’articolo sul backup a freddo. Usa poi percorsi e volumi di destinazione nuovi. La sequenza rimuove i container della fonte già fermi senza rimuoverne i volumi, ripristina insieme PostgreSQL a freddo e Storage, recupera db-config con l’immagine salvata e confronta l’immagine prima dell’avvio. Nel file protetto cambia solo percorsi, origini e redirect Auth. Conserva JWT, password, chiavi Vault e dell’applicazione e identità di release e immagine. Includi sempre RESTORE_OVERRIDE: ometterlo può selezionare i volumi della fonte. Ricompila la funzione offline, avvia dipendenze, applicazione e runner e verifica in manutenzione prima di aprire gli ingressi.


Prima del primo compose down, definisci [il contesto Compose installato dell’istanza fonte](/it/documentazione/back-up-the-reference-instance#context), includendo l’override esistente.

Se esiste storage-volume.tar.gz, ripristinalo in un nuovo volume Linux con nome e collega quel volume esatto tramite l’override persistente prima di avviare Storage. Il controllo che la destinazione sia vuota si applica anche a questo volume.

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

## Ripristinare un insieme logico {#logical}

Per un ripristino logico, prepara uno stack vuoto con versioni, configurazioni e chiavi registrate. Prima di importare SQL, verifica l’identità del database e del backend Storage grezzo di destinazione. Ripristina ruoli, schema e dati in transazione, poi storia delle migrazioni e policy. Ferma Storage e recupera i file o lo snapshot S3 in un backend nuovo e vuoto; non caricarli tramite API. Managed richiede il processo supportato dal provider, non l’estrazione filesystem dell’esempio. Usa il commit Minddy salvato e configura chiavi e origini della destinazione isolata.


I comandi seguenti per estrazione logica, run.sh e Storage filesystem riguardano solo un backend controllato dall’operatore. Con Supabase gestito ripristina database e byte grezzi su una destinazione vuota del provider con il suo processo supportato, poi configura e avvia Minddy con [la procedura dai sorgenti](/it/documentazione/managed-or-source-installation#source). Non eseguire Compose locale per un progetto supabase.com.

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


Dopo il build dai sorgenti e la verifica precedente, avvia l’applicazione recuperata con pnpm start o con il supervisore registrato nella [procedura dai sorgenti](/it/documentazione/managed-or-source-installation#source). Mantieni ingressi pubblici e job chiusi fino al superamento dei controlli seguenti.

## Verificare il risultato {#verify}

Confronta i conteggi, accedi con gli account e la MFA ripristinati, leggi progetto, ticket e pagina cifrati e scarica un campione di ogni bucket verificandone lo SHA-256. Prova integrazioni, revoche, Realtime, job, OAuth, MCP e callback. Registra percorsi, volumi, versioni, durata e finestra di perdita dei dati osservata. Dopo un errore di migrazione, usa l’insieme precedente. Le scritture successive alla copia possono andare perse durante il rollback. Non inventare SQL inverso e non considerare i container sani una prova di ripristino.
