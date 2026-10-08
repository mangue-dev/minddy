---
{
  "id": "bulk-issue-actions",
  "locale": "de",
  "title": "Mehrere Probleme gemeinsam aktualisieren",
  "summary": "Prüfe die Auswahl, bevor du eine Aktion auf alle enthaltenen Probleme anwendest.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W04"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "views-and-filters",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-bulk-actions.png",
      "alt": "Aktionsmenü für zwei ausgewählte Demo-Tickets.",
      "caption": "Das Menü wirkt auf die ausgewählten Tickets. In dieser Aufnahme wurde keine Sammeländerung gesendet.",
      "revision": 1,
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
    "bulk-issue-actions-steps"
  ]
}
---

## Auswählen und handeln {#bulk-issue-actions}

Halte auf einem Board die Umschalttaste gedrückt und klicke auf jede Problemkarte, um sie aus- oder abzuwählen. Mit einer Maus kannst du außerdem von einer freien Boardfläche aus ein Auswahlrechteck ziehen. Umschalt, Command oder Strg ergänzt dabei die bestehende Auswahl. Das Auswahlrechteck ist kein Auswahlverfahren für Touchscreens. Prüfe die Anzahl und die sichtbaren Kennungen, bevor du die Sammelaktionen öffnest. Die Auswahl ist eine Arbeitsmenge für die Aktion, keine gespeicherte Ansicht und keine Berechtigungserteilung.

Wähle Aktionen in der schwebenden Auswahlleiste, um die Befehlspalette zu öffnen. Wähle Status, Priorität, Aufwand oder zuständige Person, setze den Wert und bestätige das Inline-Formular. Die Zielaktion erscheint nur, wenn die Auswahl zu einem einzigen Projekt mit verfügbaren Zielen gehört. Andere Aktionen, etwa das Hinzufügen zu oder Entfernen aus einem Zyklus, das Verknüpfen zweier Probleme oder das Senden der Auswahl an Numo, erscheinen nur, wenn das aktuelle Board sie unterstützt. Prüfe anschließend die betroffenen Probleme. Auf einem reinen Touchgerät ohne unterstützte Mehrfachauswahl bearbeitest du jedes Problem im Detailpanel.

![Aktionsmenü für zwei ausgewählte Demo-Tickets.](/documentation/de/work-bulk-actions.png)

## Teilergebnisse und destruktive Aktionen {#bulk-results}

Prüfe bei projektübergreifender Arbeit deine Mitgliedschaft in jedem betroffenen Projekt. Lies Ergebnisse mit Teilfehlern: Erfolgreiche Änderungen können bereits gespeichert sein, obwohl ein anderes Problem abgewiesen wurde. Prüfe das Ergebnis, bevor du die gesamte Auswahl erneut bearbeitest.

Das Löschen betrifft jeden ausgewählten Eintrag. Bestätige deshalb die Auswahl, bevor du fortfährst. Hebe sie nach dem Vorgang auf, wenn du zu anderer Arbeit wechselst. Verändern sich durch dein Update die Filterergebnisse, können Probleme aus der sichtbaren Ansicht verschwinden und trotzdem im Projekt bleiben. Suche ihre Kennungen, um den neuen Zustand zu prüfen, statt sie neu anzulegen.
