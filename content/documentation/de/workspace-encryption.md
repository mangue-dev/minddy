---
{
  "id": "workspace-encryption",
  "locale": "de",
  "title": "Arbeitsbereichsverschlüsselung",
  "summary": "Prüfe die Verschlüsselung deiner Version und bewahre die Wiederherstellungsschlüssel für Zugangsdaten und Arbeitsbereichsinhalte auf.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "caption": "Bewahre die zu den gesicherten Daten passenden Schlüssel auf, damit die wiederhergestellte Instanz ihre Inhalte entschlüsseln kann.",
      "revision": 7,
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

Die hier beschriebenen `--encryption`-Optionen für Installationsprogramm und Bootstrap werden mit den Werkzeugen dieser Version ausgeliefert. Installationsprogramm und Bootstrap von v0.11.0 akzeptieren sie nicht. Dessen Anwendungslaufzeit erkennt `MINDDY_CONTENT_ENCRYPTION_ENABLED`; der Referenz-Compose-Dienst lädt die geschützte Datei über `env_file`. Nach einer ausdrücklichen Änderung des Schalters musst du daher den Anwendungsdienst mit derselben Umgebung neu erstellen und Schema sowie tatsächliches Verhalten prüfen. Ein erzeugter `MINDDY_DATA_ROOT_KEY` beweist keine Verschlüsselung der Workspace-Inhalte. Verwende zusammengehörige, für die gewählte Version ausdrücklich geprüfte Werkzeuge und Konfiguration, bevor du Benutzer zulässt oder eine bestehende Instanz änderst.

Neue lokale und Serverinstallationen aktivieren Inhaltsverschlüsselung standardmäßig und erzeugen einen eigenen `MINDDY_DATA_ROOT_KEY`. Für neue Server kannst du `--encryption enabled` oder `--encryption disabled` ausdrücklich setzen. Beide erhalten Zugangsdatenverschlüsselung und erzeugen einen unabhängigen Wurzelschlüssel; die Auswahl betrifft Arbeitsbereichsinhalte. Bereite beim lokalen Desktop-Pfad die Konfiguration mit dem folgenden Befehl vor Öffnen des Klons vor. Der zufällige 32-Byte-Schlüssel besteht aus genau 64 Hexadezimalzeichen und liegt außerhalb PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Diagramm: Eigener Wurzelschlüssel außerhalb PostgreSQL. Umschlossene Projekt-, Nutzer-, Systemschlüssel. Autorisierte Serverentschlüsselung. Restore: Datenbank + Storage + passende Schlüssel.](/documentation/de/workspace-encryption-flow.svg)

## Bestandsdaten und Wiederholungen behandeln {#existing-data}

Eine vorhandene Konfiguration ohne Flag bleibt bis zur bewussten Änderung deaktiviert. Wiederholungen erhalten Flag und Schlüssel; widersprechende Installer-Auswahl scheitert. Erzeuge zur Reparatur einer aktivierten Instanz niemals einen Ersatzschlüssel, sondern beschaffe das Original. Wende erforderliches Schema und Prüfungen vor Datenimport an. Begrenzte Wartungsläufe konvertieren Altdaten und rotieren Schlüssel; das Flag allein belegt keine vollständige Konvertierung historischer Inhalte oder Kopien. Abschalten entschlüsselt geschützte Daten nicht und erlaubt keine Klartextschreibzugriffe in aktivierten Bereichen.

## Wiederherstellbarkeit erhalten {#recovery}

Der Server entschlüsselt für autorisierte Benutzer und KI. Es handelt sich um Verschlüsselung im Ruhezustand, nicht um Ende-zu-Ende-Geheimhaltung gegenüber dem Betreiber. Login-E-Mails und Routingmetadaten bleiben lesbar; Exporte und externe Anbieter brauchen eigenen Schutz. Erhalte aktuelle und historische Wurzelschlüssel für aufbewahrte Backups. Verschlüssele und beschränke Sicherungen mit Daten und Konfiguration. Erprobe Datenbank-/Storage-Restore mit passenden Schlüsseln. Wurzelschlüsseländerungen benötigen geschütztes Offline-Neuverpacken bei gestoppten Anwendungen; einfacher Austausch macht Inhalte unlesbar.
