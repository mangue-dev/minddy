---
{
  "id": "install-locally",
  "locale": "de",
  "title": "Lokale Instanzen",
  "summary": "Nutzen Sie einen eigenen Klon zur Erprobung mit Node.js 24, pnpm 10.28.0, Git, Supabase CLI und laufendem Docker-Daemon.",
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
  "revision": 5,
  "sourceRevision": 5,
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
      "docs/self-hosting.md",
      "scripts/self-hosting-local.mjs",
      "content/knowledge/self-hosting.md",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-672 MCP availability and network guidance checked against route, origin, discovery, registration and local launcher source; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-672 de network guidance and terminology review)",
    "date": "2026-10-09"
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
      "revision": 5,
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
      "caption": "Wählen Sie die persönliche Installation, wenn die Desktop-App die lokalen Dienste verwalten soll.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        944,
        614
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

## Eine lokale Instanz aus der Desktop-App starten {#install-locally}

Nutzen Sie einen eigenen Klon zur Erprobung mit Node.js 24, `pnpm` 10.28.0, Git, Supabase CLI und laufendem Docker-Daemon. Planen Sie mindestens 4 GB freien RAM, zwei CPU-Kerne und 10 GB freien SSD-Speicher ein; empfohlen sind 8 GB, vier Kerne und 20 GB. Installieren Sie zuerst die signierte Desktop-App von der Downloadseite. Windows verwendet den Microsoft Store; macOS und Linux haben eigene Downloads. Wählen Sie im Klon die zu erprobende Version, bevor Sie Abhängigkeiten installieren.

```bash
git clone https://github.com/mangue-dev/minddy.git
cd minddy
git checkout v0.11.0
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
```


![Diagramm: Desktop-App wählt den Klon. Loopback-Anwendung: Port 6463. Minimales Supabase und dauerhafte Daten. Beenden stoppt App und Backend.](/documentation/de/install-locally-flow.svg)


![Öffentlicher Installationsassistent mit ausgewähltem Profil für diesen Computer.](/documentation/de/install-locally-wizard.png)

## Lokale Dienste durch die App steuern {#launch}

Öffnen Sie das native Menü minddy. Unter Windows und Linux blendet Alt die Menüleiste ein; macOS verwendet die globale Menüleiste. Öffnen Sie den Serververbindungsdialog, wählen Sie dort die lokale Instanz und den Stammordner des Klons. Die App startet `self-host:local --no-open`, bereitet minimales Supabase vor, führt Migrationen und Storage-Konfiguration aus, erstellt bei Bedarf den Build und wartet auf `/api/health`, bevor sie die Registrierung öffnet. Sie lauscht ausschließlich auf Loopback-Port 6463, merkt sich den Ordner und steuert Start und Beenden beider Dienste.

## MCP-Verfügbarkeit und Netzwerkzugriff {#mcp-network-access}

MCP ist in selbst gehostetem minddy enthalten und startet mit der Anwendung. Es funktioniert sofort unter `/api/mcp` an der mit `MINDDY_PUBLIC_APP_URL` konfigurierten Instanzadresse. OAuth-Erkennung und dynamische Client-Registrierung sind enthalten: Ein separater MCP-Server, eine eigene OAuth-Anwendung oder ein minddy-Cloud-Proxy ist nicht erforderlich. Verbinden Sie Ihren MCP-Client mit dem Endpunkt Ihrer Instanz, melden Sie sich an und erteilen Sie den Zugriff im Browser.

Die Verfügbarkeit des Dienstes garantiert keine Erreichbarkeit im Netzwerk. Sowohl der MCP-Client als auch der Browser für die Autorisierung müssen die bekannt gegebenen MCP- und OAuth-URLs erreichen können. Wenn Sie `OAUTH_ISSUER` ausdrücklich überschreiben, muss auch diese Adresse erreichbar sein. Der Client muss die Verbindung, den OAuth-Ablauf und den gewählten Netzwerkweg unterstützen; manche Clients verlangen auch in privaten Netzwerken HTTPS.

Dieses von der Desktop-App verwaltete Profil bindet nur an die Loopback-Schnittstelle. Ein kompatibler MCP-Client auf demselben Computer kann `http://localhost:6463/api/mcp` verwenden; `localhost` und `127.0.0.1` bezeichnen den Computer, der die Verbindung aufbaut. Ein anderer Computer oder ein gehosteter Cloud-Agent kann dieses Profil nicht direkt erreichen. Nutzen Sie für LAN/VPN-Zugriff eine Serverinstallation mit erreichbarer konfigurierter Adresse, etwa `http://192.168.1.50`, und erlauben Sie den Anwendungsport über Bindungsadresse, Firewall und Routing. Außerhalb dieses Netzwerks benötigt der Client eine erreichbare HTTPS-Adresse wie `https://tickets.example.com` oder einen anderen unterstützten Netzwerkweg. Eine lokale Installation ermöglicht nicht automatisch den Zugriff aus dem Internet.

[Lesen Sie die Hinweise zum MCP-Netzwerkzugriff, bevor Sie einen entfernten Client verbinden](/docs/minddy-mcp#network-access).

## Fehler beheben {#recover}

Wenn Sie ein Fenster schließen, läuft die Desktop-App weiter; verwenden Sie den Befehl zum Beenden der Anwendung, um auch die lokalen Dienste zu stoppen. Kopieren Sie bei Startfehlern den Diagnosebericht im nativen Hilfemenü. Prüfen Sie Docker, CLI, freien Speicher und andere Prozesse auf Port 6463. `pnpm self-host:local` ist eine Diagnosealternative im Terminal. Beenden Sie sie mit Strg+C, bevor die App übernimmt; sie beansprucht keinen fremden Prozess. Beim Beenden der App stoppt normalerweise auch Supabase. `--keep-backend` ändert dies ausdrücklich. Verwenden Sie `supabase db reset --local` niemals zur Wiederherstellung: Es löscht Erprobungsdaten. Prüfen Sie neues Konto, Projekt, Ticket und Anhang, bevor Sie sich auf die Instanz verlassen.
