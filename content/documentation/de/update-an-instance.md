---
{
  "id": "update-an-instance",
  "locale": "de",
  "title": "Instanzaktualisierungen",
  "summary": "Aktualisieren Sie eine veröffentlichte Version nach der anderen.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H13"
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
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Eine Instanz mit gesichertem Rückweg aktualisieren"
  ],
  "figures": [
    {
      "id": "update-an-instance-flow",
      "kind": "diagram",
      "src": "/documentation/de/update-an-instance-flow.svg",
      "alt": "Diagramm: Schreiben und Jobs stoppen. Vollständiges Vorupdate-Backup versiegeln. Zielmigrationen, danach Zielanwendung. Wiederherstellung prüfen und öffnen.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Schreiben und Jobs stoppen. Vollständiges Vorupdate-Backup versiegeln. Zielmigrationen, danach Zielanwendung. Wiederherstellung prüfen und öffnen.",
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
    "update-an-instance-flow"
  ]
}
---

## Eine Instanz mit gesichertem Rückweg aktualisieren {#update-an-instance}

Aktualisieren Sie eine veröffentlichte Version nach der anderen. Lesen Sie Hinweise, Migrationsunterschiede und Kompatibilitätseinträge. Kombinieren Sie Minddy-Update nicht mit PostgreSQL-Hauptversion oder Supabase-Imagewechsel. Prüfen Sie Zielquellcode, Release-Prüfsummen und OCI-Digest und bereiten Sie ein separates Verzeichnis mit eingefrorenen Abhängigkeiten vor. Kündigen Sie Ausfall und Abbruchfrist an. Bestätigen Sie nutzbares externes Backup und kürzlich erfolgreiche Wiederherstellung. Erhalten Sie die aktuelle Anwendung und geschützte Umgebung startfähig.


![Diagramm: Schreiben und Jobs stoppen. Vollständiges Vorupdate-Backup versiegeln. Zielmigrationen, danach Zielanwendung. Wiederherstellung prüfen und öffnen.](/documentation/de/update-an-instance-flow.svg)

## Das full-Profil aktualisieren {#full}

Verwenden Sie den full-Compose-Kontext des Kaltbackup-Artikels. Stoppen Sie öffentliche Zugänge, Schreibzugriffe, Worker und Scheduler und erstellen Sie den vollständigen versiegelten Satz. Kopieren Sie die Umgebung mit Modus 0600 nach TARGET_ENV_FILE und ändern Sie nur MINDDY_RELEASE, MINDDY_IMAGE, MINDDY_DEPLOY_DIR und MINDDY_ENV_FILE für das geprüfte Ziel. Erhalten Sie URLs, Zugangsdaten, Schlüssel und Funktionsauswahl. Die folgende Sequenz im installierten Kontext startet nur Backendabhängigkeiten, migriert mit Zielcode und prüft Anwendung/Runner bei gestopptem Caddy und Scheduler.

Beim Update von v0.10.30 auf v0.11.0 führt die Zielversion MINDDY_DATA_ROOT_KEY ein. Ergänzen Sie den Schlüssel nur, wenn die vorhandene Konfiguration keinen Root-Schlüssel enthält, und behalten Sie alle bisherigen Geheimnisse zur Verschlüsselung von Zugangsdaten. Der folgende Befehl schreibt einen neuen Root-Schlüssel mit 32 Bytes direkt in die geschützte Zieldatei, ohne ihn anzuzeigen, und ersetzt keinen ungültigen gespeicherten Wert. Der Root-Schlüssel allein aktiviert keine Inhaltsverschlüsselung. Wenden Sie vor dem Start die [festgelegten Anpassungen für Runner und Offline-Funktionen](/de/dokumentation/installation#runner-workaround) an und behalten Sie RUNNER_FIX_OVERRIDE bei jedem Compose-Aufruf bei. Dies ist ein ausdrücklich angepasstes Profil; eine erfolgreiche Installation des unveränderten historischen Tags wird damit nicht belegt.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access kong auth rest storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node --input-type=module <<'NODE'
import {readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnvironment} from './scripts/self-hosting-install.mjs';
const file = process.env.TARGET_ENV_FILE;
const text = readFileSync(file, 'utf8');
const values = parseEnvironment(text);
if (Object.hasOwn(values, 'MINDDY_DATA_ROOT_KEY')) {
  if (!/^[a-f0-9]{64}$/i.test(values.MINDDY_DATA_ROOT_KEY)) {
    throw new Error('Recover the valid existing root key; do not replace it.');
  }
} else {
  writeFileSync(file, text + '\nMINDDY_DATA_ROOT_KEY=' + randomBytes(32).toString('hex') + '\n', {mode: 0o600});
  chmodSync(file, 0o600);
}
NODE
SUPABASE_DB_URL="$(node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {parseEnvironment,fullBootstrapDatabaseUrl} from "./scripts/self-hosting-install.mjs";
  console.log(fullBootstrapDatabaseUrl(parseEnvironment(readFileSync(process.env.TARGET_ENV_FILE,"utf8"))));
')"
node scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy agent-runner
compose up -d --wait minddy agent-runner
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Managed- und Quellcodebetrieb unterscheiden {#managed-source}

Managed OCI folgt demselben Zielumgebungs- und Imageablauf mit anbietergesteuertem Datenbank-/Storage-Backup und Migrationszugriff statt lokalen Backenddiensten. Bei Quellcode bauen Sie den Zieltag, sperren öffentliche API-Schreibzugriffe, sichern logisch beziehungsweise beim Anbieter, bootstrappen mit Zielcode und starten Produktion hinter Wartung. Ersetzen Sie OCI zur Prüfung nicht durch einen Quellcodeprozess. Starten Sie alten Code nicht auf geändertem Schema ohne ausdrückliche Kompatibilitätsgarantie.


Die lokalen Compose-Befehle im folgenden Quellverfahren gelten nur für ein vom Betreiber kontrolliertes Backend. Ersetzen Sie bei verwaltetem Supabase das Anhalten und Starten des Backends sowie den Migrationszugriff durch unterstützte Anbieteroperationen. Bewahren Sie die geschützte Minddy-Umgebung und ein vollständiges Anbieter-Backup auf und starten Sie anschließend die geprüfte Zielanwendung.


Setzen Sie für das Quellverfahren MINDDY_REPO auf das versionierte Quellrepository, SUPABASE_COMPOSE_DIR auf das betreiberkontrollierte Backend aus [dem logischen Backup-Kontext](/de/dokumentation/backups-and-restoration#outage), TO_TAG auf den tatsächlich nächsten veröffentlichten und geprüften Tag und TARGET_RELEASE_DIR auf dessen separat erstellten Checkout. Stellen Sie die passenden Datenbank- und öffentlichen API-Variablen privat bereit. Starten Sie das Ziel nach Bootstrap und Prüfung mit pnpm start oder Ihrem vorhandenen Prozessmanager hinter der Wartung. Öffnen Sie den Zugang erst nach den folgenden Prüfungen.

```bash
test "$(git -C "$TARGET_RELEASE_DIR" rev-parse HEAD)" = \
  "$(git -C "$MINDDY_REPO" rev-parse "${TO_TAG}^{commit}")"
test -d "$TARGET_RELEASE_DIR/.next"
cd "$SUPABASE_COMPOSE_DIR"
docker compose up -d storage imgproxy
cd "$TARGET_RELEASE_DIR"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm verify:supabase --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$MINDDY_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
curl --fail --silent --show-error "$MINDDY_PUBLIC_SUPABASE_URL/auth/v1/health"
```

## Ergebnis überprüfen {#verify}

Führen Sie Wartungsdoctor vor Zugang/Jobs und normalen doctor nach Öffnung aus. Melden Sie sich an, prüfen Sie erhaltene Projekt-/Ticket-IDs, erstellen und ändern Sie Demodaten, übertragen Sie Anhang mit gleichem SHA-256 und prüfen Sie Realtime und harmlosen Job. Ein widerrufener Integrationsschlüssel muss weiter scheitern. Erfassen Sie Imagedigest und Migrationen. Bei Fehler bleibt der fehlerhafte Stack gestoppt; inkompatibler Rückweg stellt den vollständigen alten Satz auf leerem Ziel wieder her. Es gibt keine generierten Rückwärtsmigrationen.
