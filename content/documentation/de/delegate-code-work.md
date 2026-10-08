---
{
  "id": "delegate-code-work",
  "locale": "de",
  "title": "Ein Ticket an den Code-Worker delegieren",
  "summary": "Repository-Zugriff vorbereiten, den Lauf verfolgen und den verknüpften Pull Request prüfen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03"
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "review-pull-requests",
    "recover-numo-work",
    "repository-skills"
  ],
  "aliases": [
    "plans-and-agents"
  ],
  "tags": [],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/delegate-code-work-workflow.png",
      "alt": "Abgeschlossene Worker-Karte mit Modell, geringer Denkintensität, zwei geänderten Dateien, Branch, PR Nr. 1 und korrigiertem Commit.",
      "caption": "Karte der tatsächlichen Korrektur am bestehenden PR mit aktualisiertem Commit und Link. Prüfen Sie Diff und Tests vor dem Merge; der Abschlussstatus allein belegt nicht, dass die Abnahmekriterien erfüllt sind.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow"
  ]
}
---

## Die Umsetzung abgrenzen {#delegate-code-work}
Das Projekt benötigt ein verknüpftes GitHub- oder GitLab-Repository, gültige Anbieterrechte und eine konfigurierte Server-Sandbox. Prüfen Sie Worker-Modell und Denkintensität in den KI-Kontoeinstellungen. Das Gesprächsmodell ersetzt diese Vorgaben nicht.

1. Öffnen Sie das Ticket und beschreiben Sie erwartetes Verhalten, Einschränkungen und Abnahmetests.
2. Öffnen Sie Numo mit Ticketkontext. Lassen Sie das Repository vor einem technischen Plan prüfen. Ungeprüfte Dateinamen und APIs sind keine Umsetzungsbelege.
3. Beauftragen Sie die Umsetzung ausdrücklich. Numo delegiert Branch-Änderungen an den Worker, der das Repository in der Server-Sandbox klont.
4. Verfolgen Sie Fortschritt, Dateien, Prüfungen und Fragen auf der Worker-Karte. Antworten Sie im Gespräch.
5. Öffnen Sie den verknüpften Pull Request. Prüfen Sie Diff und dokumentierte Tests anhand der Abnahmekriterien vor dem Merge. Eine Vorschau gibt es nur, wenn der Deployment-Anbieter eine erzeugt hat.

![Abgeschlossene Worker-Karte mit Modell, geringer Denkintensität, zwei geänderten Dateien, Branch, PR Nr. 1 und korrigiertem Commit.](/documentation/de/delegate-code-work-workflow.png)


## Sicher fortsetzen {#continuation}
Ein erhaltener Checkpoint kann eine Wiederaufnahme ermöglichen, garantiert aber keinen Abschluss. Prüfen Sie Branch und PR vor einem neuen Lauf. Erhalten Sie erledigte Planaufgaben und parallele Änderungen. Rein lokale Dateien fehlen dem Worker: Pushen Sie erforderlichen Code oder Skills zuerst.
