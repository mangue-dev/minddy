---
{
  "id": "backups-and-restoration",
  "locale": "de",
  "title": "Sicherungen und Wiederherstellung",
  "summary": "Sichern Sie Datenbank, Storage, Konfiguration und Verschlüsselungsschlüssel, wählen Sie ein Sicherungsverfahren und stellen Sie einen vollständigen Satz auf einem leeren Ziel wieder her.",
  "topic": "Instanz betreiben",
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
  "revision": 2,
  "sourceRevision": 2,
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
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
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
    "Das full-Dateisystemprofil kalt sichern",
    "Ein logisches oder anbietergeführtes Backup erstellen",
    "Einen vollständigen Satz auf leerem Ziel wiederherstellen"
  ],
  "figures": [
    {
      "id": "restore-and-roll-back-flow",
      "kind": "diagram",
      "src": "/documentation/de/restore-and-roll-back-flow.svg",
      "alt": "Diagramm: Geprüftes vollständiges externes Backup. Leeres isoliertes Ziel mit passenden Versionen. Datenbank, Bytes und Schlüssel gemeinsam. Konto, Inhalte und Bytes vor Öffnung prüfen.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Geprüftes vollständiges externes Backup. Leeres isoliertes Ziel mit passenden Versionen. Datenbank, Bytes und Schlüssel gemeinsam. Konto, Inhalte und Bytes vor Öffnung prüfen.",
      "revision": 2,
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

Eine vollständige Sicherung hält Datenbank, Storage-Dateidaten, Konfiguration und benötigte Schlüssel zusammen. Dieser Leitfaden unterscheidet die kalte Sicherung des full-Dateisystemprofils von logischen und anbietergeführten Verfahren und erklärt die Wiederherstellung auf einem leeren Ziel. Wählen Sie vor Beginn das Verfahren, das zur tatsächlich installierten Architektur und zum Storage-Profil passt.

## Das full-Dateisystemprofil kalt sichern {#back-up-the-reference-instance}

Dieses Linux-Verfahren gilt nur für full mit dem festgelegten offiziellen Supabase-Dateisystem-Storage. Physische Wiederherstellung verlangt gleiche CPU-Architektur und exaktes PostgreSQL-Image. Managed Supabase, S3 und Quellcodebereitstellungen verwenden das logische/Anbieter-Verfahren. Kündigen Sie Schreibausfall an und stoppen Sie externe Worker. Das Ziel muss verschlüsselt, groß genug und außerhalb aktiver Daten liegen. Verwenden Sie auf der Quelle nie down --volumes. Der Satz umfasst Datenbank, Auth, Storage-Metadaten und Bytes, Migrationen, Richtlinien, Vault-Schlüssel, Konfiguration und Release-Identitäten.

### Installierten Compose-Kontext setzen {#context}

Ersetzen Sie Beispielversion und Pfade durch die tatsächlich installierte Instanz und setzen Sie MODE=full. Behalten Sie vorhandene Restore-Overrides in jedem Compose-Aufruf. Verwenden Sie niemals allein das Upstream-docker-compose, das Minddy-Overlay und Umgebung auslässt. Führen Sie die Umgebung nicht als Shell-Code aus und zeigen Sie sie nicht an. Die Sicherung stoppt alle Dienste vor Kopieren der PostgreSQL-Dateien.

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

### Zusammengehörigen Satz versiegeln {#backup}

Führen Sie die folgende Kaltkopie bei gestoppten Schreibzugriffen aus. Sie erfasst Quellcode und Images, archiviert Upstream-Daten und db-config-Schlüsselvolume und erhält Bereitstellungsdateien und geschützte Umgebung. Fehlendes db-config ist ein Abbruchgrund. Bewahren Sie Release-Dateien, OCI-Digests und Datenbankimage nach Digest zur Wiederherstellung auf. Enthält die Sicherung Wurzelschlüssel und Geheimtext, sind äußere Verschlüsselung und Zugriffsschutz ihre Vertraulichkeitsgrenze.

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

### Ergebnis überprüfen {#verify}

Kopieren Sie den versiegelten Satz auf unabhängige Platte oder Host und prüfen Sie SHA256SUMS dort. Eine zweite Kopie auf demselben Host schützt nicht vor Hostverlust. Erhalten Sie TLS-Zertifikatsspeicher separat, falls die Richtlinie es verlangt. Bei reiner Sicherung starten Sie nach Prüfung mit compose up -d --wait neu. Bevor das Backup als nutzbar gilt, stellen Sie es auf leerem isoliertem Ziel wieder her, melden sich einschließlich MFA an, prüfen erhaltene Tickets und Anhänge mit gleichem SHA-256. Erhalten Sie passende historische Schlüssel.

Wenn die Instanz den gepinnten Runner-Workaround verwendet, behalten Sie RUNNER_FIX_OVERRIDE und RUNNER_FIX_DIR neben einem vorhandenen Wiederherstellungs-Override bei. Diese Dateien gehören zum zusammengehörigen Wiederherstellungssatz. Stellen Sie ihre absoluten Pfade wieder her oder passen Sie beide Mounts ausdrücklich an den neuen Ort an, bevor Sie den Runner starten.

Der Befehl für die kalte Sicherung erkennt auch ein benanntes Dateisystem-Storage-Volume und archiviert dessen Bytes getrennt. Ein Bind-Mount ist weiterhin durch supabase-docker.tar.gz abgedeckt. Beide Fälle schließen ein S3- oder Anbieter-Backend aus.

## Ein logisches oder anbietergeführtes Backup erstellen {#logical-and-provider-backups}

Dieses Verfahren gilt für Quellcode, verwaltete Datenbanken und eigenen Storage. Ordnen Sie Datenbank-, Rohstorage- und Proxybefehle derselben installierten Instanz zu. self-host:backup, self-host:update und self-host:restore sind nur lesende Vorprüfungen, keine Sicherung, Bereitstellung oder Wiederherstellung. Ein vollständiges Backup umfasst PostgreSQL mit auth, storage-Metadaten und Migrationshistorie, Rohbytes, geschützte Konfiguration und Schlüssel und exakte Quellcode-/Supabase-Identitäten an einem schreibkonsistenten Zeitpunkt.

### Supabase bei einem verwalteten Anbieter {#provider}

Erfassen Sie bei providerverwaltetem Supabase Projekt, Datenbankversion, Backup- oder Snapshot-ID und Wiederherstellungspunkt. Schließen Sie Minddy, Worker und geplante Schreibvorgänge. Nutzen Sie dann die unterstützten Konsistenz- oder Wartungskontrollen des Anbieters für direkte Schreibvorgänge über Auth, PostgREST und Storage. Sind diese nicht verfügbar, dokumentieren Sie die Einschränkung: Die Anwendung allein anzuhalten genügt nicht. Führen Sie die SQL-Exporte unten nur aus, wenn Datenbankrolle und Anbieter sie unterstützen, einschließlich Auth, Storage-Metadaten, Migrationshistorie und verwalteter Policies. Sichern Sie rohe Objektbytes getrennt per unterstütztem Export oder unveränderlichem Backend-Snapshot. Bewahren Sie die geschützte Minddy-Umgebung, ihre Schlüssel und die von Ihnen kontrollierten Auth-/SMTP-, URL-, Proxy- und Job-Einstellungen auf. Plattformrollen und pgsodium-Schlüssel können dem Anbieter gehören; stellen Sie sie nicht als lokale Dateien dar. Die folgenden Blöcke mit SUPABASE_COMPOSE_DIR, docker compose, supabase.env, pgsodium und Dateisystem-tar gelten nur für ein vom Betreiber kontrolliertes Backend. Prüfen Sie die vollständige Wiederherstellung in einem separaten leeren Anbieterprojekt, bevor Sie dem Backup vertrauen. Für diese Dokumentationsrevision wurde kein Anbieter-Backup oder -Restore ausgeführt.

### Schreiben sperren und SQL exportieren {#outage}

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

### Rohbytes und Konfiguration erhalten {#bytes}

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

### Ergebnis überprüfen {#logical-and-provider-backups-verify}

Erzeugen und prüfen Sie SHA256SUMS für den vollständigen Satz, verschlüsseln Sie ihn, kopieren Sie ihn auf einen anderen Host und prüfen Sie erneut. Erfassen Sie Versionen, Images, Objektzahlen und Beispieldatei-Hashes. Ein erfolgreicher Export beweist keine Wiederherstellung. Erproben Sie diese auf leerem Ziel mit gesicherten Versionen und Konfiguration, bevor Sie sich darauf verlassen; dokumentieren Sie Anbietergrenzen ausdrücklich.

## Einen vollständigen Satz auf leerem Ziel wiederherstellen {#restore-and-roll-back}

Wiederherstellung überschreibt ihr Ziel und führt keine Daten zusammen. Holen Sie das versiegelte externe Backup, prüfen Sie SHA256SUMS und lassen Sie Quelldaten unverändert. Zielzugang, Scheduler und externe Worker bleiben gestoppt. Physisches full-Restore verlangt gesicherte Architektur und exaktes PostgreSQL-Image. Holen Sie Quelltag und festgelegtes Upstream in neue Verzeichnisse und installieren Sie eingefrorene Werkzeuge. Prüfen Sie fehlendes Ziel-Datenbankverzeichnis, keine Storage-Objekte und kein db-config-Volume. Führen Sie auf dem leeren physischen Ziel keinen normalen Installer oder Bootstrap aus.


![Diagramm: Geprüftes vollständiges externes Backup. Leeres isoliertes Ziel mit passenden Versionen. Datenbank, Bytes und Schlüssel gemeinsam. Konto, Inhalte und Bytes vor Öffnung prüfen.](/documentation/de/restore-and-roll-back-flow.svg)

### full-Dateisystem wiederherstellen {#physical}

Nutzen Sie die vollständige physische Sequenz mit neuen Pfaden und Volumenamen. Sie entfernt gestoppte Quellcontainer ohne Volumenlöschung, stellt kaltes PostgreSQL und Storage zusammen wieder her, restauriert db-config mit gesichertem Image und vergleicht dieses vor Datenbankstart. Ändern Sie in der geschützten Umgebung nur Zielpfade, öffentliche Origins und Auth-Weiterleitungen. Erhalten Sie JWT, Passwörter, Vault-/Anwendungsschlüssel und Release-/Imageidentität. RESTORE_OVERRIDE muss bei jeder weiteren Operation bleiben; Weglassen kann Quellvolumes auswählen. Kompilieren Sie die Offline-Hauptfunktion, starten Sie Abhängigkeiten und Anwendung/Runner und prüfen Sie Wartungsbereitschaft vor Öffnung.


Definieren Sie vor dem ersten compose down den [installierten Compose-Kontext der Quellinstanz](/de/dokumentation/backups-and-restoration#context) einschließlich ihres vorhandenen Overrides.

Falls storage-volume.tar.gz vorhanden ist, stellen Sie das Archiv in einem neuen benannten Linux-Volume wieder her und verbinden Sie genau dieses Volume über den dauerhaften Restore-Override, bevor Sie Storage starten. Die Prüfung auf ein leeres Ziel gilt auch für dieses Volume.

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

### Logischen Satz wiederherstellen {#logical}

Provisionieren Sie für logisches Restore einen leeren Stack mit aufgezeichneten PostgreSQL-/Supabase-Versionen und passenden Konfigurationen/Schlüsseln. Prüfen Sie Zieldatenbank und Rohstorage vor SQL. Stellen Sie Rollen, Schema und Daten in einer Transaktion wieder her, anschließend Migrationshistorie und verwaltete Richtlinien. Stoppen Sie Ziel-Storage und restaurieren Sie Rohdateien oder S3-Snapshot in ein neues leeres Backend. Kein Upload über Storage-API. Managed-Anbieter verlangen ihr eigenes Restore-Verfahren statt Dateisystembefehlen. Verwenden Sie den gesicherten Anwendungskommit und seine Schlüssel mit isolierten Ziel-Origins.


Die folgenden Befehle für logische Extraktion, run.sh und Dateisystem-Storage gelten nur für ein vom Betreiber kontrolliertes Backend. Stellen Sie bei verwaltetem Supabase Datenbank und rohe Objektbytes mit dem unterstützten Anbieterprozess in einem leeren Ziel wieder her. Konfigurieren und starten Sie Minddy anschließend nach [der Quellinstallation](/de/dokumentation/installation#source). Führen Sie für ein Projekt auf supabase.com keine lokalen Compose-Befehle aus.

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


Starten Sie die wiederhergestellte Anwendung nach Quellbuild und Prüfung mit pnpm start oder dem aufgezeichneten Prozessmanager aus [der Quellinstallation](/de/dokumentation/installation#source). Halten Sie öffentlichen Zugang und Jobs bis zum Bestehen der folgenden Prüfungen geschlossen.

### Ergebnis überprüfen {#restore-and-roll-back-verify}

Vergleichen Sie erfasste Datensatz- und Objektzahlen. Melden Sie sich mit wiederhergestelltem Konto und MFA an, lesen Sie verschlüsselte Projekte/Tickets/Seiten und laden Sie Objekte jedes Buckets mit gleichem SHA-256 herunter. Prüfen Sie Integrationen, widerrufene Schlüssel, Realtime, Jobs, OAuth/MCP und Callback-Origins. Erfassen Sie Zielpfade, Volumes, Versionen, Dauer und beobachtetes Datenverlustfenster. Verwenden Sie nach Migrationsfehler den passenden Vorupdatesatz. Nach Backup wieder geöffnete Schreibzugriffe können bei Rücksetzung verloren gehen. Erfinden Sie keine Rückwärtsmigrationen und erklären Sie gesunde Container nicht zur Wiederherstellungsprüfung.
