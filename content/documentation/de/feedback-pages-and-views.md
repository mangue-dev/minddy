---
{
  "id": "feedback-pages-and-views",
  "locale": "de",
  "title": "Öffentliche Seiten und Ansichten zum Board hinzufügen",
  "summary": "Veröffentlichte Inhalte wählen, ohne geschützte Namen oder Links offenzulegen.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor"
  ],
  "workflows": [
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/project-feedback-settings.tsx",
      "components/feedback/feedback-settings-shared.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/feedback-pages-and-views-workflow.png",
      "alt": "Veröffentlichter Feedback-Leitfaden als ausgewählter Board-Tab, ohne Anmeldung lesbar.",
      "caption": "Veröffentlichen Sie eine Seite, aktivieren Sie Seitentabs und wählen Sie die Seite für das Board aus. Die Demoseite wurde anonym geöffnet; ihre undurchsichtige URL behält noindex.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-pages-and-views-workflow"
  ]
}
---

## Veröffentlichen und auswählen {#feedback-pages-and-views}

Veröffentlichen Sie als Projektinhaber zunächst die gewünschte Projektseite oder teilen Sie die gewünschte Ansicht mit öffentlicher Sichtbarkeit. Prüfen Sie den Inhalt auf private Informationen. Öffnen Sie die Feedback-Einstellungen, aktivieren Sie die Seiten- oder Ansichtsfamilie und wählen Sie jedes anzuzeigende Element aus. Sowohl der Familienschalter als auch die Auswahl jedes Elements sind erforderlich.

Die Einstellungsliste kann geschützte Freigaben enthalten; die öffentliche Navigation zeigt jedoch nur Freigaben auf öffentlicher Ebene. Die Auswahl einer geschützten Seite umgeht weder deren Schutz noch zeigt sie deren Namen in einem Board-Tab. Ein veröffentlichtes Element aus einem anderen Projekt gehört nicht zur Tabliste dieses Projekts.


## Prüfen und Zugriff entfernen {#visibility}

Öffnen Sie das Board abgemeldet. Folgen Sie den Tabs zu den ausgewählten Ansichten und Seiten und prüfen Sie Titel und Inhalte. Wenn sie konfiguriert ist, wird die Navigation gemeinsam für Board, öffentliche Ansichten und öffentliche Seiten verwendet. Ein einzelner Tab erscheint nicht als Navigation.

Entfernen Sie einen Tab, indem Sie das Element abwählen oder seine Familie deaktivieren. Dadurch verschwindet die Navigation, nicht die eigentliche Freigabe. Widerrufen oder ändern Sie die Freigabe selbst, um den Zugriff über den direkten Link zu beenden. Die Deaktivierung des Boards deaktiviert auch seine gekoppelte Navigation, widerruft aber nicht jede Seiten- oder Ansichtsfreigabe einzeln. Prüfen Sie nach einer Veröffentlichungsänderung sowohl den Board-Tab als auch die ursprüngliche Freigabe-URL.

![Veröffentlichter Feedback-Leitfaden als ausgewählter Board-Tab, ohne Anmeldung lesbar.](/documentation/de/feedback-pages-and-views-workflow.png)
