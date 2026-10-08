---
{
  "id": "submit-and-follow-feedback",
  "locale": "de",
  "title": "Feedback einreichen, abstimmen und verfolgen",
  "summary": "Am Board identifizieren, Sichtbarkeit wählen und eigene Beiträge sowie Stimmen finden.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "visitor"
  ],
  "workflows": [
    "F02"
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
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
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
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/submit-and-follow-feedback-workflow.png",
      "alt": "Feedback-Formular für Besucher mit Titel, Beschreibung und aktivierter öffentlicher Sichtbarkeit.",
      "caption": "Ein angemeldeter Besucher reicht einen Bedarf ein und bestimmt die Sichtbarkeit. Das Beispiel wurde tatsächlich bei deaktivierter automatischer Prüfung eingereicht.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "submit-and-follow-feedback-workflow"
  ]
}
---

## Identifizieren und einreichen {#submit-and-follow-feedback}

Öffnen Sie die öffentliche Board-URL. Öffentliche Beiträge können Sie ohne Minddy-Konto lesen. Zum Einreichen, Abstimmen oder Kommentieren identifizieren Sie sich über den E-Mail-Code des Boards oder den SSO-Link des Produkts. Die Zustellung des Codes hängt vom E-Mail-Dienst der Instanz ab. Ein Code gilt zehn Minuten und erlaubt fünf Versuche; warten Sie mindestens sechzig Sekunden, bevor Sie einen neuen anfordern. Geben Sie den Code niemals weiter.

Suchen Sie vor einer Einreichung nach vorhandenen Anfragen. Schreiben Sie einen konkreten Titel und beschreiben Sie den Bedarf und seinen Kontext. Titel erlauben 200 Zeichen, der Text 10.000. Die öffentliche Option ist standardmäßig ausgewählt; deaktivieren Sie sie, um die Anfrage privat an das Team zu senden. Prüfen Sie den Text vor dem Absenden auf Geheimnisse. Eine optionale Moderation kann die Anfrage zunächst zurückhalten, bevor sie öffentlich erscheint.


## Abstimmen, kommentieren und verfolgen {#follow}

Stimmen Sie für eine vorhandene Anfrage, statt sie zu duplizieren. Ihre Identität hat eine Stimme pro Beitrag. Kommentare erfordern eine Identifikation und aktivierte öffentliche Kommentare; ein öffentlicher Kommentar darf 5.000 Zeichen enthalten. Sie können Ihren eigenen Kommentar entfernen; das Team kann öffentliche Kommentare moderieren.

Öffnen Sie Mein Feedback, um Ihre Einreichungen und Stimmen im Rahmen Ihrer aktuellen Identität zu finden. Lesen Sie dort oder in der Anfrage den öffentlichen Status und die Teamantworten. Interne Teamnotizen sind keine öffentlichen Antworten. Ist das SSO abgelaufen, kehren Sie über einen neuen Produktlink zurück. Ein anderer Browser oder eine andere Identität kann Ihre persönliche Liste verändern.

![Feedback-Formular für Besucher mit Titel, Beschreibung und aktivierter öffentlicher Sichtbarkeit.](/documentation/de/submit-and-follow-feedback-workflow.png)
