---
{
  "id": "install-locally",
  "locale": "de",
  "title": "Lokale Instanzen",
  "summary": "Installiere eine private lokale Instanz aus der Desktop-App oder öffne einen vorbereiteten Klon, mit Node.js 24.22.1 oder einer neueren 24.x-Version, pnpm 10.28.0, Git, Supabase CLI und laufendem Docker-Daemon.",
  "topic": "Instanz betreiben",
  "type": "tutorial",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.1 (release documentation gate)",
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
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/desktop/local-installer.ts",
      "desktop/src/local-installer.ts",
      "lib/desktop/local-toolchain.ts",
      "desktop/src/local-toolchain.ts",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/main.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx",
      "lib/desktop/local-account.ts",
      "desktop/src/local-account.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.20.1 release documentation gate: Node.js minimum aligned with README and docs/self-hosting.md after MIN-780; release delta v0.20.0..main audited against the manual; no screenshot in scope); agent:claude-code (MIN-781 self-hosting from the desktop app and built-in local installer: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, components/auth/desktop-local-sign-in.tsx, desktop/src/main.ts, desktop/src/local-installer.ts, desktop/src/local-toolchain.ts, desktop/src/local-account.ts and the matching lib/desktop modules; no installation run, no screenshot recaptured)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (de Node.js minimum; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-781 translation on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "workspace-encryption",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Eine lokale Instanz aus der Desktop-App starten"
  ],
  "figures": [
    {
      "id": "install-locally-flow",
      "kind": "diagram",
      "src": "/documentation/de/install-locally-flow.svg",
      "alt": "Diagramm: Desktop-App wählt den Klon. Loopback-Anwendung: Port 6463. Minimales Supabase und dauerhafte Daten. Beenden stoppt App und Backend.",
      "caption": "Die Desktop-App steuert die lokalen Dienste des gewählten Klons, während ihre Daten dauerhaft gespeichert bleiben.",
      "revision": 10,
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
            "title": "Desktop-App wählt den Klon"
          },
          {
            "title": "Loopback-Anwendung: Port 6463"
          },
          {
            "title": "Minimales Supabase und dauerhafte Daten"
          },
          {
            "title": "Beenden stoppt App und Backend"
          }
        ]
      }
    },
    {
      "id": "install-locally-wizard",
      "kind": "screenshot",
      "src": "/documentation/de/install-locally-wizard.png",
      "alt": "Öffentlicher Installationsassistent mit ausgewähltem Profil für diesen Computer.",
      "caption": "Wähle die persönliche Installation, wenn die Desktop-App die lokalen Dienste verwalten soll.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        944,
        802
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "install-locally-flow"
  ]
}
---

## minddy auf diesem Computer installieren {#install-locally}

Eine lokale Instanz betreibt minddy mit einem minimalen Supabase in Docker auf einem einzigen Computer, zur Erprobung oder für die persönliche Nutzung. Ihre Daten bleiben auf diesem Computer, und die Desktop-App startet und beendet ihre Dienste. Sie verwendet Git, Node.js 24.22.1 oder eine neuere 24.x-Version, `pnpm` 10.28.0, Supabase CLI und einen laufenden Docker-Daemon. Die Desktop-App installiert, was davon fehlt; ein selbst vorbereiteter Klon braucht diese Werkzeuge vorab. Plane mindestens 4 GB freien RAM, zwei CPU-Kerne und 10 GB freien SSD-Speicher ein; empfohlen sind 8 GB, vier Kerne und 20 GB. Installiere zuerst die signierte Desktop-App von der Downloadseite. Windows verwendet den Microsoft Store; macOS und Linux haben eigene Downloads.

Die Desktop-App enthält ein Installationsprogramm, das den gesamten Ablauf für dich ausführt:

1. Öffne die Desktop-App. Sie startet mit minddy Cloud: Beim ersten Start öffnet sich dessen Registrierungsseite. Klicke unten auf der Anmelde- oder Registrierungsseite auf **minddy selbst hosten**. Bist du angemeldet, öffnest du denselben Bildschirm mit **Connect to a Server…** im nativen Menü minddy (das native Menü ist englisch; unter Windows und Linux blendet Alt die Menüleiste ein) oder über **Kontoeinstellungen** → **Einstellungen** → **Desktop-App** → **Verbundener Server** → **Ändern…**.
2. Wähle in **minddy selbst hosten** die Option **Auf diesem Computer installieren**.
3. Unter **Voraussetzungen** prüft die App Git, Node.js 24, pnpm, Supabase CLI und Docker. Ein fehlendes Werkzeug zeigt **Nicht gefunden; wird installiert**, ein älteres Node.js **Version … gefunden; Node.js 24 wird für minddy installiert**. Ein installiertes, aber gestopptes Docker zeigt **Installiert, aber nicht gestartet; wird gestartet**. Du musst vorher nichts installieren: **Installieren** übernimmt das. **Erneut prüfen** wiederholt die Prüfung.
4. Prüfe den **Installationsordner**. Standardmäßig ist es ein Ordner `minddy` in deinem Benutzerordner; mit **Auswählen…** wählst du einen anderen. Enthält der gewählte Ordner bereits andere Dateien, installiert die App in einen Ordner `minddy` darin.
5. Klicke auf **Installieren**. Die App fragt nach keiner E-Mail: Ein Hinweis erklärt, dass minddy dein Konto auf diesem Computer erstellt und dich selbst anmeldet.
6. Lass das Fenster geöffnet, während die Schritte laufen. Fehlende Werkzeuge kommen zuerst, jedes als eigener Schritt: **Git installieren**, **Node.js 24 installieren**, **pnpm installieren**, **Supabase CLI installieren**, dann **Docker installieren** oder **Docker starten**. Der Schritt **minddy … herunterladen** (mit der Versionsnummer) erstellt einen flachen `git clone` derselben Version, die auch die öffentliche Installationsanleitung verwendet. **Abhängigkeiten installieren** führt `pnpm install --frozen-lockfile` aus, **Instanz konfigurieren** macht dein lokales Konto zum Administrator der Instanz, **Supabase vorbereiten und die App bauen** führt `pnpm self-host:local -- --no-open --prepare-only` aus, **minddy starten** startet die lokale Laufzeit, und **Dein lokales Konto erstellen** legt dein Konto auf der Instanz an. Die erste Installation kann einige Minuten dauern, während Docker die Supabase-Images lädt und die App gebaut wird.
7. Sobald minddy läuft, öffnet die App es, und du bist bereits mit deinem lokalen Konto angemeldet.

Das lokale Konto ist ein gewöhnliches Konto, benannt nach deinem Benutzerkonto auf dem Computer, mit der Adresse `owner@local.minddy.app`. Es verwaltet die Instanz, und Einstellungen sowie Projekteigentum funktionieren wie gewohnt. Die App erzeugt sein Passwort und bewahrt es verschlüsselt im Schlüsselbund des Systems auf: Du gibst es nie ein, und die Seite erhält nur eine Sitzung. Immer wenn das Fenster diese Instanz zeigt, meldet die App das Konto selbst an, hinter einem kurzen Bildschirm **Dein minddy wird geöffnet…**. Installierst du erneut in einen Ordner, dessen Supabase-Daten erhalten geblieben sind, findet die App dasselbe Konto wieder und gibt ihm ein neues Passwort; deine Daten bleiben erhalten. Das gilt nur für eine Instanz, die die App installiert hat: Ein Ordner, den du mit **Bestehende Installation verwenden** › **Auf diesem Computer** öffnest, behält seine eigenen Konten und die gewohnte Anmeldung, und entfernte Server verwenden immer die gewohnte Anmeldung.

Node.js, pnpm und Supabase CLI werden ohne Administratorrechte in einen Ordner `toolchain` im Benutzerdatenordner der App installiert. Node.js stammt aus dem offiziellen Archiv von nodejs.org und wird gegen die veröffentlichten SHA-256-Prüfsummen geprüft; pnpm 10.28.0 und Supabase CLI 2.115.0 werden mit npm installiert. Dieses Node.js ersetzt kein bereits vorhandenes: Die App stellt es nur für ihr Installationsprogramm und ihre lokale Laufzeit an den Anfang von `PATH`.

Git und Docker laufen über die Bestätigung deines Systems. Unter macOS bestätigst du die Befehlszeilen-Entwicklerwerkzeuge im Dialog von Apple, um Git zu erhalten. Unter Windows legt die App das portable MinGit aus Git for Windows nach Prüfung seines Digests im selben App-Ordner ab. Unter macOS und Windows lädt die App Docker Desktop herunter, prüft die Signatur von Docker Inc, installiert es und öffnet es. macOS fragt eventuell nach einem Administratorpasswort; Windows fragt über die Benutzerkontensteuerung und zeigt das Installationsprogramm von Docker. Akzeptiere danach die Lizenz und die Berechtigungsabfragen von Docker Desktop. Unter Linux installiert eine einzige Passwortabfrage des Systems Git mit dem Paketmanager deiner Distribution und Docker Engine mit dem offiziellen Skript `get.docker.com` von Docker, startet den Docker-Dienst und fügt dich der Gruppe `docker` hinzu. Melde dich ab und wieder an, damit dein Konto Docker nutzen kann, und klicke dann auf **Erneut versuchen**.

Danach merkt sich die App den Ordner und steuert Start und Beenden der lokalen Dienste, wie unter [Einen vorbereiteten Klon verwenden](#launch) beschrieben. Wie bei einer manuellen Installation verschlüsselt die neue Instanz Inhalte des Arbeitsbereichs standardmäßig. Siehe [Arbeitsbereichsverschlüsselung](/de/dokumentation/workspace-encryption#workspace-encryption).

![Diagramm: Desktop-App wählt den Klon. Loopback-Anwendung: Port 6463. Minimales Supabase und dauerhafte Daten. Beenden stoppt App und Backend.](/documentation/de/install-locally-flow.svg)

## Einen vorbereiteten Klon verwenden {#launch}

Bereite den Klon selbst vor, wenn du die Version wählen oder den Checkout vor dem Start prüfen möchtest. Nutze einen eigenen Klon und wähle darin die zu erprobende Version, bevor du Abhängigkeiten installierst.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.20.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```

Neue lokale Installationen verschlüsseln Inhalte des Arbeitsbereichs standardmäßig. Um eine ausdrückliche Wahl festzuhalten, führe im Klon `pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled` (oder `--encryption disabled`) aus, bevor du ihn in der App öffnest; spätere Starts behalten die gespeicherte Wahl bei.

Öffne den Schritt **minddy selbst hosten** wie im ersten Schritt oben, wähle **Bestehende Installation verwenden**, dann **Auf diesem Computer**, und wähle den Stammordner des Klons. Die App startet `self-host:local --no-open`, bereitet minimales Supabase vor, führt Migrationen und Storage-Konfiguration aus, erstellt bei Bedarf den Build und wartet auf `/api/health`, bevor sie die Registrierung öffnet. Sie lauscht ausschließlich auf Loopback-Port 6463, merkt sich den Ordner und steuert Start und Beenden beider Dienste. Die öffentliche Installationsanleitung beschreibt dieselbe persönliche Installation.

![Öffentlicher Installationsassistent mit ausgewähltem Profil für diesen Computer.](/documentation/de/install-locally-wizard.png)

## MCP-Verfügbarkeit und Netzwerkzugriff {#mcp-network-access}

MCP ist in selbst gehostetem minddy enthalten und startet mit der Anwendung. Es funktioniert sofort unter `/api/mcp` an der mit `MINDDY_PUBLIC_APP_URL` konfigurierten Instanzadresse. OAuth-Erkennung und dynamische Client-Registrierung sind enthalten: Ein separater MCP-Server, eine eigene OAuth-Anwendung oder ein minddy-Cloud-Proxy ist nicht erforderlich. Verbinde deinen MCP-Client mit dem Endpunkt deiner Instanz, melde dich an und erteile den Zugriff im Browser.

Die Verfügbarkeit des Dienstes garantiert keine Erreichbarkeit im Netzwerk. Sowohl der MCP-Client als auch der Browser für die Autorisierung müssen die bekannt gegebenen MCP- und OAuth-URLs erreichen können. Wenn du `OAUTH_ISSUER` ausdrücklich überschreibst, muss auch diese Adresse erreichbar sein. Der Client muss die Verbindung, den OAuth-Ablauf und den gewählten Netzwerkweg unterstützen; manche Clients verlangen auch in privaten Netzwerken HTTPS.

Dieses von der Desktop-App verwaltete Profil bindet nur an die Loopback-Schnittstelle. Ein kompatibler MCP-Client auf demselben Computer kann `http://localhost:6463/api/mcp` verwenden; `localhost` und `127.0.0.1` bezeichnen den Computer, der die Verbindung aufbaut. Ein anderer Computer oder ein gehosteter Cloud-Agent kann dieses Profil nicht direkt erreichen. Nutze für LAN/VPN-Zugriff eine Serverinstallation mit erreichbarer konfigurierter Adresse, etwa `http://192.168.1.50`, und erlaube den Anwendungsport über Bindungsadresse, Firewall und Routing. Außerhalb dieses Netzwerks benötigt der Client eine erreichbare HTTPS-Adresse wie `https://tickets.example.com` oder einen anderen unterstützten Netzwerkweg. Eine lokale Installation ermöglicht nicht automatisch den Zugriff aus dem Internet.

[Lies die Hinweise zum MCP-Netzwerkzugriff, bevor du einen entfernten Client verbindest](/docs/minddy-mcp#network-access).

## Fehler beheben {#recover}

Der Bildschirm zur Serverwahl ist in die Desktop-App eingebaut: Er öffnet sich ohne Internetverbindung, sodass du eine lokale Instanz auch offline wählen oder wechseln kannst.

Schlägt ein Installationsschritt fehl, markiert der Installationsbildschirm ihn und zeigt die letzte Zeile, die sein Befehl ausgegeben hat. Ein fehlgeschlagener Werkzeugschritt bietet außerdem **Manuell installieren** an, das die Downloadseite des Werkzeugs öffnet. Behebe die Ursache, akzeptiere etwa die Abfragen von Docker Desktop, installiere das Werkzeug selbst oder schaffe freien Speicherplatz, und klicke dann auf **Erneut versuchen**. Die Installation wird im selben Ordner fortgesetzt; bereits installierte Werkzeuge und eine bereits heruntergeladene Version werden nicht erneut geladen. **Zurück** führt zum Feld für den Ordner. **Abbrechen** unter den Schritten stoppt eine laufende Installation, ebenso das Verlassen dieses Bildschirms; das Schließen des Fensters blendet es nur aus. Um die vollständige Ausgabe des Vorbereitungsschritts zu lesen, führe `pnpm self-host:local -- --no-open --prepare-only` im Installationsordner aus: Der Befehl bereitet Supabase vor, baut die App und endet dann, während Supabase weiterläuft.

Wenn du ein Fenster schließt, läuft die Desktop-App weiter; verwende den Befehl zum Beenden der Anwendung, um auch die lokalen Dienste zu stoppen. Prüfe Docker, CLI, freien Speicher und andere Prozesse auf Port 6463. `pnpm self-host:local` ist eine Diagnosealternative im Terminal. Beende sie mit Strg+C, bevor die App übernimmt; sie beansprucht keinen fremden Prozess. Beim Beenden der App stoppt normalerweise auch Supabase. `--keep-backend` ändert dies ausdrücklich. Verwende `supabase db reset --local` niemals zur Wiederherstellung: Es löscht Erprobungsdaten. Prüfe neues Konto, Projekt, Ticket und Anhang, bevor du dich auf die Instanz verlässt.
