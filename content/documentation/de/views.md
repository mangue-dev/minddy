---
{
  "id": "views",
  "locale": "de",
  "title": "Ansichten und Filter",
  "summary": "Speichere eine gefilterte Ansicht zugänglicher Arbeit, teile sie schreibgeschützt und widerrufe bei Bedarf den öffentlichen Zugriff.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13",
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/api/me/saved-views/route.ts",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "navigation",
    "pages",
    "permissions-and-public-links"
  ],
  "aliases": [
    "views-and-filters",
    "share-a-view"
  ],
  "tags": [
    "Eine Ansicht deiner Arbeit speichern",
    "Eine schreibgeschützte Ansicht teilen und widerrufen"
  ],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-view-filters.png",
      "alt": "Manuelle Ansichtsfilter und Sortiermenü.",
      "caption": "Filtere nach Ticketeigenschaften oder wähle eine Reihenfolge. Für diese manuellen Bedienelemente ist das KI-Feld optional.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-share-view.png",
      "alt": "Freigabedialog einer Ansicht mit ausgewähltem privatem Zugriff.",
      "caption": "Privater, passwortgeschützter und öffentlicher Zugriff sind unterschiedliche Optionen. Die Ansicht bleibt hier privat.",
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
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Ansichten stellen ausgewählte Arbeit mit Filtern und Sortierung dar. Die folgenden Abschnitte erklären das Speichern und die öffentliche Freigabe geeigneter Projektansichten; globale projektübergreifende Ansichten lassen sich nicht teilen.

## Eine Ansicht deiner Arbeit speichern {#views-and-filters}

Beginne in einem Projektboard oder einer persönlichen projektübergreifenden Problemansicht. Wähle die benötigte Arbeit mit Filtern, Sortierung und Darstellungsfunktionen aus. Prüfe vor dem Speichern den Umfang: Eine persönliche Ansicht und eine Projektansicht haben nicht dieselbe Zugriffsgrenze.

Filtere nach unterstützten Eigenschaften wie Status, zuständiger Person, Priorität, Kategorien oder Ziel. Sortiere die Ergebnisse so, dass die nächste Aktion klar wird. Im Kanban bleiben Probleme nach Status gruppiert; eine geänderte Ansicht bearbeitet weder Status noch Zuweisung.

Speichere die Ansicht unter einem Namen, der ihren Zweck beschreibt, wähle sie erneut in der Navigation und prüfe ihre Filter. Bearbeite oder entferne die gespeicherte Ansicht, wenn sich ihr Zweck ändert. Das Teilen ist eine gesonderte Veröffentlichung mit eigenen Berechtigungen und Widerrufsregeln.

![Manuelle Ansichtsfilter und Sortiermenü.](/documentation/de/work-view-filters.png)

### Leere oder unerwartete Ergebnisse klären {#view-recovery}

Prüfe alle Filter, das aktive Projekt und deine Mitgliedschaft, wenn erwartete Probleme fehlen. Entferne einschränkende Filter, bevor du von gelöschten Daten ausgehst. Nach der Bearbeitung kann ein Problem berechtigterweise aus einer gefilterten Ansicht verschwinden. Suche seine Kennung oder verwende ein ungefiltertes Projektboard, um die gespeicherten Werte zu prüfen.

Eine gespeicherte Ansicht ist keine Kopie ihrer Probleme. Das Löschen der Ansicht entfernt ihre Konfiguration; das Löschen ausgewählter Probleme verändert dagegen die zugrunde liegende Projektarbeit.

## Eine schreibgeschützte Ansicht teilen und widerrufen {#share-a-view}

Öffne das Ansichtsmenü auf einem geeigneten Projektboard und wähle die Aktion zum Teilen der Ansicht. Du brauchst Projektzugriff; eine persönliche Ansicht innerhalb des Projekts kann nur ihr eigener Benutzer teilen. Globale projektübergreifende Ansichten lassen sich nicht teilen. Prüfe Filter und sichtbare Inhalte vor der Veröffentlichung. Wähle einen öffentlichen geheimen Link oder einen Passwortschutz, sofern angeboten. Passwörter benötigen mindestens acht Zeichen. Kopiere den erzeugten Link erst, wenn die Änderung erfolgreich gespeichert wurde.

Öffne den Link in einer separaten Browsersitzung ohne dein Konto. Prüfe die Problemauswahl, Felder und verknüpften Inhalte, die Besucher sehen können. Der öffentliche Link gewährt schreibgeschützten Zugriff auf die Ansicht, keine Mitgliedschaft oder Bearbeitungsrechte im Projekt.

Geteilte Karten zeigen Titel, Beschreibungen und eingeblendete Eigenschaften, darunter Namen zuständiger Personen, Kategorien, Zielnamen, Fälligkeitstermine, Wiederholung und vorhandene Links zur entfernten Git-Plattform. Die veröffentlichte Darstellung enthält keine Inhalte von Umsetzungsplänen und keine E-Mail-Adressen der Mitglieder. Kennzeichnungen übergeordneter Probleme und Beziehungen können Kennungen von Projektproblemen außerhalb des Ansichtsfilters zeigen. Prüfe diese Beschreibungen, Namen und Kennungen ebenso wie die sichtbaren Spalten. Das Ausblenden einer Karteneigenschaft ist keine allgemeine Schwärzung vertraulicher Inhalte.

![Freigabedialog einer Ansicht mit ausgewähltem privatem Zugriff.](/documentation/de/work-share-view.png)

### Widerrufen und prüfen {#revoke-view}

Kehre zu den Freigabesteuerungen der Ansicht zurück und stelle sie auf privat, um die Veröffentlichung zu widerrufen. Öffne den alten Link erneut anonym und prüfe, ob der Zugriff verweigert wird. Der Widerruf kann gespeicherte Kopien oder Screenshots der Besucher nicht zurückholen.

Geheime Ansichtslinks verwenden den Veröffentlichungsweg für private Links und bleiben noindex. Diese Indexierungsregel begrenzt die Auffindbarkeit durch Suchmaschinen, ersetzt aber kein Passwort. Halte den Link bei sensiblen Inhalten privat und verwende gegebenenfalls Passwortschutz. Verwechsle die geteilte Ansicht eines Benutzers nicht mit der indexierten offiziellen Dokumentation.

Weicht das anonyme Ergebnis von deiner Erwartung ab, prüfe die gespeicherte Ansicht und Freigabekonfiguration, bevor du den Link weitergibst. Kontrolliere den Umfang nach Änderungen an Filtern oder verknüpften Inhalten erneut.
