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
  "revision": 9,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 recapture of transfer-between-instances-workflow, transfer-between-instances-export-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 figure update; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Melde dich an der Quellinstanz an und öffne den Tab **Datenschutz & Daten** in den Kontoeinstellungen. Wähle **Meine Daten herunterladen** und bewahre die JSON-Datei privat auf: Sie enthält Konto- und Projektinhalte einschließlich der Dateibytes. Erstelle dein Konto auf der Zielinstanz oder melde dich dort am bestehenden Konto an. Prüfe deren Adresse, öffne denselben Tab und wähle **Eine Übertragungsdatei importieren**. Wähle die unveränderte Exportdatei und warte auf das Ergebnis, bevor du die Seite schließt.

Der Import fügt Daten hinzu, statt das Ziel zu ersetzen. Kennungen bleiben erhalten, wenn sie sicher wiederverwendbar sind; Konflikte erhalten neue Kennungen. Das Ergebnis nennt neu zugeordnete Kennungen und übersprungene Mitgliedschaften. Mitgliedschaftsreferenzen zu bestehenden Projekten werden nur wiederhergestellt, wenn das Zielprojekt bereits existiert und die Referenz autorisiert ist. Prüfe nach dem Neuladen Projekte, Tickets, Seiten und persönliche Daten.

![Datenübertragung mit Schaltfläche zum Import einer Datei.](/documentation/de/transfer-between-instances-workflow.png)

## Dienste neu verbinden {#exclusions}

Passwörter, API-Schlüssel, OAuth-Tokens, Repository-Zugangsdaten und Abrechnungsabonnements werden nicht übertragen. Konfiguriere und autorisiere benötigte Dienste am Ziel erneut. Ein exportiertes Projekt beweist keinen funktionierenden Anbieterzugriff. Prüfe Dateiressourcen und ihre Verfügbarkeit, statt JSON als betriebliches Backup von Datenbank und Storage-Bytes zu behandeln. Ein Export aus v0.11.0 oder früher kann gespeicherte Ansichten der Befehlspalette und Unterhaltungen des Code-Agenten enthalten; diese Release hat diese Funktionen nicht mehr und ignoriert sie beim Import.

Behalte die Quellinstanz, bis die übertragenen Arbeiten geprüft sind. Schlägt der Import fehl, bewahre die Fehlermeldung auf und prüfe den Zielzustand vor einer Wiederholung. Lösche oder schütze Übertragungsdateien, sobald sie nicht mehr benötigt werden; hänge sie niemals an einen öffentlichen Fehlerbericht an.

![Exportfunktion des Kontos.](/documentation/de/transfer-between-instances-export-workflow.png)

Das Ergebnis bleibt geöffnet, bis du Konto neu laden wählst oder den Dialog schließt. Beide Aktionen laden das Konto neu, nachdem du die Zahlen geprüft hast.
