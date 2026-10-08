---
{
  "id": "moderate-feedback",
  "locale": "de",
  "title": "Feedback privat prüfen und öffentlich antworten",
  "summary": "Anfragen bearbeiten, ohne interne Notizen offenzulegen oder Besucherworte umzuschreiben.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F03"
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
      "lib/server/feedback/posts.ts",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
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
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/moderate-feedback-workflow.png",
      "alt": "Feedback-Detail mit öffentlicher Teamantwort und interner Notiz.",
      "caption": "Das Kennzeichen Öffentlich markiert die für Besucher sichtbare Antwort; die interne Notiz bleibt beim Team. Kein Ergebnis einer KI-Moderation wird gezeigt.",
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
    "moderate-feedback-workflow"
  ]
}
---

## Eine Anfrage prüfen {#moderate-feedback}

Projektmitglieder öffnen den Feedback-Bereich des Projekts und wählen eine Anfrage aus der Prüfliste oder Übersicht. Lesen Sie den ursprünglichen Beitrag, seine öffentliche oder private Sichtbarkeit, den Prüfstatus und mögliche Moderations- oder Duplikatvorschläge. Sie können den kanonischen Titel und Text präzisieren; die ursprünglich eingereichten Texte bleiben erhalten. Weisen Sie Kategorien und einen geeigneten öffentlichen Status zu. Spam erscheint niemals auf dem öffentlichen Board. Eine private Anfrage bleibt etwas anderes als eine öffentliche Anfrage, die nur auf Prüfung wartet.

Eine optionale Übersetzung steht für das Team neben dem Ausgangstext; das öffentliche Board behält das Feedback in seiner ursprünglichen Sprache. Prüfen Sie KI-Klassifizierungen, bevor Sie sich darauf verlassen. Ist ein Beitrag mit einem Issue verknüpft, bestimmt dieses Issue seinen Status; der Status lässt sich dann nicht unabhängig ändern.


## Notizen und öffentliche Antworten {#responses}

Wählen Sie für Teamnotizen die interne Diskussion. Öffentliche Antworten sind für Besucher sichtbar; prüfen Sie die Sichtbarkeit vor dem Absenden. Antworten übernehmen die Sichtbarkeit ihres Threads. Eine interne Auswahl im Eingabefeld macht eine Antwort in einem öffentlichen Thread daher nicht privat. Öffentliche Numo-Antworten brauchen eine ausdrückliche Aufforderung; eine Numo-Erwähnung in einem öffentlichen Kommentar löst keine automatische Antwort aus.

Teammitglieder können öffentliche Kommentare zur Moderation löschen. Bearbeiten darf einen Kommentar nur sein Autor; das Team schreibt Besuchertexte niemals um. Bei internen Kommentaren gelten weiterhin die dem Autor vorbehaltenen Regeln. Öffnen Sie das Board nach einer öffentlichen Antwort oder Moderationsaktion abgemeldet, um die gewünschte Sichtbarkeit zu bestätigen.

![Feedback-Detail mit öffentlicher Teamantwort und interner Notiz.](/documentation/de/moderate-feedback-workflow.png)
