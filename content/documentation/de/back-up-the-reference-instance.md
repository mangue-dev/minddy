---
{
  "id": "back-up-the-reference-instance",
  "locale": "de",
  "title": "Das full-Dateisystemprofil kalt sichern",
  "summary": "Dieses Linux-Verfahren gilt nur für full mit dem festgelegten offiziellen Supabase-Dateisystem-Storage.",
  "topic": "Instanz betreiben",
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

## Das full-Dateisystemprofil kalt sichern {#back-up-the-reference-instance}

Dieses Linux-Verfahren gilt nur für full mit dem festgelegten offiziellen Supabase-Dateisystem-Storage. Physische Wiederherstellung verlangt gleiche CPU-Architektur und exaktes PostgreSQL-Image. Managed Supabase, S3 und Quellcodebereitstellungen verwenden das logische/Anbieter-Verfahren. Kündigen Sie Schreibausfall an und stoppen Sie externe Worker. Das Ziel muss verschlüsselt, groß genug und außerhalb aktiver Daten liegen. Verwenden Sie auf der Quelle nie down --volumes. Der Satz umfasst Datenbank, Auth, Storage-Metadaten und Bytes, Migrationen, Richtlinien, Vault-Schlüssel, Konfiguration und Release-Identitäten.

## Installierten Compose-Kontext setzen {#context}

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

## Zusammengehörigen Satz versiegeln {#backup}

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

## Ergebnis überprüfen {#verify}

Kopieren Sie den versiegelten Satz auf unabhängige Platte oder Host und prüfen Sie SHA256SUMS dort. Eine zweite Kopie auf demselben Host schützt nicht vor Hostverlust. Erhalten Sie TLS-Zertifikatsspeicher separat, falls die Richtlinie es verlangt. Bei reiner Sicherung starten Sie nach Prüfung mit compose up -d --wait neu. Bevor das Backup als nutzbar gilt, stellen Sie es auf leerem isoliertem Ziel wieder her, melden sich einschließlich MFA an, prüfen erhaltene Tickets und Anhänge mit gleichem SHA-256. Erhalten Sie passende historische Schlüssel.

Wenn die Instanz den gepinnten Runner-Workaround verwendet, behalten Sie RUNNER_FIX_OVERRIDE und RUNNER_FIX_DIR neben einem vorhandenen Wiederherstellungs-Override bei. Diese Dateien gehören zum zusammengehörigen Wiederherstellungssatz. Stellen Sie ihre absoluten Pfade wieder her oder passen Sie beide Mounts ausdrücklich an den neuen Ort an, bevor Sie den Runner starten.

Der Befehl für die kalte Sicherung erkennt auch ein benanntes Dateisystem-Storage-Volume und archiviert dessen Bytes getrennt. Ein Bind-Mount ist weiterhin durch supabase-docker.tar.gz abgedeckt. Beide Fälle schließen ein S3- oder Anbieter-Backend aus.
