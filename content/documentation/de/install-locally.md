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
  "revision": 3,
  "sourceRevision": 3,
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
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (collection-caption clarity)",
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
      "revision": 3,
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
      "revision": 3,
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

Nutzen Sie einen eigenen Klon zur Erprobung mit Node.js 24, pnpm 10.28.0, Git, Supabase CLI und laufendem Docker-Daemon. Planen Sie mindestens 4 GB freien RAM, zwei CPU-Kerne und 10 GB freien SSD-Speicher ein; empfohlen sind 8 GB, vier Kerne und 20 GB. Installieren Sie zuerst die signierte Desktop-App von der Downloadseite. Windows verwendet den Microsoft Store; macOS und Linux haben eigene Downloads. Wählen Sie im Klon die zu erprobende Version, bevor Sie Abhängigkeiten installieren.

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

Öffnen Sie das native Menü minddy. Unter Windows und Linux blendet Alt die Menüleiste ein; macOS verwendet die globale Menüleiste. Öffnen Sie den Serververbindungsdialog, wählen Sie dort die lokale Instanz und den Stammordner des Klons. Die App startet self-host:local --no-open, bereitet minimales Supabase vor, führt Migrationen und Storage-Konfiguration aus, erstellt bei Bedarf den Build und wartet auf /api/health, bevor sie die Registrierung öffnet. Sie lauscht ausschließlich auf Loopback-Port 6463, merkt sich den Ordner und steuert Start und Beenden beider Dienste.

## Fehler beheben {#recover}

Wenn Sie ein Fenster schließen, läuft die Desktop-App weiter; verwenden Sie den Befehl zum Beenden der Anwendung, um auch die lokalen Dienste zu stoppen. Kopieren Sie bei Startfehlern den Diagnosebericht im nativen Hilfemenü. Prüfen Sie Docker, CLI, freien Speicher und andere Prozesse auf Port 6463. pnpm self-host:local ist eine Diagnosealternative im Terminal. Beenden Sie sie mit Strg+C, bevor die App übernimmt; sie beansprucht keinen fremden Prozess. Beim Beenden der App stoppt normalerweise auch Supabase. --keep-backend ändert dies ausdrücklich. Verwenden Sie supabase db reset --local niemals zur Wiederherstellung: Es löscht Erprobungsdaten. Prüfen Sie neues Konto, Projekt, Ticket und Anhang, bevor Sie sich auf die Instanz verlassen.
