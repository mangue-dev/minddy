---
{
  "id": "installation",
  "locale": "de",
  "title": "Installationsreferenz",
  "summary": "Wähle eine geprüfte Version und ein Installationsprofil, installiere das vollständige, verwaltete oder Quellcode-Profil und prüfe dessen Betriebsgrenzen.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01",
    "H03",
    "H04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 14,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/compose.managed.yml",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "components/documentation/documentation-navigation.tsx",
      "components/documentation/documentation-article.tsx",
      "desktop/src/local-installer.ts"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:claude-code (MIN-847 installer question checked against scripts/self-hosting-install.mjs and lib/desktop/local-installer.ts); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 recapture of install-a-server-wizard on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the introduction now points a private instance on your own computer to the desktop app's built-in installer; no installation run, no screenshot recaptured, existing figures carried forward unchanged)",
    "language": "agent:claude-code (de MIN-847 sentence; self-reviewed; agent review, not human acceptance); agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 figure update; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-788 changed passages; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "authentication-and-email",
    "backups-and-restoration",
    "instance-configuration"
  ],
  "aliases": [
    "self-hosted-compatibility",
    "install-a-server",
    "self-hosting",
    "managed-or-source-installation"
  ],
  "tags": [
    "Unterstützte Version und Installationsprofil auswählen",
    "Das Referenzprofil auf einem Server installieren",
    "Mit verwaltetem Supabase oder aus Quellcode installieren"
  ],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/de/self-hosted-compatibility-flow.svg",
      "alt": "Diagramm: Annotierter Quelltag. Dateien und SHA256SUMS. Offizielle OCI-Signatur und Digest. Gewähltes Kompatibilitätsprofil.",
      "caption": "Lies die Schritte in dieser Reihenfolge. Annotierter Quelltag. Dateien und `SHA256SUMS`. Offizielle OCI-Signatur und Digest. Gewähltes Kompatibilitätsprofil.",
      "revision": 14,
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
            "title": "Annotierter Quelltag"
          },
          {
            "title": "Dateien und `SHA256SUMS`"
          },
          {
            "title": "Offizielle OCI-Signatur und Digest"
          },
          {
            "title": "Gewähltes Kompatibilitätsprofil"
          }
        ]
      }
    },
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/de/install-a-server-flow.svg",
      "alt": "Diagramm: Geprüfte Release und geschützte Umgebung. Installer: full-Referenzprofil. Offizielles Supabase, App, Scheduler. Konto-, Datei- und Wiederherstellungsprüfung.",
      "caption": "Lies die Schritte in dieser Reihenfolge. Geprüfte Release und geschützte Umgebung. Installer: full-Referenzprofil. Offizielles Supabase, App, Scheduler. Konto-, Datei- und Wiederherstellungsprüfung.",
      "revision": 14,
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
            "title": "Geprüfte Release und geschützte Umgebung"
          },
          {
            "title": "Installer: full-Referenzprofil"
          },
          {
            "title": "Offizielles Supabase, App, Scheduler"
          },
          {
            "title": "Konto-, Datei- und Wiederherstellungsprüfung"
          }
        ]
      }
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/de/install-a-server-wizard.png",
      "alt": "Öffentlicher Installationsassistent mit ausgewähltem Supabase auf demselben Server.",
      "caption": "Das Profil full betreibt Anwendung und Supabase auf deinem Server. In diesem Beispiel bleibt der private Netzwerkzugang auf das LAN beschränkt.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        944,
        1090
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/de/managed-or-source-installation-flow.svg",
      "alt": "Diagramm: Dein verwaltetes Supabase-Projekt. PostgreSQL, Auth, Storage, Realtime. OCI-Profil ODER Anwendung aus Quelltag. Jobs und Sicherung passend zum Profil.",
      "caption": "Anwendung und Backend müssen zum gewählten Profil passen, einschließlich Zeitplänen und Sicherungsverfahren.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Dein verwaltetes Supabase-Projekt"
          },
          {
            "title": "PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "OCI-Profil ODER Anwendung aus Quelltag"
          },
          {
            "title": "Jobs und Sicherung passend zum Profil"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow",
    "install-a-server-flow",
    "managed-or-source-installation-flow"
  ]
}
---

Installiere deine Instanz aus einer geprüften Version mit dem passenden Profil: full, verwaltetes Supabase oder Quellcode. Prüfe zuerst die Kompatibilität. Folge dann dem gewählten Verfahren und den Abnahmeprüfungen, bevor du Benutzer zulässt. Für eine private Instanz auf deinem eigenen Computer verwende stattdessen das Installationsprogramm der Desktop-App, beschrieben unter [Lokale Instanzen](/de/dokumentation/install-locally#install-locally).

## MCP-Verfügbarkeit und Netzwerkzugriff {#mcp-network-access}

MCP ist in selbst gehostetem minddy enthalten und startet mit der Anwendung. Es funktioniert sofort unter `/api/mcp` an der mit `MINDDY_PUBLIC_APP_URL` konfigurierten Instanzadresse. OAuth-Erkennung und dynamische Client-Registrierung sind enthalten: Ein separater MCP-Server, eine eigene OAuth-Anwendung oder ein minddy-Cloud-Proxy ist nicht erforderlich. Verbinde deinen MCP-Client mit dem Endpunkt deiner Instanz, melde dich an und erteile den Zugriff im Browser.

Die Verfügbarkeit des Dienstes garantiert keine Erreichbarkeit im Netzwerk. Sowohl der MCP-Client als auch der Browser für die Autorisierung müssen die bekannt gegebenen MCP- und OAuth-URLs erreichen können. Wenn du `OAUTH_ISSUER` ausdrücklich überschreibst, muss auch diese Adresse erreichbar sein. Der Client muss die Verbindung, den OAuth-Ablauf und den gewählten Netzwerkweg unterstützen; manche Clients verlangen auch in privaten Netzwerken HTTPS.

Wähle eine Adresse, die der MCP-Client und sein Autorisierungsbrowser erreichen können. Auf demselben Computer kann ein kompatibler Client `http://localhost:6463/api/mcp` verwenden. Verwende auf einem anderen LAN/VPN-Computer die konfigurierte Serveradresse, etwa `http://192.168.1.50/api/mcp`, mit einer Bindungsadresse, einem Anwendungsport, einer Firewall und einem Routing, die den Zugriff erlauben. `localhost` und `127.0.0.1` zeigen immer auf den Computer, der die Verbindung aufbaut; die localhost-URL des Servers funktioniert dort daher nicht. Ein auf Loopback beschränkter Prozess bleibt direkt unerreichbar. Außerhalb des privaten Netzwerks nutzt du einen erreichbaren HTTPS-Endpunkt wie `https://tickets.example.com/api/mcp` oder einen unterstützten Netzwerkweg gemäß den Client-Anforderungen. Auch ein gehosteter Agent benötigt diesen Weg; lokales Hosting macht die Instanz nicht automatisch im Internet erreichbar.

[Lies die Hinweise zum MCP-Netzwerkzugriff, bevor du einen entfernten Client verbindest](/docs/minddy-mcp#network-access).

## Unterstützte Version und Installationsprofil auswählen {#self-hosted-compatibility}

Verwende eine unveränderliche Version aus dem öffentlichen Repository `mangue-dev/minddy` und lies ihre Anforderungen aus dem Eintrag in `deploy/self-hosted/compatibility.json`, dessen `minddyRelease` ihr entspricht. Eine Paketversion ohne eigenen Eintrag ist keine unterstützte selbstgehostete Release. Jeder veröffentlichte Eintrag unterstützt Linux-Produktionsserver mit amd64 oder arm64, Node.js 24, `pnpm` 10.28.0, Docker Engine ab 27.0.0 und das Compose-Plugin ab 2.29.0. Das Profil full bindet die offizielle Supabase-Version `self-hosted/v0.8.3` an Commit `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`. Behalte den vollständigen Imagesatz bei. Ein einzeln aktualisierter Dienst ergibt eine vom Betreiber verantwortete Variante.

Das Profil managed verbindet sich mit einem Supabase-Projekt auf supabase.com. PostgreSQL, Auth, Storage und Realtime müssen verfügbar sein und die Versionsprüfung bestehen. PostgreSQL allein genügt nicht. Der lokale Supabase-CLI-Stack dient Entwicklung und Erprobung, nicht einem öffentlichen Produktionsdienst.


![Diagramm: Annotierter Quelltag. Dateien und SHA256SUMS. Offizielle OCI-Signatur und Digest. Gewähltes Kompatibilitätsprofil.](/documentation/de/self-hosted-compatibility-flow.svg)

### Release vor Ausführung prüfen {#verify-release}

Prüfe vor Installation von Abhängigkeiten oder Ausführung den annotierten Tag, die Release-Dateien, `SHA256SUMS` und die offizielle OCI-Signatur. Die folgenden Bash-Befehle beginnen im Checkout des gewählten Tags und setzen `IMAGE` auf den geprüften Digest. Brich bei jedem fehlgeschlagenen Test ab. Installiere zunächst Cosign nach dessen offizieller Anleitung. Die Prüfung belegt Quellcode- und Imageidentität, nicht die Funktionsfähigkeit der Installation.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

### Betrieb und Updates planen {#support}

Installiere veröffentlichte Versionen nacheinander. Migrationen gehen nur vorwärts. Ein inkompatibles Zurücksetzen stellt Datenbank, Storage, Konfiguration und Anwendung als zusammengehörigen Satz wieder her. minddy pflegt Release-Werkzeuge und unterstützt nach Möglichkeit die Diagnose reproduzierbarer Fehler im Kern. DNS, TLS, Kapazität, Backups, Wiederherstellungsübungen und optionale Anbieter betreibst du. Veränderliche Imagetags und abgeleitete Supabase-Stacks übernehmen nicht den Supportvertrag der Release.

Die veröffentlichten Profile von v0.11.0 starten außerdem einen Dienst `agent-runner`, der fehlschlägt, bevor die Anwendung gesund wird. Spätere Releases entfernen diesen Runner und seine Code-Sandboxes vollständig: Numo führt keinen Code aus, und kein Dienst erhält den Docker-Socket. Installiere eine solche Release, statt v0.11.0 anzupassen.


## Das Referenzprofil auf einem Server installieren {#install-a-server}

Beginne mit einem geprüften Tag und dessen unveränderlichem Imagedigest. Unterstützt sind Linux amd64 und arm64. Managed Supabase benötigt mindestens 4 GB RAM, zwei Kerne und 20 GB SSD; auf demselben Host betriebenes Supabase benötigt 8 GB, vier Kerne und 60 GB. Öffentliches Hosting verlangt DNS und HTTPS auf eigenen Origins. HTTP ist nur für `localhost` oder private IPv4 erlaubt. Beschränke es auf ein vertrauenswürdiges LAN ohne Router-Portweiterleitungen. In diesem Modus stellt full die Anwendung auf Port 80 und die API auf 8000 bereit.


![Diagramm: Geprüfte Release und geschützte Umgebung. Installer: full-Referenzprofil. Offizielles Supabase, App, Scheduler. Konto-, Datei- und Wiederherstellungsprüfung.](/documentation/de/install-a-server-flow.svg)


![Öffentlicher Installationsassistent mit ausgewähltem Supabase auf demselben Server.](/documentation/de/install-a-server-wizard.png)

### Installer konfigurieren und starten {#install}

Führe `pnpm self-host:install` im Release-Verzeichnis aus. Wähle managed oder full, Anwendungsorigin und Administratoradresse. Hole für full zuerst den festgelegten Upstream-Checkout. Der Installer erzeugt eine Umgebung mit Modus `0600` und getrennte fehlende Geheimnisse, lädt Images, startet das Profil und führt den idempotenten Bootstrap aus. Bestehende Geheimnisse und Imagebindung bleiben erhalten. Der Installer fragt außerdem, ob Inhalte des Arbeitsbereichs verschlüsselt werden sollen; `--encryption enabled` (Standard) oder `--encryption disabled` beantwortet die Frage nicht interaktiv. Er schreibt `MINDDY_CONTENT_ENCRYPTION_ENABLED` und einen unabhängigen `MINDDY_DATA_ROOT_KEY`. Eine Wiederholung behält die gespeicherte Wahl bei und lehnt eine abweichende ab; lies vor einer Änderung die [Arbeitsbereichsverschlüsselung](/de/dokumentation/workspace-encryption#workspace-encryption). Er fragt außerdem, ob Administratoren die Variablen der Instanz im Admin-Dashboard bearbeiten dürfen; `--config-overrides enabled` (Standard) oder `--config-overrides disabled` antwortet ohne Rückfrage und schreibt `MINDDY_CONFIG_OVERRIDES`. Siehe [die Variablen der Instanz bearbeiten](/docs/instance-administration#instance-variables). Das Beispiel nutzt `IMAGE` aus der Kompatibilitätsprüfung. Ergänze für echte Auth-E-Mails zunächst `--skip-start`, konfiguriere `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` und `SMTP_SENDER_NAME` in der geschützten Datei und wiederhole dann den Aufruf. Behalte `ENABLE_EMAIL_AUTOCONFIRM=false`. `supabase-mail` ist ein Platzhalter, kein Produktionspostfach.


Vergleiche vor dem Start `MINDDY_RELEASE` und `MINDDY_IMAGE` in der geschützten Datei mit der gewählten Kompatibilitätszeile und dem geprüften Container-Asset. Der Installer übernimmt `MINDDY_RELEASE` aus der Bereitstellungsvorlage der Release, und `--image` ändert nur die Image-Referenz; eine Option `--release` gibt es nicht. Die Vorlage von v0.11.0 nennt zum Beispiel noch 0.10.30. Weicht der Wert von der installierten Release ab, bereite die Datei mit `--skip-start` vor, setze `MINDDY_RELEASE` ausdrücklich auf diese Release und behalte die geprüfte unveränderliche Image-Referenz. Ersetze weder erzeugte Zugangsdaten noch Verschlüsselungsschlüssel.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


Der obige Befehl erstellt `deploy/self-hosted/.env` im Verzeichnis der gewählten Release. Bearbeite diese geschützte Datei und führe denselben Befehl anschließend ohne `--skip-start` erneut aus, um das Profil zu starten und den Bootstrap auszuführen. Vorhandene Ursprungsadressen, Images und Geheimnisse verbleiben in der geschützten Datei.

Wenn du dieses vollständige Profil unter macOS mit Docker Desktop betreibst, wende vor dem ersten Start den [Volume-Override für Dateisystem-Storage](/de/dokumentation/storage-and-attachments#docker-desktop) an und behalte `RESTORE_OVERRIDE` für jeden späteren Compose-Vorgang bei. Der Bind-Mount auf einem Linux-Host und dieses Profil mit benanntem Volume benötigen unterschiedliche Byte-Archive; verwende das passende Sicherungs- und Wiederherstellungsverfahren.

### Vor Aufnahme von Benutzern prüfen {#accept}

Die Referenzprofile enthalten den Scheduler; sie enthalten keinen Code-Runner und binden keinen Docker-Socket ein. Veröffentliche weder PostgreSQL noch interne Dienstports im Internet. Führe doctor mit installierter Umgebung und Upstream-Compose-Datei für full aus. Teste Bestätigung, Anmeldung, MFA, Passwortwiederherstellung, Projekt- und Ticketerstellung, Anhänge und Realtime in zwei Sitzungen. HTTP 200 von `/api/health` belegt nur Anwendungsaktivität. Nach einer Unterbrechung führst du den Installer mit demselben Compose-Kontext und der geschützten Umgebungsdatei erneut aus; setze keine Daten zurück. Bereite vor Teameinführung ein externes Backup und Wiederherstellung auf ein leeres Ziel vor.




## Mit verwaltetem Supabase oder aus Quellcode installieren {#managed-or-source-installation}

Managed Supabase beschreibt den Betrieb des Backends. Es kann mit dem offiziellen OCI-Anwendungsprofil oder einer aus Quellcode betriebenen Anwendung kombiniert werden. Unterscheide diese Bereitstellungen in Installations- und Abnahmeprotokollen. Das Backend benötigt PostgreSQL, Auth, Storage und Realtime. Das geführte OCI-Profil managed benötigt ein Projekt auf supabase.com, öffentliche URL, Anon- und Service-Role-Schlüssel sowie eine für Bootstrap-Werkzeuge erreichbare PostgreSQL-Verbindung. Verwende dein eigenes Projekt. minddy-Cloud-Zugangsdaten sind keine Installationsparameter.


![Diagramm: Dein verwaltetes Supabase-Projekt. PostgreSQL, Auth, Storage, Realtime. OCI-Profil ODER Anwendung aus Quelltag. Jobs und Sicherung passend zum Profil.](/documentation/de/managed-or-source-installation-flow.svg)

### Managed Supabase konfigurieren {#managed}

Führe den folgenden Befehl im geprüften Release-Verzeichnis aus. `IMAGE` ist der geprüfte Digest aus dem Kompatibilitätsartikel. Werte mit ... sind unbrauchbare Beispiele. Beschaffe echte Werte privat und vermeide Geheimnisse in Shell-Verlauf oder geteilten Logs. Der Installer erhält die geschützte Umgebung, enthält den Scheduler und aktiviert optionale Dienste erst nach Konfiguration. Auth-SMTP und genaue Weiterleitungen konfigurierst du separat im eigenen Supabase-Projekt.

Das veröffentlichte OCI-Profil `managed` von v0.11.0 enthält denselben fehlschlagenden Runner wie das Full-Profil, daher kann sein unverändertes Installationsprogramm den Start nicht abschließen. Verwende eine spätere Release ohne Runner. Der folgende Befehl bereitet die Konfiguration mit `--skip-start` vor. Prüfe diese geschützte Datei, behalte das geprüfte Image sowie die erzeugten Geheimnisse bei und führe den Befehl dann ohne `--skip-start` erneut aus. Prüfe das Managed-Profil, bevor du Benutzer aufnimmst. Führe die lokalen Backend-Befehle des Full-Profils nicht für ein Anbieterprojekt aus.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE" --skip-start
```

### Quellcodebereitstellung abschließen {#source}

Für Quellcodebereitstellung installierst du eingefrorene Abhängigkeiten des Tags, setzt Anwendungs- und Supabase-Umgebung, führst Bootstrap und Build aus und startest den Produktionsserver hinter deinem Proxy. Setze `MINDDY_PUBLIC_*` vor dem Start. Du benötigst einen dauerhaft laufenden Scheduler mit den authentifizierten Aufrufen des Netzwerkartikels; ein Build allein führt keine Jobs aus. Prüfe Migrationen und Storage, anschließend Auth, Ticketerstellung, Dateibytes und Realtime. Sichere diese Instanz mit dem logischen beziehungsweise Anbieter-Verfahren. Ersetze zur Abnahme einer OCI-Installation diese nicht durch einen Quellcodeserver.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
