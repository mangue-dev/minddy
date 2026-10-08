---
{
  "id": "install-a-server",
  "locale": "de",
  "title": "Das Referenzprofil auf einem Server installieren",
  "summary": "Beginnen Sie mit einem geprüften Tag und dessen unveränderlichem Imagedigest.",
  "topic": "Instanz betreiben",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H03"
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
      "docs/self-hosting.md",
      "scripts/self-hosting-install.mjs",
      "deploy/self-hosted/compose.full.yml",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review); agent:/root/review_documentation_locales (independent final lifecycle/Storage delta review; prior complete review retained)",
    "date": "2026-10-08"
  },
  "related": [
    "self-hosted-compatibility",
    "authentication-and-email",
    "back-up-the-reference-instance"
  ],
  "aliases": [
    "self-hosting"
  ],
  "tags": [],
  "figures": [
    {
      "id": "install-a-server-flow",
      "kind": "diagram",
      "src": "/documentation/de/install-a-server-flow.svg",
      "alt": "Diagramm: Geprüfte Release und geschützte Umgebung. Installer: full-Referenzprofil. Offizielles Supabase, App, Scheduler, Runner. Konto-, Datei- und Wiederherstellungsprüfung.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Geprüfte Release und geschützte Umgebung. Installer: full-Referenzprofil. Offizielles Supabase, App, Scheduler, Runner. Konto-, Datei- und Wiederherstellungsprüfung.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "install-a-server-wizard",
      "kind": "screenshot",
      "src": "/documentation/de/install-a-server-wizard.png",
      "alt": "Öffentlicher Installationsassistent mit ausgewähltem Supabase auf demselben Server.",
      "caption": "Das Profil full betreibt Anwendung und Supabase auf Ihrem Server. In diesem Beispiel bleibt der private Netzwerkzugang auf das LAN beschränkt.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-a-server-flow"
  ]
}
---

## Das Referenzprofil auf einem Server installieren {#install-a-server}

Beginnen Sie mit einem geprüften Tag und dessen unveränderlichem Imagedigest. Unterstützt sind Linux amd64 und arm64. Managed Supabase benötigt mindestens 4 GB RAM, zwei Kerne und 20 GB SSD; auf demselben Host betriebenes Supabase benötigt 8 GB, vier Kerne und 60 GB. Öffentliches Hosting verlangt DNS und HTTPS auf eigenen Origins. HTTP ist nur für localhost oder private IPv4 erlaubt. Beschränken Sie es auf ein vertrauenswürdiges LAN ohne Router-Portweiterleitungen. In diesem Modus stellt full die Anwendung auf Port 80 und die API auf 8000 bereit.


![Diagramm: Geprüfte Release und geschützte Umgebung. Installer: full-Referenzprofil. Offizielles Supabase, App, Scheduler, Runner. Konto-, Datei- und Wiederherstellungsprüfung.](/documentation/de/install-a-server-flow.svg)


![Öffentlicher Installationsassistent mit ausgewähltem Supabase auf demselben Server.](/documentation/de/install-a-server-wizard.png)

## Installer konfigurieren und starten {#install}

Führen Sie pnpm self-host:install im Release-Verzeichnis aus. Wählen Sie managed oder full, Anwendungsorigin und Administratoradresse. Holen Sie für full zuerst den festgelegten Upstream-Checkout. Der Installer erzeugt eine Umgebung mit Modus 0600 und getrennte fehlende Geheimnisse, lädt Images, startet das Profil und führt den idempotenten Bootstrap aus. Bestehende Geheimnisse und Imagebindung bleiben erhalten. Das Beispiel nutzt IMAGE aus der Kompatibilitätsprüfung. Ergänzen Sie für echte Auth-E-Mails zunächst --skip-start, konfigurieren Sie SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL und SMTP_SENDER_NAME in der geschützten Datei und wiederholen Sie dann den Aufruf. Behalten Sie ENABLE_EMAIL_AUTOCONFIRM=false. supabase-mail ist ein Platzhalter, kein Produktionspostfach.


Vergleichen Sie vor dem Start MINDDY_RELEASE und MINDDY_IMAGE in der geschützten Datei mit der gewählten Kompatibilitätszeile und dem geprüften Container-Asset. Die Vorlage von v0.11.0 nennt noch 0.10.30. --image ändert nur die Image-Referenz; eine Option --release gibt es nicht. Setzen Sie bei einer neuen, mit --skip-start vorbereiteten Installation von v0.11.0 ausdrücklich MINDDY_RELEASE=0.11.0 und behalten Sie die geprüfte unveränderliche Image-Referenz. Ersetzen Sie weder erzeugte Zugangsdaten noch Verschlüsselungsschlüssel. Aus der Paketversion des Kandidaten folgt kein unterstütztes Profil für 0.11.1: Dieser Quellstand enthält keine entsprechende Kompatibilitätszeile.

```bash
node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase
pnpm self-host:install -- --non-interactive --mode full \
  --app-url http://192.168.1.50 --admin-email ops@example.com \
  --supabase-dir /srv/minddy/supabase --image "$IMAGE" --skip-start
```


Der obige Befehl erstellt deploy/self-hosted/.env im Verzeichnis der gewählten Release. Bearbeiten Sie diese geschützte Datei vor dem Start. Beenden Sie für die hier beschriebene technische Variante von v0.11.0 das automatische Installationsprogramm nach dieser Konfiguration: Folgen Sie dem [gepinnten Runner- und Worker-Verfahren](#runner-workaround) und anschließend dem [ausdrücklichen Start des Full-Profils](#adapted-start). Rufen Sie das historische Installationsprogramm nicht erneut ohne --skip-start auf: Es lässt das erforderliche Overlay aus und kann diese Variante nicht abschließen. Vorhandene Ursprungsadressen, Images und Geheimnisse verbleiben in der geschützten Datei.


## Vor Aufnahme von Benutzern prüfen {#accept}

Die Referenzprofile enthalten Scheduler und vertrauenswürdigen Sandbox-Runner. Veröffentlichen Sie weder Port 6464 noch PostgreSQL im Internet. Führen Sie doctor mit installierter Umgebung und Upstream-Compose-Datei für full aus. Testen Sie Bestätigung, Anmeldung, MFA, Passwortwiederherstellung, Projekt- und Ticketerstellung, Anhänge und Realtime in zwei Sitzungen. HTTP 200 von /api/health belegt nur Anwendungsaktivität. Nach einer Unterbrechung setzen Sie die ausdrücklich angepasste Sequenz mit demselben Compose-Kontext und der geschützten Umgebungsdatei fort; setzen Sie keine Daten zurück. Bereiten Sie vor Teameinführung ein externes Backup und Wiederherstellung auf ein leeres Ziel vor.

## Bekannte Runner-Grenzen der veröffentlichten Version {#known-runner-limits}

Der mit v0.11.0 veröffentlichte Runner enthält weitere Hindernisse für die Codeausführung: Er lehnt Sandbox-Namen mit dem Zuweisungssuffix ab, schreibt Base64-Blöcke, die für einen einzelnen Linux-Umgebungswert zu groß sind, und initialisiert einen temporären Speicher mit UID 10001 und Modus 0700 als root, nachdem alle Capabilities entfernt wurden. Dieser letzte Befehl kann unbemerkt fehlschlagen, sodass das Arbeitsverzeichnis fehlt. Ein erreichbarer, gesunder Runner-Endpunkt bestätigt weder das Klonen noch die Codeausführung. Der aktuelle Kandidat korrigiert diese Abläufe. Bei der isolierten Probe wurden der aktuelle Runner und sein Speicherhelper ausdrücklich schreibgeschützt in das v0.11.0-Image eingebunden. Dadurch entstehen weder ein korrigiertes veröffentlichtes Image noch ein neuer unterstützter Kompatibilitätseintrag. Verwenden Sie eine korrigierte Kombination aus Release und Werkzeugen und prüfen Sie den Code-Arbeitsablauf, bevor Sie Code-Agenten für ein Team aktivieren.

## Den fest gepinnten technischen Workaround anwenden {#runner-workaround}

Für das veröffentlichte Image v0.11.0 liefert diese ausdrücklich gewählte Werkzeugvariante auch die von Git-HTTP-Clients benötigte Basic-Authentifizierungsaufforderung. Sie ist auf den Quellcommit 89ab340cb10ec729948fc6e596fb7ab0326fc470 gepinnt und stellt weder ein neu veröffentlichtes Image noch einen neuen Kompatibilitätseintrag dar. Bereiten Sie zunächst die Basiskonfiguration vor; wenden Sie diese Variante vor dem Start des Full-Stacks an. Beide Dateien müssen mit den geprüften Prüfsummen zusammen auf dauerhaftem Speicher verbleiben. Diese Befehle veröffentlichen keinen Runner-Port.

Legen Sie zunächst den installierten Kontext in [der Sicherungsanleitung für das Referenzprofil](/de/dokumentation/back-up-the-reference-instance#context) fest. Deren Compose-Funktion muss RUNNER_FIX_OVERRIDE berücksichtigen. Laden Sie anschließend die beiden öffentlichen Dateien herunter und prüfen Sie sie. Bei einer abweichenden Prüfsumme müssen Sie abbrechen.

Dieses Verfahren erstellt außerdem ein separates Image für Code-Worker. Das Basisimage ist gepinnt, Debian-Pakete werden jedoch beim Build aufgelöst. Ermitteln Sie daher die entstandene Docker-Image-ID und bewahren Sie genau dieses Image mit der Sicherung auf. Ersetzen Sie es nach einer Wiederherstellung niemals durch das Anwendungsimage. Der Build benötigt Zugriff auf die Basisimage-Registry und Debian-Paketquellen; ein neuer OpenCode-Bootstrap benötigt außerdem die npm-Registry. Das Rezept liefert die Bootstrap-Werkzeuge, nicht sämtliche Projektabhängigkeiten. Weitere Build-Werkzeuge erfordern eine ausdrücklich gepflegte Variante. Das folgende Compose-Overlay setzt die Image-Umgebungsvariable des Runner-Dienstes direkt, weil die historische Referenz-Compose-Datei einen alleinstehenden AGENT_RUNNER_SANDBOX_IMAGE-Wert in der geschützten Datei ignoriert.

```bash
set -euo pipefail
RUNNER_FIX_COMMIT=89ab340cb10ec729948fc6e596fb7ab0326fc470
export RUNNER_FIX_DIR="/srv/minddy/runner-fix-$RUNNER_FIX_COMMIT"
export RUNNER_FIX_OVERRIDE="$RUNNER_FIX_DIR/compose.runner-fix.yml"
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$RUNNER_FIX_DIR"
for file in agent-runner.mjs agent-runner-storage.mjs; do
  curl --fail --show-error --location \
    "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/$file" \
    -o "$RUNNER_FIX_DIR/$file"
done
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' \
    '31631296f9559a0367237bc02fc6387f300eee39bb14681a973d83988ccb7b17  agent-runner.mjs' \
    '501e6c92605ca2b4ec32d13599dfd645f285b08c5092860686b5838691f09b5b  agent-runner-storage.mjs' > SHA256SUMS
  sha256sum --check SHA256SUMS
)
cat > "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" <<'DOCKERFILE'
# syntax=docker/dockerfile:1.7

# Code workers bootstrap the pinned OpenCode runtime with npm. The application
# image deliberately omits package managers and cannot serve as this image.
FROM node:24-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

ENV HOME=/vercel/home
ENV npm_config_cache=/vercel/npm-cache
USER minddy
WORKDIR /

CMD ["node", "-e", "setInterval(() => {}, 2147483647)"]
DOCKERFILE
docker build --pull -t minddy-agent-sandbox:operator \
  -f "$RUNNER_FIX_DIR/Dockerfile.agent-sandbox" "$RUNNER_FIX_DIR"
export RUNNER_SANDBOX_IMAGE="$(docker image inspect minddy-agent-sandbox:operator --format '{{.Id}}')"
printf '%s\n' "$RUNNER_SANDBOX_IMAGE" > "$RUNNER_FIX_DIR/sandbox-image.txt"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --entrypoint sh "$RUNNER_SANDBOX_IMAGE" \
  -c 'node --version && npm --version && git --version && id -u'
cat > "$RUNNER_FIX_OVERRIDE" <<EOF
services:
  agent-runner:
    environment:
      AGENT_RUNNER_SANDBOX_IMAGE: "$RUNNER_SANDBOX_IMAGE"
    volumes:
      - "$RUNNER_FIX_DIR/agent-runner.mjs:/app/agent-runner.mjs:ro"
      - "$RUNNER_FIX_DIR/agent-runner-storage.mjs:/app/agent-runner-storage.mjs:ro"
EOF
compose up -d --no-deps --force-recreate agent-runner
compose exec -T agent-runner node --input-type=module -e \
  'const r=await fetch("http://127.0.0.1:6464/health"); if(!r.ok) process.exit(1); console.log(r.status);'
```

Der Befehl compose up erstellt ausschließlich den Runner neu. Seine Zustandsantwort reicht weiterhin nicht als Abnahme: Prüfen Sie eine neue Sandbox, das Klonen des Repositorys, eine Datei über 1 MiB, die Tests und den entstandenen Diff, bevor Sie Code-Agenten zulassen. Behalten Sie RUNNER_FIX_OVERRIDE und RUNNER_FIX_DIR in jeder Betriebsshell bei. Das historische Installationsprogramm und das Update-Werkzeug berücksichtigen dieses Shell-Override nicht; wenn eines davon den Runner ändert oder neu erstellt, wenden Sie diesen Compose-Befehl erneut an. Nehmen Sie beide Dateien und das Override in die verschlüsselte Sicherung auf und stellen Sie die absoluten Pfade vor einem Runner-Neustart wieder her.

Das veröffentlichte Anwendungsimage enthält Node.js und Git, entfernt jedoch bewusst npm, npx und Corepack. Das Referenz-Compose-Profil wählt dieses Image auch für Worker über AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Für einen neuen Code-Worker reicht das nicht aus: Der OpenCode-Bootstrap verwendet npm, um seine gepinnte Laufzeit und sein Plugin zu installieren, selbst bei einem Repository ohne Projektabhängigkeiten. Ohne npm endet die Ausführung beim Bootstrap; aus der Unterhaltung lassen sich weder Projektänderungen noch bestandene Tests ableiten. Verwenden Sie ein vom Betreiber erstelltes und geprüftes eigenes Worker-Image mit Node.js 24, npm, Git und den benötigten Projektwerkzeugen, indem Sie AGENT_RUNNER_SANDBOX_IMAGE im Runner-Dienst überschreiben. Behalten Sie die Isolationsvorgaben bei. Prüfen Sie Bootstrap, Klonen, tatsächliche Tests und den entstandenen Diff vor der Code-Delegation. Die Korrektur der Runner-Dateien allein stellt diese Worker-Werkzeuge nicht bereit.

## Das ausdrücklich angepasste Full-Profil starten {#adapted-start}

Das unveränderte Installationsprogramm von v0.11.0 kann diese technische Variante nicht abschließen: Seinem Image fehlt die Hilfsdatei, der Funktions-Pin weicht von der eingefrorenen Abhängigkeit ab und es akzeptiert das obige Runner-Overlay nicht. Bereiten Sie für diese Variante die Konfiguration mit --skip-start vor und wenden Sie die gepinnten Werkzeuge vor dem ersten Start an. Verwenden Sie die folgende Full-Sequenz, statt das historische Installationsprogramm ohne --skip-start erneut aufzurufen. Der Austausch des Pins ist eine ausdrückliche Änderung der Deployment-Werkzeuge und keine Änderung am veröffentlichten Tag. Bewahren Sie den ursprünglichen Pin bei den Release-Nachweisen auf.

Wenn Sie dieses vollständige Profil unter macOS mit Docker Desktop betreiben, wenden Sie vor dem ersten Start den [Volume-Override für Dateisystem-Storage](/de/dokumentation/storage-and-attachments#docker-desktop) an und behalten Sie RESTORE_OVERRIDE neben dem Runner-Override bei. Der Bind-Mount auf einem Linux-Host und dieses Profil mit benanntem Volume benötigen unterschiedliche Byte-Archive; verwenden Sie das passende Sicherungs- und Wiederherstellungsverfahren.

```bash
cd "$CURRENT_RELEASE_DIR"
pnpm install --frozen-lockfile
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/mangue-dev/minddy/$RUNNER_FIX_COMMIT/deploy/self-hosted/functions-bundle.json" \
  -o "$RUNNER_FIX_DIR/functions-bundle.json"
(
  cd "$RUNNER_FIX_DIR"
  printf '%s\n' '7fae1ec49c6a75fcd34d3fae7513e140eead1c2146753f2a4200f30eeb2bf202  functions-bundle.json' | sha256sum --check
)
if [ ! -e "$RUNNER_FIX_DIR/functions-bundle.tagged.json" ]; then
  install -m 0644 deploy/self-hosted/functions-bundle.json "$RUNNER_FIX_DIR/functions-bundle.tagged.json"
fi
install -m 0644 "$RUNNER_FIX_DIR/functions-bundle.json" deploy/self-hosted/functions-bundle.json
compose pull --quiet
node --input-type=module -e \
  'const m=await import("./scripts/prepare-self-hosted-functions.mjs"); m.prepareFunctionsBundle({supabaseDir:process.env.SUPABASE_DIR,envFile:process.env.MINDDY_ENV_FILE});'
compose up -d --pull never --wait --wait-timeout 120
node --input-type=module <<'NODE'
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseEnvironment, fullBootstrapDatabaseUrl, fullMaintenanceApiUrl } from "./scripts/self-hosting-install.mjs";
const envFile = process.env.MINDDY_ENV_FILE;
const values = parseEnvironment(readFileSync(envFile, "utf8"));
const result = spawnSync(process.execPath, ["scripts/bootstrap-supabase.mjs",
  "--db-url", fullBootstrapDatabaseUrl(values), "--env-file", envFile,
  "--existing-env", "--enable", "scheduler", "--supabase-url", fullMaintenanceApiUrl(values)], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env,
    MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
    MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY },
});
writeFileSync(`${envFile}.bootstrap.log`, `${result.stdout ?? ""}${result.stderr ?? ""}`, { mode: 0o600 });
chmodSync(`${envFile}.bootstrap.log`, 0o600);
if (result.error || result.status !== 0) {
  console.error("Bootstrap failed; inspect the protected diagnostic log locally.");
  process.exit(1);
}
console.log("Bootstrap completed.");
NODE
pnpm self-host:doctor -- --mode full --env-file "$MINDDY_ENV_FILE" \
  --supabase-compose "$SUPABASE_DIR/docker/docker-compose.yml" --json
```

Der Wrapper liest die geschützte Datei als Daten, ermittelt die privaten Wartungs-URLs mit denselben exportierten Hilfsfunktionen wie das Installationsprogramm und startet den ursprünglichen Bootstrap mit den Scheduler-Voraussetzungen. Sein Diagnoseprotokoll bleibt im Modus 0600. Prüfen und bereinigen Sie es, bevor Sie es einem öffentlichen Bericht beifügen. Jede gescheiterte Phase muss das Verfahren abbrechen. Der Doctor muss denselben angepassten Kontext verwenden; er prüft Dienste, nicht die Code-Worker-Abnahme oder die Zustellung durch externe Anbieter.

Die gepinnte Speicher-Hilfsdatei macht außerdem den Sandbox-Arbeitsbereich ausführbar. Docker mountet dieses tmpfs andernfalls mit noexec; dadurch startet die native OpenCode-Datei nicht und es kann eine irreführende Fehlermeldung zum musl-Ersatzpaket erscheinen. Die Korrektur behält nosuid, nodev, UID/GID 10001, Modus 0700, das schreibgeschützte Root-Dateisystem, die entfernten Capabilities und den temporären Speicher je Sandbox bei. Sie macht weder Host-Daten ausführbar noch das Anwendungsimage zu einem geeigneten Worker-Image.
