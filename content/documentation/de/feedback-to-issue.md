---
{
  "id": "feedback-to-issue",
  "locale": "de",
  "title": "Feedback zusammenführen und mit Umsetzung verbinden",
  "summary": "Kanonische Anfrage wählen, Arbeit verknüpfen und öffentlichen Status prüfen.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F04"
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
      "components/feedback/feedback-team-page.tsx",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
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
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/feedback-to-issue-workflow.png",
      "alt": "Feedback mit einem neu erstellten verknüpften Issue und dem Status Geplant.",
      "caption": "Die Umwandlung dieses Beispiels erstellte ein verknüpftes Issue im Status Todo. Der öffentliche Feedback-Status wechselte automatisch zu Geplant.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-to-issue-workflow"
  ]
}
---

## Duplikate auflösen {#feedback-to-issue}

Öffnen Sie als Projektmitglied die Feedback-Anfrage und wählen Sie die Zusammenführung mit einer bestehenden kanonischen Anfrage desselben Projekts. Lesen Sie zunächst beide Anliegen: Ähnliche Formulierungen beweisen noch kein gleiches Ziel. Die aktuelle Anfrage wird zum Duplikat, Stimmen werden nach Identität zusammengeführt und das Duplikat leitet zur kanonischen Anfrage weiter. Prüfen Sie das Zusammenführungsereignis in der Aktivität; die Rückgängig-Aktion verwendet dieses Ereignis. Lehnen Sie einen falschen KI-Vorschlag ab, statt ihn nur zum Leeren der Warteschlange anzunehmen.


## Arbeit erstellen oder verknüpfen {#work}

Erstellen Sie aus einer Anfrage ein neues Issue, wenn die Arbeit noch nicht erfasst ist. Prüfen Sie die Erstellungsfelder vor der Bestätigung. Ohne mitgelieferte Felder erstellt die Umwandlung standardmäßig ein Issue im Backlog. Existiert bereits ein Issue, verwenden Sie stattdessen die Verknüpfung. Ein bereits verknüpfter Beitrag kann nicht erneut umgewandelt werden. Wenn Sie die Verknüpfung entfernen, bleibt der letzte öffentliche Status erhalten, und die Beziehung zum Issue endet.

Der verknüpfte Status folgt dem Issue: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Wird die Arbeit zurück ins Backlog verschoben, wird auch der Feedback-Status wieder geöffnet. Prüfen Sie nach einer Statusänderung das verknüpfte Issue und die Anfrage im abgemeldeten Browser.

Teambenachrichtigungen bei neuem Feedback hängen von dessen Quelle und Prüfstatuswechsel ab. Versprechen Sie einem Abstimmenden keine automatische E-Mail zu jeder Zusammenführung oder Issue-Aktualisierung. Öffentlicher Status und Antworten stehen in Mein Feedback. Eine Verknüpfung macht den Fortschritt sichtbar, ohne das private Issue selbst offenzulegen.

![Feedback mit einem neu erstellten verknüpften Issue und dem Status Geplant.](/documentation/de/feedback-to-issue-workflow.png)
