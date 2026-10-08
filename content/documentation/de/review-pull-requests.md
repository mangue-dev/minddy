---
{
  "id": "review-pull-requests",
  "locale": "de",
  "title": "Einen verknüpften Pull Request prüfen",
  "summary": "Dateien, Diskussionen und Prüfungen vor Review-Anforderung oder Merge untersuchen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N04"
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
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "content/knowledge/plans-and-agents.md"
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
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/review-pull-requests-workflow.png",
      "alt": "Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.",
      "caption": "Der tatsächlich korrigierte PR bleibt offen und wurde nicht gemergt. Der Diff entfernt Leerzeichen um den Namen und verwendet World bei leerem Wert. Diese Instanz kann keine GitHub-Benutzerautorisierung anfordern; der Bereitschaftsstatus verleiht keine Merge-Rechte und belegt keine erfolgreiche Anbieter-CI.",
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
    "review-pull-requests-workflow"
  ]
}
---

## Den Vorschlag prüfen {#review-pull-requests}
Öffnen Sie den Pull Request am Ticket oder delegierten Lauf. Repository-Zugriff bleibt erforderlich; Projektmitgliedschaft verleiht keine Forge-Rechte.

Lesen Sie Beschreibung und Aktivität, danach geänderte Dateien und Diff-Blöcke. Öffnen Sie ungelöste Diskussionen und antworten Sie im betreffenden Thread. Markierungen gelesener Dateien dokumentieren Ihren Fortschritt, gelten aber nicht als Anbieterfreigabe. Prüfen Sie Commits, CI-Ergebnisse und verknüpfte Tickets auf den geforderten Umfang.

![Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.](/documentation/de/review-pull-requests-workflow.png)


## Review und Merge {#decision}
Fordern Sie bei Bedarf einen weiteren Reviewer an. Eine verfügbare KI-Prüfung ist zusätzliche Rückmeldung und kein Beleg bestandener Tests. Prüfen Sie Entwurfs- oder Review-Status, offene Diskussionen, angeforderte Reviews und die Merge-Regeln des Anbieters.

Führen Sie den Merge erst nach den erforderlichen Tests und Reviews mit einem berechtigten Anbieterkonto aus. Eine sichtbare Aktion kann dennoch abgelehnt werden. Bei veraltetem Status aktualisieren Sie die Ansicht und prüfen den Anbieter vor Wiederholung. Numo kann mit Freigabe lesen, kommentieren, Review-Bereitschaft ändern oder mergen; Branch-Änderungen erledigt der Worker. Eine Vorschau setzt ein tatsächliches Deployment voraus.
