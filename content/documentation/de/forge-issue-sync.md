---
{
  "id": "forge-issue-sync",
  "locale": "de",
  "title": "Forge-Tickets synchronisieren",
  "summary": "Import und Statusabgleich aktivieren und Rechte sowie konkurrierende Änderungen prüfen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "docs/github-issue-sync.md",
      "content/knowledge/integrations.md",
      "components/settings/project-git-section.tsx",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/de/forge-issue-sync-mapping.png",
      "alt": "GitHub-Synchronisierung mit Einrichtung, Ereignisprüfung, Import und Statusabgleich.",
      "caption": "GitHub-Ereignisse bewahren neuere Änderungen und verhindern doppelte Zustellungen. GitLab-Zuordnungen sind separat zu prüfen.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/forge-issue-sync-workflow.png",
      "alt": "Verknüpftes GitHub-Demonstrationsrepository mit deaktivierter Issue-Synchronisierung.",
      "caption": "Das Demonstrationsrepository ist mit GitHub verknüpft. Die Issue-Synchronisierung ist noch ausgeschaltet. Prüfen Sie den Umfang und den vorhandenen Backlog vor der Aktivierung. Diese Aufnahme belegt keinen synchronisierten Import.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

## Aktivieren und prüfen {#forge-issue-sync}
Öffnen Sie als Eigentümer nach der Repository-Verknüpfung den Git-Bereich. Aktivieren Sie die Synchronisierung mit erforderlichen Schreibrechten. Importierte Tickets landen in der Triage. Prüfen Sie den gemeldeten Nachimport sowie Titel, Beschreibung und Status eines bekannten Remote-Tickets.

Offen und geschlossen werden in beide Richtungen gespiegelt. Bei GitHub werden Titel und Inhalt zu Titel und Beschreibung; Labels liefern Kategorien sowie erkannte Priorität und Aufwand; der erste verknüpfte Bearbeiter wird verwendet, die Milestone-Frist als Fälligkeit. Kommentare behalten Remote-Autor, Identität, URL und Zeitpunkte. Blockierbeziehungen verlangen beide Tickets im selben importierten Projekt. Anhangs-URLs bleiben erhalten; Dateibytes und GitHub-Projektfelder besitzen keine native Entsprechung.

## Rechte, Konflikte und Abschalten {#recovery}
Die GitHub App braucht Issues-Lese-/Schreibrechte und Abonnements für Issues, Issue comments und Issue dependencies. Bestehende Installationen müssen neue Rechte akzeptieren. Diese Zuordnung garantiert nicht sämtliche GitLab-Felder.

Ältere GitHub-Ereignisse mit Zeitstempel überschreiben keine neueren lokalen Änderungen. Eindeutige Liefer- und Kommentaridentitäten verhindern Duplikateffekte. Vergleichen Sie Zeitstempel sowie Anbieterereignisse und Betreiberlogs bei fehlendem Nachimport. Deaktivieren Sie im selben Eigentümerbereich; prüfen Sie bereits importierte Arbeit separat.

![GitHub-Synchronisierung mit Einrichtung, Ereignisprüfung, Import und Statusabgleich.](/documentation/de/forge-issue-sync-mapping.png)

![Verknüpftes GitHub-Demonstrationsrepository mit deaktivierter Issue-Synchronisierung.](/documentation/de/forge-issue-sync-workflow.png)
