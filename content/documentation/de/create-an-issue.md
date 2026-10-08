---
{
  "id": "create-an-issue",
  "locale": "de",
  "title": "Ein Problem erstellen und bearbeiten",
  "summary": "Beschreibe eine umsetzbare Aufgabe, wähle ihr Projekt und aktualisiere Eigenschaften, ohne Arbeit zu duplizieren.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/de/new-issue.png",
      "alt": "Noch nicht abgesendeter Ticketentwurf mit Titel, Beschreibung und manuell wählbaren Eigenschaften.",
      "caption": "Beschreibe das erwartete Ergebnis und wähle vor der Erstellung die passenden Eigenschaften.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps"
  ]
}
---

## Die Aufgabe erstellen {#create-an-issue}

Du musst Mitglied des Zielprojekts sein. Öffne das Projekt und seine Funktion zum Erstellen eines Problems. Gib einen Titel ein, der die Arbeit benennt, und ergänze Kontext, erwartetes Ergebnis und Einschränkungen in der Beschreibung. Wähle das Projekt bewusst, wenn du aus einer persönlichen oder projektübergreifenden Ansicht erstellst.

Schalte für eine manuelle Erstellung Smart-Fill aus, wenn die Schaltfläche angezeigt wird und aktiviert ist. Dadurch kannst du Priorität, Aufwand, Kategorien und Ziel selbst festlegen. Die Auswahl gilt für dieses Ticket; beim erneuten Öffnen des Erstellungsformulars wird die Kontoeinstellung wiederhergestellt. Sie ist von den Automatisierungs- und Smart-Assign-Schaltern des Projekts unabhängig.

Setze vor der Bestätigung die hilfreichen Eigenschaften: Status, Priorität, Aufwand, zuständige Person, Ziel, Kategorien, Fälligkeitsdatum und Wiederholung. Zuständige Personen sind Projektmitglieder; ein Ziel bündelt Probleme zu einem Projektergebnis. Optionale Eigenschaften kannst du offenlassen, statt Werte zu erraten. Die Priorität reicht von keiner über niedrig, mittel und hoch bis dringend; der Aufwand verwendet XS, S, M, L und XL.

Bestätige die Erstellung und öffne das neue Problem. Prüfe Kennung und Projekt. Öffne die Eigenschaftsauswahl erneut, um Werte zu ändern, sobald die Aufgabe klarer wird. Die Beschreibung erklärt die Arbeit; ein Umsetzungsplan wird gesondert im Plan-Tab gepflegt.


![Noch nicht abgesendeter Ticketentwurf mit Titel, Beschreibung und manuell wählbaren Eigenschaften.](/documentation/de/new-issue.png)

## Speichern und Sichtbarkeit prüfen {#issue-save}

Prüfe nach einer Eigenschaftsänderung den angezeigten Wert. Filter können ein Problem sofort aus der aktuellen Ansicht entfernen, wenn sich zuständige Person, Status oder Kategorie ändern. Suche seine Kennung oder öffne das Projekt ohne diese Filter, bevor du einen Ersatz erstellst.

Schlägt Erstellen oder Speichern fehl, bewahre deinen Text auf, lies den Fehler und prüfe, ob Mitgliedschaft und Ziel noch bestehen. Kontrolliere nach einem Netzwerkfehler zuerst, ob das Problem bereits erstellt wurde, bevor du erneut versuchst. Verknüpfe Projektseiten als aktuelle Ressourcen, wenn du deren jetzigen Inhalt brauchst, und verwende Kommentare für die Diskussion der Aufgabe.
