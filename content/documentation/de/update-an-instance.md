---
{
  "id": "update-an-instance",
  "locale": "de",
  "title": "Instanzaktualisierungen",
  "summary": "Aktualisiere eine veröffentlichte Version nach der anderen.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-23",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-23"
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
      "caption": "Lies die Schritte in dieser Reihenfolge. Schreiben und Jobs stoppen. Vollständiges Vorupdate-Backup versiegeln. Zielmigrationen, danach Zielanwendung. Wiederherstellung prüfen und öffnen.",
      "revision": 7,
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
            "title": "Schreiben und Jobs stoppen"
          },
          {
            "title": "Vollständiges Vorupdate-Backup versiegeln"
          },
          {
            "title": "Zielmigrationen, danach Zielanwendung"
          },
          {
            "title": "Wiederherstellung prüfen und öffnen"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "update-an-instance-flow"
  ]
}
---

## Eine Instanz mit gesichertem Rückweg aktualisieren {#update-an-instance}

Aktualisiere eine veröffentlichte Version nach der anderen. Lies Hinweise, Migrationsunterschiede und Kompatibilitätseinträge. Kombiniere das minddy-Update nicht mit einem PostgreSQL-Hauptversionswechsel oder dem Austausch einzelner Supabase-Images. Wenn der Zieleintrag eine neue offizielle Supabase-Version festlegt, [verschiebe den Upstream-Checkout](#supabase-release) im selben Wartungsfenster. Prüfe Zielquellcode, Release-Prüfsummen und OCI-Digest und bereite ein separates Verzeichnis mit eingefrorenen Abhängigkeiten vor. Kündige Ausfall und Abbruchfrist an. Bestätige nutzbares externes Backup und kürzlich erfolgreiche Wiederherstellung. Halte die aktuelle Anwendung und geschützte Umgebung startfähig.

Einige Migrationen löschen Daten ausgemusterter Funktionen endgültig. Das Update von v0.11.0 auf v0.20.0 entfernt die Einträge benutzerdefinierter Domains, die Läufe und Unterhaltungen des Code-Agenten samt Verlauf und Verbindungen sowie die gespeicherten Ansichten der Befehlspalette (persönliche Lesezeichen; Board-Ansichten bleiben erhalten). Nach diesen Migrationen kann nur das vollständige Backup von vor dem Update sie zurückholen.


![Diagramm: Schreiben und Jobs stoppen. Vollständiges Vorupdate-Backup versiegeln. Zielmigrationen, danach Zielanwendung. Wiederherstellung prüfen und öffnen.](/documentation/de/update-an-instance-flow.svg)

## Das full-Profil aktualisieren {#full}

Verwende den full-Compose-Kontext des Kaltbackup-Artikels. Stoppe öffentliche Zugänge, Schreibzugriffe, Worker und Scheduler und erstelle den vollständigen versiegelten Satz. Kopiere die Umgebung mit Modus `0600` nach `TARGET_ENV_FILE` und ändere nur `MINDDY_RELEASE`, `MINDDY_IMAGE`, `MINDDY_DEPLOY_DIR` und `MINDDY_ENV_FILE` für das geprüfte Ziel. Behalte URLs, Zugangsdaten, Schlüssel und Funktionsauswahl. Lösche `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` sowie die Vercel-Sandbox-Variablen `VERCEL_TOKEN`, `VERCEL_TEAM_ID` und `VERCEL_PROJECT_ID`, falls eine frühere Release sie hinterlassen hat: Die Anwendung liest sie nicht mehr, und `--remove-orphans` entfernt den ausgemusterten Container `agent-runner`. Die folgende Sequenz im installierten Kontext startet nur Backendabhängigkeiten, migriert mit Zielcode und prüft die Anwendung bei gestopptem Caddy und Scheduler.

Beim Update von v0.10.30 auf v0.11.0 führt die Zielversion `MINDDY_DATA_ROOT_KEY` ein. Ergänze den Schlüssel nur, wenn die vorhandene Konfiguration keinen Root-Schlüssel enthält, und behalte alle bisherigen Geheimnisse zur Verschlüsselung von Zugangsdaten. Der folgende Befehl schreibt einen neuen Root-Schlüssel mit 32 Bytes direkt in die geschützte Zieldatei, ohne ihn anzuzeigen, und ersetzt keinen ungültigen gespeicherten Wert. Ist die Quelle v0.11.0 oder neuer, existiert der Root-Schlüssel normalerweise bereits, und der Befehl prüft ihn nur. Der Root-Schlüssel allein aktiviert keine Inhaltsverschlüsselung: Ohne `MINDDY_CONTENT_ENCRYPTION_ENABLED=true` bleibt sie deaktiviert.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_ENV_FILE=/etc/minddy/target.env
install -m 0600 "$MINDDY_ENV_FILE" "$TARGET_ENV_FILE"
compose up -d --wait db database-access api-gw auth rest storage imgproxy
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
node -- scripts/bootstrap-supabase.mjs --db-url "$SUPABASE_DB_URL" \
  --env-file "$TARGET_ENV_FILE" --existing-env --supabase-url http://127.0.0.1:8001 --enable scheduler
unset SUPABASE_DB_URL
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
export MINDDY_ENV_FILE="$TARGET_ENV_FILE"
node -- scripts/prepare-self-hosted-functions.mjs --supabase-dir "$SUPABASE_DIR" \
  --env-file "$MINDDY_ENV_FILE"
compose pull minddy
compose up -d --wait --remove-orphans minddy
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --skip-network --maintenance
compose up -d --wait
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml"
```

## Zu einer neuen festgelegten Supabase-Version wechseln {#supabase-release}

v0.20.1 legt das offizielle Supabase `self-hosted/v0.8.3` statt `self-hosted/v0.7.2` fest und behebt damit die Sicherheitshinweise zu Storage und Realtime vom Oktober 2026. Wenn der Zieleintrag eine andere Supabase-Version festlegt, führe die folgenden Befehle im full-Profil nach dem versiegelten Backup und vor der obigen Update-Sequenz aus. Checke den neuen Commit nie im bestehenden Upstream-Verzeichnis aus: Es enthält die Datenbank- und Storage-Dateien. Hole ihn mit den Werkzeugen der Zielversion in ein neues Verzeichnis und verschiebe die Daten, während alle Dienste gestoppt sind. Ab `self-hosted/v0.8.3` ersetzt Envoy Kong, und der Gateway-Dienst heißt `api-gw`; die Sequenz entfernt daher den gestoppten Container `supabase-kong`. Die geschützte Umgebung braucht keine neue Variable.

```bash
export TARGET_RELEASE_DIR=/srv/minddy/releases/vX.Y.NEXT
export TARGET_SUPABASE_DIR=/srv/minddy/supabase-vX.Y.NEXT
cd "$TARGET_RELEASE_DIR"
pnpm install --frozen-lockfile
node scripts/fetch-official-supabase.mjs --destination "$TARGET_SUPABASE_DIR"
compose stop
SOURCE_VOLUMES="$SUPABASE_DIR/docker/volumes"
TARGET_VOLUMES="$TARGET_SUPABASE_DIR/docker/volumes"
test ! -e "$TARGET_VOLUMES/db/data"
sudo mv "$SOURCE_VOLUMES/db/data" "$TARGET_VOLUMES/db/data"
if [ -d "$SOURCE_VOLUMES/storage" ]; then
  sudo find "$SOURCE_VOLUMES/storage" -mindepth 1 -maxdepth 1 ! -name .gitkeep \
    -exec mv -t "$TARGET_VOLUMES/storage" {} +
fi
if [ -d "$SOURCE_VOLUMES/snippets" ]; then
  sudo mv "$SOURCE_VOLUMES/snippets" "$TARGET_VOLUMES/snippets"
fi
docker rm supabase-kong 2>/dev/null || true
export SUPABASE_DIR="$TARGET_SUPABASE_DIR"
export CURRENT_RELEASE_DIR="$TARGET_RELEASE_DIR"
```

Führe danach die Update-Sequenz des full-Profils aus. Behalte das alte Upstream-Verzeichnis, bis die wieder geöffnete Instanz ihre Prüfungen besteht. Für ein Zurückrollen stellst du das versiegelte Backup mit der vorherigen Version und ihrem gespeicherten Upstream-Commit wieder her.

## Managed- und Quellcodebetrieb unterscheiden {#managed-source}

Managed OCI folgt demselben Zielumgebungs- und Imageablauf mit anbietergesteuertem Datenbank-/Storage-Backup und Migrationszugriff statt lokalen Backenddiensten. Bei Quellcode baust du den Zieltag, sperrst öffentliche API-Schreibzugriffe, sicherst logisch beziehungsweise beim Anbieter, bootstrappst mit Zielcode und startest Produktion hinter Wartung. Ersetze OCI zur Prüfung nicht durch einen Quellcodeprozess. Starte alten Code nicht auf geändertem Schema ohne ausdrückliche Kompatibilitätsgarantie.


Die lokalen Compose-Befehle im folgenden Quellverfahren gelten nur für ein vom Betreiber kontrolliertes Backend. Ersetze bei verwaltetem Supabase das Anhalten und Starten des Backends sowie den Migrationszugriff durch unterstützte Anbieteroperationen. Bewahre die geschützte minddy-Umgebung und ein vollständiges Anbieter-Backup auf und starte anschließend die geprüfte Zielanwendung.


Setze für das Quellverfahren `MINDDY_REPO` auf das versionierte Quellrepository, `SUPABASE_COMPOSE_DIR` auf das betreiberkontrollierte Backend aus [dem logischen Backup-Kontext](/de/dokumentation/backups-and-restoration#outage), `TO_TAG` auf den tatsächlich nächsten veröffentlichten und geprüften Tag und `TARGET_RELEASE_DIR` auf dessen separat erstellten Checkout. Stelle die passenden Datenbank- und öffentlichen API-Variablen privat bereit. Starte das Ziel nach Bootstrap und Prüfung mit `pnpm start` oder deinem vorhandenen Prozessmanager hinter der Wartung. Öffne den Zugang erst nach den folgenden Prüfungen.

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

Führe Wartungsdoctor vor Zugang/Jobs und normalen doctor nach Öffnung aus. Melde dich an, prüfe erhaltene Projekt-/Ticket-IDs, erstelle und ändere Demodaten, übertrage einen Anhang mit gleichem SHA-256 und prüfe Realtime und harmlosen Job. Ein widerrufener Integrationsschlüssel muss weiter scheitern. Erfasse Imagedigest und Migrationen. Bei Fehler bleibt der fehlerhafte Stack gestoppt; inkompatibler Rückweg stellt den vollständigen alten Satz auf leerem Ziel wieder her. Es gibt keine generierten Rückwärtsmigrationen.
