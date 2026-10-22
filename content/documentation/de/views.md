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
  "revision": 11,
  "sourceRevision": 10,
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/share-view-dialog.tsx"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of views-and-filters-steps, share-a-view-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        288,
        413
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-share-view.png",
      "alt": "Freigabedialog einer Ansicht mit ausgewähltem privatem Zugriff.",
      "caption": "Privater, passwortgeschützter und öffentlicher Zugriff sind unterschiedliche Optionen. Die Ansicht bleibt hier privat.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Eine Ansicht speichert Filter und Darstellung von Tickets, ohne diese zu kopieren oder zu ändern. Richte zuerst die Ansicht für deine Arbeit ein. Das Teilen einer geeigneten Projektansicht ist ein separater Schritt und gibt Besuchern nur lesenden Zugriff auf die veröffentlichten Inhalte. Globale projektübergreifende Ansichten lassen sich nicht teilen.

## Eine Ansicht deiner Arbeit speichern {#views-and-filters}

Beginne in einem Projektboard oder einer persönlichen projektübergreifenden Ticketansicht. Wähle die benötigte Arbeit mit Filtern, Sortierung und Darstellungsfunktionen aus. Prüfe vor dem Speichern den Umfang: Eine persönliche Ansicht und eine Projektansicht haben nicht dieselbe Zugriffsgrenze.

Filtere nach unterstützten Eigenschaften wie Status, zuständiger Person, Priorität, Kategorien oder Ziel. Sortiere die Ergebnisse so, dass die nächste Aktion klar wird. Im Kanban bleiben Tickets nach Status gruppiert; eine geänderte Ansicht bearbeitet weder Status noch Zuweisung. Ohne eigenen Statusfilter zeigt ein Board nur **Rückstand**, **Todo**, **In Bearbeitung** und **In Überprüfung**. Wähle **Fertig** oder **Abgebrochen** im Filter **Status**, um diese Spalten anzuzeigen; eine Ansicht behält den Statusfilter, den du mit ihr speicherst.

Speichere die Ansicht unter einem Namen, der ihren Zweck beschreibt, wähle sie erneut in der Ansichtsleiste oben auf dem Board (auf einem schmalen Bildschirm in einem Menü) und prüfe ihre Filter. Bearbeite oder entferne die gespeicherte Ansicht, wenn sich ihr Zweck ändert. **Ansicht löschen** verlangt eine Bestätigung, und ein Board behält immer mindestens eine eigene Ansicht. Das Teilen ist eine gesonderte Veröffentlichung mit eigenen Berechtigungen und Widerrufsregeln.

![Manuelle Ansichtsfilter und Sortiermenü.](/documentation/de/work-view-filters.png)

### Leere oder unerwartete Ergebnisse klären {#view-recovery}

Prüfe alle Filter, das aktive Projekt und deine Mitgliedschaft, wenn erwartete Tickets fehlen. Entferne einschränkende Filter, bevor du von gelöschten Daten ausgehst. Nach der Bearbeitung kann ein Ticket berechtigterweise aus einer gefilterten Ansicht verschwinden. Suche seine Kennung oder wähle auf einem sonst ungefilterten Projektboard **Fertig** und **Abgebrochen** im Filter **Status**, um die gespeicherten Werte zu prüfen.

Eine gespeicherte Ansicht ist keine Kopie ihrer Tickets. Das Löschen der Ansicht entfernt ihre Konfiguration; das Löschen ausgewählter Tickets verändert dagegen die zugrunde liegende Projektarbeit.

## Eine schreibgeschützte Ansicht teilen und widerrufen {#share-a-view}

Öffne das Ansichtsmenü auf einem geeigneten Projektboard und wähle die Aktion zum Teilen der Ansicht. Du musst Eigentümer oder Mitglied sein; Leser behalten ihre persönlichen Ansichten, können aber keine Ansichten teilen. Eine persönliche Ansicht innerhalb des Projekts kann nur ihr eigener Benutzer teilen. Globale projektübergreifende Ansichten lassen sich nicht teilen. Prüfe Filter und sichtbare Inhalte vor der Veröffentlichung. Wähle einen öffentlichen geheimen Link oder einen Passwortschutz, sofern angeboten. Passwörter benötigen mindestens acht Zeichen. Kopiere den erzeugten Link erst, wenn die Änderung erfolgreich gespeichert wurde.

Öffne den Link in einer separaten Browsersitzung ohne dein Konto. Prüfe die Ticketauswahl, Felder und verknüpften Inhalte, die Besucher sehen können. Der öffentliche Link gewährt schreibgeschützten Zugriff auf die Ansicht, keine Mitgliedschaft oder Bearbeitungsrechte im Projekt.

Geteilte Karten zeigen Titel, Beschreibungen und eingeblendete Eigenschaften, darunter Namen zuständiger Personen, Kategorien, Zielnamen, Fälligkeitstermine, Wiederholung und vorhandene Links zur entfernten Git-Plattform. Die veröffentlichte Darstellung enthält keine Inhalte von Umsetzungsplänen und keine E-Mail-Adressen der Mitglieder. Kennzeichnungen übergeordneter Tickets und Beziehungen können Kennungen von Projekttickets außerhalb des Ansichtsfilters zeigen. Prüfe diese Beschreibungen, Namen und Kennungen ebenso wie die sichtbaren Spalten. Das Ausblenden einer Karteneigenschaft ist keine allgemeine Schwärzung vertraulicher Inhalte.

![Freigabedialog einer Ansicht mit ausgewähltem privatem Zugriff.](/documentation/de/work-share-view.png)

### Widerrufen und prüfen {#revoke-view}

Kehre zu den Freigabesteuerungen der Ansicht zurück, stelle sie auf privat und bestätige mit **Freigabe beenden**, um die Veröffentlichung zu widerrufen. Erneutes Teilen erzeugt einen neuen Link. Öffne den alten Link erneut anonym und prüfe, ob der Zugriff verweigert wird. Der Widerruf kann gespeicherte Kopien oder Screenshots der Besucher nicht zurückholen.

Geheime Ansichtslinks verwenden den Veröffentlichungsweg für private Links und bleiben `noindex`. Diese Indexierungsregel begrenzt die Auffindbarkeit durch Suchmaschinen, ersetzt aber kein Passwort. Halte den Link bei sensiblen Inhalten privat und verwende gegebenenfalls Passwortschutz. Verwechsle die geteilte Ansicht eines Benutzers nicht mit der indexierten offiziellen Dokumentation.

Weicht das anonyme Ergebnis von deiner Erwartung ab, prüfe die gespeicherte Ansicht und Freigabekonfiguration, bevor du den Link weitergibst. Kontrolliere den Umfang nach Änderungen an Filtern oder verknüpften Inhalten erneut.
