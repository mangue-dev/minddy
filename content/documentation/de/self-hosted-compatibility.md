---
{
  "id": "self-hosted-compatibility",
  "locale": "de",
  "title": "Unterstützte Version und Installationsprofil auswählen",
  "summary": "Verwenden Sie eine unveränderliche Version aus dem öffentlichen Repository mangue-dev/minddy.",
  "topic": "Instanz betreiben",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01"
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
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/de/self-hosted-compatibility-flow.svg",
      "alt": "Diagramm: Annotierter Quelltag. Dateien und SHA256SUMS. Offizielle OCI-Signatur und Digest. Gewähltes Kompatibilitätsprofil.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Annotierter Quelltag. Dateien und SHA256SUMS. Offizielle OCI-Signatur und Digest. Gewähltes Kompatibilitätsprofil.",
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
    "self-hosted-compatibility-flow"
  ]
}
---

## Unterstützte Version und Installationsprofil auswählen {#self-hosted-compatibility}

Verwenden Sie eine unveränderliche Version aus dem öffentlichen Repository mangue-dev/minddy. Der Kompatibilitätseintrag für v0.11.0 unterstützt Linux-Produktionsserver mit amd64 oder arm64, Node.js 24, pnpm 10.28.0, Docker Engine ab 27.0.0 und das Compose-Plugin ab 2.29.0. Das Profil full bindet die offizielle Supabase-Version self-hosted/v0.7.2 an Commit 549db119c44c25167461812041ba198bde2b31a4. Behalten Sie den vollständigen Imagesatz bei. Ein einzeln aktualisierter Dienst ergibt eine vom Betreiber verantwortete Variante.

Das Profil managed verbindet sich mit einem Supabase-Projekt auf supabase.com. PostgreSQL, Auth, Storage und Realtime müssen verfügbar sein und die Versionsprüfung bestehen. PostgreSQL allein genügt nicht. Der lokale Supabase-CLI-Stack dient Entwicklung und Erprobung, nicht einem öffentlichen Produktionsdienst.


![Diagramm: Annotierter Quelltag. Dateien und SHA256SUMS. Offizielle OCI-Signatur und Digest. Gewähltes Kompatibilitätsprofil.](/documentation/de/self-hosted-compatibility-flow.svg)

## Release vor Ausführung prüfen {#verify-release}

Prüfen Sie vor Installation von Abhängigkeiten oder Ausführung den annotierten Tag, die Release-Dateien, SHA256SUMS und die offizielle OCI-Signatur. Die folgenden Bash-Befehle beginnen im Checkout des gewählten Tags und setzen IMAGE auf den geprüften Digest. Brechen Sie bei jedem fehlgeschlagenen Test ab. Installieren Sie zunächst Cosign nach dessen offizieller Anleitung. Die Prüfung belegt Quellcode- und Imageidentität, nicht die Funktionsfähigkeit der Installation.

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

## Betrieb und Updates planen {#support}

Installieren Sie veröffentlichte Versionen nacheinander. Migrationen gehen nur vorwärts. Ein inkompatibles Zurücksetzen stellt Datenbank, Storage, Konfiguration und Anwendung als zusammengehörigen Satz wieder her. Minddy pflegt Release-Werkzeuge und unterstützt nach Möglichkeit die Diagnose reproduzierbarer Fehler im Kern. DNS, TLS, Kapazität, Backups, Wiederherstellungsübungen und optionale Anbieter betreiben Sie. Veränderliche Imagetags und abgeleitete Supabase-Stacks übernehmen nicht den Supportvertrag der Release.

## Bekannte Runner-Grenzen der veröffentlichten Version {#known-runner-limits}

Der mit v0.11.0 veröffentlichte Runner enthält weitere Hindernisse für die Codeausführung: Er lehnt Sandbox-Namen mit dem Zuweisungssuffix ab, schreibt Base64-Blöcke, die für einen einzelnen Linux-Umgebungswert zu groß sind, und initialisiert einen temporären Speicher mit UID 10001 und Modus 0700 als root, nachdem alle Capabilities entfernt wurden. Dieser letzte Befehl kann unbemerkt fehlschlagen, sodass das Arbeitsverzeichnis fehlt. Ein erreichbarer, gesunder Runner-Endpunkt bestätigt weder das Klonen noch die Codeausführung. Der aktuelle Kandidat korrigiert diese Abläufe. Bei der isolierten Probe wurden der aktuelle Runner und sein Speicherhelper ausdrücklich schreibgeschützt in das v0.11.0-Image eingebunden. Dadurch entstehen weder ein korrigiertes veröffentlichtes Image noch ein neuer unterstützter Kompatibilitätseintrag. Verwenden Sie eine korrigierte Kombination aus Release und Werkzeugen und prüfen Sie den Code-Arbeitsablauf, bevor Sie Code-Agenten für ein Team aktivieren.

Dem Git-Relay in v0.11.0 fehlt außerdem die HTTP-Basic-Authentifizierungsaufforderung; ein gewöhnlicher Git-Client sendet dadurch seine Zugangsdaten nicht. Der [fest gepinnte technische Workaround](/de/dokumentation/install-a-server#runner-workaround) liefert die zusammengehörigen Runner-Dateien mit ihren Prüfsummen. Er ändert weder das veröffentlichte Image noch begründet er eine unterstützte Version.

Das veröffentlichte Anwendungsimage enthält Node.js und Git, entfernt jedoch bewusst npm, npx und Corepack. Das Referenz-Compose-Profil wählt dieses Image auch für Worker über AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Für einen neuen Code-Worker reicht das nicht aus: Der OpenCode-Bootstrap verwendet npm, um seine gepinnte Laufzeit und sein Plugin zu installieren, selbst bei einem Repository ohne Projektabhängigkeiten. Ohne npm endet die Ausführung beim Bootstrap; aus der Unterhaltung lassen sich weder Projektänderungen noch bestandene Tests ableiten. Verwenden Sie ein vom Betreiber erstelltes und geprüftes eigenes Worker-Image mit Node.js 24, npm, Git und den benötigten Projektwerkzeugen, indem Sie AGENT_RUNNER_SANDBOX_IMAGE im Runner-Dienst überschreiben. Behalten Sie die Isolationsvorgaben bei. Prüfen Sie Bootstrap, Klonen, tatsächliche Tests und den entstandenen Diff vor der Code-Delegation. Die Korrektur der Runner-Dateien allein stellt diese Worker-Werkzeuge nicht bereit.

Die gepinnte Speicher-Hilfsdatei macht außerdem den Sandbox-Arbeitsbereich ausführbar. Docker mountet dieses tmpfs andernfalls mit noexec; dadurch startet die native OpenCode-Datei nicht und es kann eine irreführende Fehlermeldung zum musl-Ersatzpaket erscheinen. Die Korrektur behält nosuid, nodev, UID/GID 10001, Modus 0700, das schreibgeschützte Root-Dateisystem, die entfernten Capabilities und den temporären Speicher je Sandbox bei. Sie macht weder Host-Daten ausführbar noch das Anwendungsimage zu einem geeigneten Worker-Image.
