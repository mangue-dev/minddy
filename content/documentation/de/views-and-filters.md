---
{
  "id": "views-and-filters",
  "locale": "de",
  "title": "Eine Ansicht deiner Arbeit speichern",
  "summary": "Filtere und sortiere Probleme, ohne ihre gespeicherten Eigenschaften zu ändern.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "navigation",
    "search-and-shortcuts"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-view-filters.png",
      "alt": "Manuelle Ansichtsfilter und Sortiermenü.",
      "caption": "Filtere nach Ticketeigenschaften oder wähle eine Reihenfolge. Für diese manuellen Bedienelemente ist das KI-Feld optional.",
      "revision": 3,
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
    "views-and-filters-steps"
  ]
}
---

## Die Ansicht erstellen und speichern {#views-and-filters}

Beginne in einem Projektboard oder einer persönlichen projektübergreifenden Problemansicht. Wähle die benötigte Arbeit mit Filtern, Sortierung und Darstellungsfunktionen aus. Prüfe vor dem Speichern den Umfang: Eine persönliche Ansicht und eine Projektansicht haben nicht dieselbe Zugriffsgrenze.

Filtere nach unterstützten Eigenschaften wie Status, zuständiger Person, Priorität, Kategorien oder Ziel. Sortiere die Ergebnisse so, dass die nächste Aktion klar wird. Im Kanban bleiben Probleme nach Status gruppiert; eine geänderte Ansicht bearbeitet weder Status noch Zuweisung.

Speichere die Ansicht unter einem Namen, der ihren Zweck beschreibt, wähle sie erneut in der Navigation und prüfe ihre Filter. Bearbeite oder entferne die gespeicherte Ansicht, wenn sich ihr Zweck ändert. Das Teilen ist eine gesonderte Veröffentlichung mit eigenen Berechtigungen und Widerrufsregeln.

![Manuelle Ansichtsfilter und Sortiermenü.](/documentation/de/work-view-filters.png)

## Leere oder unerwartete Ergebnisse klären {#view-recovery}

Prüfe alle Filter, das aktive Projekt und deine Mitgliedschaft, wenn erwartete Probleme fehlen. Entferne einschränkende Filter, bevor du von gelöschten Daten ausgehst. Nach der Bearbeitung kann ein Problem berechtigterweise aus einer gefilterten Ansicht verschwinden. Suche seine Kennung oder verwende ein ungefiltertes Projektboard, um die gespeicherten Werte zu prüfen.

Eine gespeicherte Ansicht ist keine Kopie ihrer Probleme. Das Löschen der Ansicht entfernt ihre Konfiguration; das Löschen ausgewählter Probleme verändert dagegen die zugrunde liegende Projektarbeit.
