---
{
  "id": "transfer-between-instances",
  "locale": "de",
  "title": "Übertragung von Kontodaten",
  "summary": "Privates JSON exportieren, ergänzend importieren und Konflikte sowie Ausschlüsse prüfen.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-737 account settings reorganization",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/settings-and-data.md",
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Privacy & data tab name; the retained screenshots predate the rename; no browser walkthrough, no new captures)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root (de MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Kontodaten zwischen Instanzen übertragen"
  ],
  "figures": [
    {
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/transfer-between-instances-workflow.png",
      "alt": "Datenübertragung mit Schaltfläche zum Import einer Datei.",
      "caption": "Wähle die unveränderte JSON-Exportdatei des Quellkontos. Prüfe das Importergebnis vor dem Schließen.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/transfer-between-instances-export-workflow.png",
      "alt": "Exportfunktion des Kontos.",
      "caption": "Exportfunktion des Kontos. Der Export enthält keine Schlüssel oder Tokens; die Aufnahme zeigt die Schaltfläche vor dem Download.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
  ]
}
---

## Exportieren und importieren {#transfer-between-instances}

Melden Sie sich an der Quellinstanz an und öffnen Sie den Tab **Datenschutz & Daten** in den Kontoeinstellungen. Wählen Sie **Meine Daten herunterladen** und bewahren Sie die JSON-Datei privat auf: Sie enthält Konto- und Projektinhalte einschließlich der Dateibytes. Erstellen Sie Ihr Konto auf der Zielinstanz oder melden Sie sich dort am bestehenden Konto an. Prüfen Sie deren Adresse, öffnen Sie denselben Tab und wählen Sie **Eine Übertragungsdatei importieren**. Wählen Sie die unveränderte Exportdatei und warten Sie auf das Ergebnis, bevor Sie die Seite schließen.

Der Import fügt Daten hinzu, statt das Ziel zu ersetzen. Kennungen bleiben erhalten, wenn sie sicher wiederverwendbar sind; Konflikte erhalten neue Kennungen. Das Ergebnis nennt neu zugeordnete Kennungen und übersprungene Mitgliedschaften. Mitgliedschaftsreferenzen zu bestehenden Projekten werden nur wiederhergestellt, wenn das Zielprojekt bereits existiert und die Referenz autorisiert ist. Prüfen Sie nach dem Neuladen Projekte, Tickets, Seiten und persönliche Daten.

![Datenübertragung mit Schaltfläche zum Import einer Datei.](/documentation/de/transfer-between-instances-workflow.png)

## Dienste neu verbinden {#exclusions}

Passwörter, API-Schlüssel, OAuth-Tokens, Repository-Zugangsdaten und Abrechnungsabonnements werden nicht übertragen. Konfigurieren und autorisieren Sie benötigte Dienste am Ziel erneut. Ein exportiertes Projekt beweist keinen funktionierenden Anbieterzugriff. Prüfen Sie Dateiressourcen und ihre Verfügbarkeit, statt JSON als betriebliches Backup von Datenbank und Storage-Bytes zu behandeln. Ein Export aus v0.11.0 oder früher kann gespeicherte Ansichten der Befehlspalette und Unterhaltungen des Code-Agenten enthalten; diese Release hat diese Funktionen nicht mehr und ignoriert sie beim Import.

Behalten Sie die Quellinstanz, bis die übertragenen Arbeiten geprüft sind. Schlägt der Import fehl, bewahren Sie die Fehlermeldung auf und prüfen Sie den Zielzustand vor einer Wiederholung. Löschen oder schützen Sie Übertragungsdateien, sobald sie nicht mehr benötigt werden; hängen Sie sie niemals an einen öffentlichen Fehlerbericht an.

![Exportfunktion des Kontos.](/documentation/de/transfer-between-instances-export-workflow.png)

Das Ergebnis bleibt geöffnet, bis Sie Konto neu laden wählen oder den Dialog schließen. Beide Aktionen laden das Konto neu, nachdem Sie die Zahlen geprüft haben.
