---
{
  "id": "logical-and-provider-backups",
  "locale": "it",
  "title": "Creare backup logici o gestiti dal provider",
  "summary": "Per installazioni dai sorgenti, database gestiti e Storage personalizzato, associa comandi di database, byte e proxy alla stessa istanza.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H12"
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
      "docs/self-hosting-logical-operations.md",
      "content/knowledge/self-hosting-operations.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "back-up-the-reference-instance",
    "restore-and-roll-back"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Creare backup logici o gestiti dal provider {#logical-and-provider-backups}

Per installazioni dai sorgenti, database gestiti e Storage personalizzato, associa comandi di database, byte e proxy alla stessa istanza. self-host:backup, self-host:update e self-host:restore sono controlli preliminari di sola lettura: non eseguono queste operazioni. Un backup completo conserva PostgreSQL con auth, storage e storia delle migrazioni, byte grezzi dei file, configurazione, chiavi e identità esatte di Minddy e Supabase allo stesso punto, senza scritture concorrenti.


## Supabase gestito da un provider {#provider}

Per Supabase gestito registra progetto, versione database, identificatore del backup o snapshot e punto di recupero. Chiudi Minddy, worker e scritture pianificate; usa poi i controlli di coerenza o manutenzione supportati dal provider per le scritture dirette di Auth, PostgREST e Storage. Se non sono disponibili, documenta il limite: fermare soltanto l’applicazione non basta. Usa gli export SQL seguenti solo se ruolo database e provider li supportano, includendo Auth, metadati Storage, storia delle migrazioni e policy gestite. Conserva separatamente i byte grezzi degli oggetti tramite export supportato o snapshot immutabile del backend. Conserva ambiente protetto e chiavi Minddy, oltre alle impostazioni Auth/SMTP, URL, proxy e job sotto il tuo controllo. Ruoli di piattaforma e chiavi pgsodium possono appartenere al provider: non presentarli come file locali. I blocchi seguenti con SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium e tar filesystem riguardano solo un backend controllato dall’operatore. Valida il ripristino completo in un progetto vuoto separato prima di affidarti alla copia. Per questa revisione non è stato eseguito alcun backup o ripristino del provider.

## Bloccare scritture ed esportare SQL {#outage}

Chiudi l’applicazione, i worker, lo scheduler e l’API pubblica. Fermare solo il server web lascia aperte le scritture di PostgREST e Storage. Imposta SUPABASE_DB_URL in privato e scegli una BACKUP_DIR nuova e cifrata. Esporta SQL con gli strumenti della versione installata. Ogni file SQL deve essere non vuoto; data.sql deve contenere le istruzioni COPY per auth.users, storage.objects e le tabelle dell’applicazione. L’export ordinario omette la storia delle migrazioni: servono i due export separati mostrati. Conserva anche le policy gestite di Storage e Realtime.

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

## Conservare byte e configurazione {#bytes}

Se gestisci uno Storage filesystem, ferma storage e imgproxy dopo l’export SQL e archivia la directory preservando proprietari numerici, ACL e attributi estesi. Su S3 crea uno snapshot o una versione immutabile dei byte grezzi. Non ripristinare tramite /storage/v1/s3, che crea metadati in conflitto con quelli ripristinati. Il provider controlla ruoli e file di piattaforma: usa la sua procedura supportata e registrane la portata. Copia in privato configurazione Minddy e Supabase, proxy, job, template Auth, SMTP ed eventuale chiave radice pgsodium. Includi MINDDY_DATA_ROOT_KEY e gli altri segreti conservati. L’SQL non contiene i byte degli allegati.

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

## Verificare il risultato {#verify}

Genera e verifica SHA256SUMS sull’insieme completo, cifralo, copialo fuori dall’host e verifica di nuovo. Registra versioni, immagini, conteggi e hash dei campioni. Un export riuscito non prova il ripristino. Esegui una prova su una destinazione vuota con le versioni e la configurazione salvate prima di affidarti al backup; documenta i limiti del provider.
