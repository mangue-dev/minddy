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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/account-transfer-execution.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/transfer-between-instances-export-workflow.png",
      "alt": "Exportfunktion des Kontos.",
      "caption": "Exportfunktion des Kontos. Der Export enthält keine Schlüssel oder Tokens; die Aufnahme zeigt die Schaltfläche vor dem Download.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "transfer-between-instances-result-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/transfer-between-instances-result.png",
      "alt": "Importergebnis mit null neu vergebenen IDs und null ausgelassenen Mitgliedschaften.",
      "caption": "Dieser echte Import persönlicher Daten enthält keine ID-Konflikte und keine ausgelassenen Mitgliedschaften. Prüfen Sie die Zahlen und laden Sie das Konto über die Schaltfläche oder durch Schließen des Dialogs neu.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow",
    "transfer-between-instances-result-workflow"
  ]
}
---

## Exportieren und importieren {#transfer-between-instances}

Melden Sie sich an der Quellinstanz an und öffnen Sie den Bereich Daten in den Kontoeinstellungen. Laden Sie den JSON-Export herunter und bewahren Sie ihn privat auf: Er enthält Konto- und Projektinhalte. Erstellen Sie Ihr Konto auf der Zielinstanz oder melden Sie sich dort am bestehenden Konto an. Prüfen Sie deren Adresse und wählen Sie dort den Importbefehl. Wählen Sie die unveränderte Exportdatei und warten Sie auf das Ergebnis, bevor Sie die Seite schließen.

Der Import fügt Daten hinzu, statt das Ziel zu ersetzen. Kennungen bleiben erhalten, wenn sie sicher wiederverwendbar sind; Konflikte erhalten neue Kennungen. Das Ergebnis nennt neu zugeordnete Kennungen und übersprungene Mitgliedschaften. Mitgliedschaftsreferenzen zu bestehenden Projekten werden nur wiederhergestellt, wenn das Zielprojekt bereits existiert und die Referenz autorisiert ist. Prüfen Sie nach dem Neuladen Projekte, Tickets, Seiten und persönliche Daten.

![Datenübertragung mit Schaltfläche zum Import einer Datei.](/documentation/de/transfer-between-instances-workflow.png)

## Dienste neu verbinden {#exclusions}

Passwörter, API-Schlüssel, OAuth-Tokens, Repository-Zugangsdaten und Abrechnungsabonnements werden nicht übertragen. Konfigurieren und autorisieren Sie benötigte Dienste am Ziel erneut. Ein exportiertes Projekt beweist keinen funktionierenden Anbieterzugriff. Prüfen Sie Dateiressourcen und ihre Verfügbarkeit, statt JSON als betriebliches Backup von Datenbank und Storage-Bytes zu behandeln.

Behalten Sie die Quellinstanz, bis die übertragenen Arbeiten geprüft sind. Schlägt der Import fehl, bewahren Sie die Fehlermeldung auf und prüfen Sie den Zielzustand vor einer Wiederholung. Löschen oder schützen Sie Übertragungsdateien, sobald sie nicht mehr benötigt werden; hängen Sie sie niemals an einen öffentlichen Fehlerbericht an.

![Exportfunktion des Kontos.](/documentation/de/transfer-between-instances-export-workflow.png)

Das Ergebnis bleibt geöffnet, bis Sie Konto neu laden wählen oder den Dialog schließen. Beide Aktionen laden das Konto neu, nachdem Sie die Zahlen geprüft haben.

![Importergebnis mit null neu vergebenen IDs und null ausgelassenen Mitgliedschaften.](/documentation/de/transfer-between-instances-result.png)
