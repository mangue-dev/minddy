---
{
  "id": "logical-and-provider-backups",
  "locale": "de",
  "title": "Ein logisches oder anbietergeführtes Backup erstellen",
  "summary": "Dieses Verfahren gilt für Quellcode, verwaltete Datenbanken und eigenen Storage.",
  "topic": "Instanz betreiben",
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

## Ein logisches oder anbietergeführtes Backup erstellen {#logical-and-provider-backups}

Dieses Verfahren gilt für Quellcode, verwaltete Datenbanken und eigenen Storage. Ordnen Sie Datenbank-, Rohstorage- und Proxybefehle derselben installierten Instanz zu. self-host:backup, self-host:update und self-host:restore sind nur lesende Vorprüfungen, keine Sicherung, Bereitstellung oder Wiederherstellung. Ein vollständiges Backup umfasst PostgreSQL mit auth, storage-Metadaten und Migrationshistorie, Rohbytes, geschützte Konfiguration und Schlüssel und exakte Quellcode-/Supabase-Identitäten an einem schreibkonsistenten Zeitpunkt.


## Supabase bei einem verwalteten Anbieter {#provider}

Erfassen Sie bei providerverwaltetem Supabase Projekt, Datenbankversion, Backup- oder Snapshot-ID und Wiederherstellungspunkt. Schließen Sie Minddy, Worker und geplante Schreibvorgänge. Nutzen Sie dann die unterstützten Konsistenz- oder Wartungskontrollen des Anbieters für direkte Schreibvorgänge über Auth, PostgREST und Storage. Sind diese nicht verfügbar, dokumentieren Sie die Einschränkung: Die Anwendung allein anzuhalten genügt nicht. Führen Sie die SQL-Exporte unten nur aus, wenn Datenbankrolle und Anbieter sie unterstützen, einschließlich Auth, Storage-Metadaten, Migrationshistorie und verwalteter Policies. Sichern Sie rohe Objektbytes getrennt per unterstütztem Export oder unveränderlichem Backend-Snapshot. Bewahren Sie die geschützte Minddy-Umgebung, ihre Schlüssel und die von Ihnen kontrollierten Auth-/SMTP-, URL-, Proxy- und Job-Einstellungen auf. Plattformrollen und pgsodium-Schlüssel können dem Anbieter gehören; stellen Sie sie nicht als lokale Dateien dar. Die folgenden Blöcke mit SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium und Dateisystem-tar gelten nur für ein vom Betreiber kontrolliertes Backend. Prüfen Sie die vollständige Wiederherstellung in einem separaten leeren Anbieterprojekt, bevor Sie dem Backup vertrauen. Für diese Dokumentationsrevision wurde kein Anbieter-Backup oder -Restore ausgeführt.

## Schreiben sperren und SQL exportieren {#outage}

Schließen Sie Anwendung, Worker, Scheduler und öffentliche Supabase-API. Stoppen allein der Anwendung lässt direkte PostgREST-/Storage-Schreibzugriffe zu. Setzen Sie SUPABASE_DB_URL privat und BACKUP_DIR auf ein neues verschlüsseltes Ziel. Exportieren Sie SQL mit Werkzeugen der gewählten Version. Alle SQL-Dateien müssen Inhalt haben; data.sql muss COPY-Abschnitte für auth.users, storage.objects und Anwendungstabellen enthalten. Der normale Schemaexport lässt Migrationshistorie aus, deshalb sind beide separaten Exporte zwingend. Erhalten Sie verwaltete Storage-/Realtime-Richtlinien.

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

## Rohbytes und Konfiguration erhalten {#bytes}

Stoppen Sie bei eigenem Dateisystem-Storage storage und imgproxy nach dem SQL-Export und archivieren Sie das Backend mit numerischen Eigentümern, ACLs und erweiterten Attributen. S3 benötigt einen unveränderlichen Rohsnapshot beziehungsweise eine Version. Restaurieren Sie nie über /storage/v1/s3, das widersprüchliche Metadaten erzeugt. Managed-Anbieter kontrollieren Plattformrollen und Dateizugriff; nutzen Sie deren unterstütztes Verfahren und erfassen Sie dessen Umfang. Kopieren Sie Anwendung/Supabase, Proxy, Jobs, Auth-Vorlagen, SMTP und eventuellen pgsodium-Wurzelschlüssel privat. MINDDY_DATA_ROOT_KEY und erhaltene Geheimnisse gehören dazu. SQL allein enthält keine Anhangbytes.

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

## Ergebnis überprüfen {#verify}

Erzeugen und prüfen Sie SHA256SUMS für den vollständigen Satz, verschlüsseln Sie ihn, kopieren Sie ihn auf einen anderen Host und prüfen Sie erneut. Erfassen Sie Versionen, Images, Objektzahlen und Beispieldatei-Hashes. Ein erfolgreicher Export beweist keine Wiederherstellung. Erproben Sie diese auf leerem Ziel mit gesicherten Versionen und Konfiguration, bevor Sie sich darauf verlassen; dokumentieren Sie Anbietergrenzen ausdrücklich.
