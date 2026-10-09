---
{
  "id": "workspace-encryption",
  "locale": "de",
  "title": "Arbeitsbereichsverschlüsselung",
  "summary": "Prüfen Sie die Verschlüsselung Ihrer Version und bewahren Sie die Wiederherstellungsschlüssel für Zugangsdaten und Arbeitsbereichsinhalte auf.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H10"
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
      "scripts/self-hosting-encryption.mjs",
      "lib/server/encryption/data-policy.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "encryption-and-data-boundaries",
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Arbeitsbereich verschlüsseln und Schlüssel erhalten"
  ],
  "figures": [
    {
      "id": "workspace-encryption-flow",
      "kind": "diagram",
      "src": "/documentation/de/workspace-encryption-flow.svg",
      "alt": "Diagramm: Eigener Wurzelschlüssel außerhalb PostgreSQL. Umschlossene Projekt-, Nutzer-, Systemschlüssel. Autorisierte Serverentschlüsselung. Restore: Datenbank + Storage + passende Schlüssel.",
      "caption": "Diese Komponenten haben unterschiedliche Aufgaben. Eigener Wurzelschlüssel außerhalb PostgreSQL. Umschlossene Projekt-, Nutzer-, Systemschlüssel. Autorisierte Serverentschlüsselung. Restore: Datenbank + Storage + passende Schlüssel.",
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
            "title": "Eigener Wurzelschlüssel außerhalb PostgreSQL"
          },
          {
            "title": "Umschlossene Projekt-, Nutzer-, Systemschlüssel"
          },
          {
            "title": "Autorisierte Serverentschlüsselung"
          },
          {
            "title": "Restore: Datenbank + Storage + passende Schlüssel"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "workspace-encryption-flow"
  ]
}
---

## Arbeitsbereich verschlüsseln und Schlüssel erhalten {#workspace-encryption}

Die hier beschriebenen --encryption-Optionen für Installationsprogramm und Bootstrap gehören zu den angegebenen 0.11.1-Kandidatenwerkzeugen. Die veröffentlichten Werkzeuge von v0.11.0 akzeptieren sie nicht. Dessen Anwendungslaufzeit erkennt MINDDY_CONTENT_ENCRYPTION_ENABLED; der Referenz-Compose-Dienst lädt die geschützte Datei über env_file. Nach einer ausdrücklichen Änderung des Schalters müssen Sie daher den Anwendungsdienst mit derselben Umgebung neu erstellen und Schema sowie tatsächliches Verhalten prüfen. Ein erzeugter MINDDY_DATA_ROOT_KEY beweist keine Verschlüsselung der Workspace-Inhalte. Verwenden Sie zusammengehörige, für die gewählte Version ausdrücklich geprüfte Werkzeuge und Konfiguration, bevor Sie Benutzer zulassen oder eine bestehende Instanz ändern.

Neue lokale und Serverinstallationen aktivieren Inhaltsverschlüsselung standardmäßig und erzeugen einen eigenen MINDDY_DATA_ROOT_KEY. Für neue Server können Sie --encryption enabled oder --encryption disabled ausdrücklich setzen. Beide erhalten Zugangsdatenverschlüsselung und erzeugen einen unabhängigen Wurzelschlüssel; die Auswahl betrifft Arbeitsbereichsinhalte. Bereiten Sie beim lokalen Desktop-Pfad die Konfiguration mit dem folgenden Befehl vor Öffnen des Klons vor. Der zufällige 32-Byte-Schlüssel besteht aus genau 64 Hexadezimalzeichen und liegt außerhalb PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Diagramm: Eigener Wurzelschlüssel außerhalb PostgreSQL. Umschlossene Projekt-, Nutzer-, Systemschlüssel. Autorisierte Serverentschlüsselung. Restore: Datenbank + Storage + passende Schlüssel.](/documentation/de/workspace-encryption-flow.svg)

## Bestandsdaten und Wiederholungen behandeln {#existing-data}

Eine vorhandene Konfiguration ohne Flag bleibt bis zur bewussten Änderung deaktiviert. Wiederholungen erhalten Flag und Schlüssel; widersprechende Installer-Auswahl scheitert. Erzeugen Sie zur Reparatur einer aktivierten Instanz niemals einen Ersatzschlüssel, sondern beschaffen Sie das Original. Wenden Sie erforderliches Schema und Prüfungen vor Datenimport an. Begrenzte Wartungsläufe konvertieren Altdaten und rotieren Schlüssel; das Flag allein belegt keine vollständige Konvertierung historischer Inhalte oder Kopien. Abschalten entschlüsselt geschützte Daten nicht und erlaubt keine Klartextschreibzugriffe in aktivierten Bereichen.

## Wiederherstellbarkeit erhalten {#recovery}

Der Server entschlüsselt für autorisierte Benutzer und KI. Es handelt sich um Verschlüsselung im Ruhezustand, nicht um Ende-zu-Ende-Geheimhaltung gegenüber dem Betreiber. Login-E-Mails und Routingmetadaten bleiben lesbar; Exporte und externe Anbieter brauchen eigenen Schutz. Erhalten Sie aktuelle und historische Wurzelschlüssel für aufbewahrte Backups. Verschlüsseln und beschränken Sie Sicherungen mit Daten und Konfiguration. Erproben Sie Datenbank-/Storage-Restore mit passenden Schlüsseln. Wurzelschlüsseländerungen benötigen geschütztes Offline-Neuverpacken bei gestoppten Anwendungen; einfacher Austausch macht Inhalte unlesbar.
