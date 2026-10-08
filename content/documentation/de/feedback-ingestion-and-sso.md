---
{
  "id": "feedback-ingestion-and-sso",
  "locale": "de",
  "title": "Feedback-Eingang und Besucher-SSO verbinden",
  "summary": "Integrationsschlüssel serverseitig halten und kurzlebige Identitäten mit separatem Board-Geheimnis signieren.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/integration-contract.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts"
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
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/de/feedback-ingestion-and-sso-workflow.png",
      "alt": "Getrennte Abläufe für Backend-Erfassung und Browser-SSO mit unterschiedlichen Geheimnissen.",
      "caption": "Der Erfassungsschlüssel authentifiziert Serveraufrufe. Das Board-SSO-Geheimnis signiert ein kurzlebiges, einmaliges Besuchertoken.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

## Vom Backend senden {#feedback-ingestion-and-sso}

Der Projektinhaber erstellt einen Feedback-Integrationsschlüssel in den Projekteinstellungen. Speichern Sie den einmalig angezeigten Schlüssel als `MINDDY_FEEDBACK_KEY` in der geheimen Backend-Konfiguration. Betten Sie ihn niemals in Browsercode ein. Setzen Sie `MINDDY_ORIGIN` auf den Ursprung der Zielinstanz ohne abschließenden Schrägstrich.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Lieferdatum anzeigen","body":"Unser Support braucht das geplante Datum.","user":{"external_id":"demo-user-1","name":"Demo-Leser"}}'
```

Geben Sie einen nicht leeren Titel mit höchstens 200 Zeichen, einen optionalen Text mit höchstens 10.000 Zeichen sowie `user.external_id` und/oder `user.email` an. Die externe ID erlaubt 255 Zeichen, die E-Mail-Adresse 254 und der Name 200. Ihr Backend bestätigt die Identität; anonyme Erfassung wird abgelehnt. Ein Erfolg liefert HTTP 201 mit `id`, `status`, `review_state`, Stimmen und Pseudonym. Das Board muss für die Erfassung nicht aktiviert sein. `analyze` ist standardmäßig true. false überspringt Moderation, Kategorisierung und Zusammenführung für diesen Beitrag und setzt den Prüfstatus ohne Wartezeit auf `published`. Dieser Prüfstatus aktiviert das Board nicht und umgeht weder Sichtbarkeitsregeln noch den Spamstatus. Die API erstellt Beiträge standardmäßig öffentlich und akzeptiert keinen Parameter für private Sichtbarkeit.


## Stimmen, Fehler und Webhooks {#errors}

Senden Sie `{"user":{"external_id":"demo-user-1"}}` per POST an `/api/v1/feedback/<id>/vote` mit denselben Headern. Eine Identität erhält eine Stimme; eine wiederholte Abstimmung ist idempotent. Ein zusammengeführter Beitrag liefert 409 `post_merged` mit seinem kanonischen Ziel.

Für die Erstellung sind 20 Aufrufe pro Minute und Schlüssel erlaubt, für Stimmen 60. Beachten Sie `Retry-After` bei 429. Prüfen Sie vor einem neuen Versuch 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` und Feldfehler mit 422. Die Erstellung ist keine idempotente Aktualisierung: Kontrollieren Sie bei verlorener Antwort zunächst den Feedback-Eingang des Teams. Feedback-Schlüssel bieten keinen ausgehenden Issue-Webhook. Eine separat konfigurierte Issue-Integration unterstützt diesen Kanal mit eigener Signatur und einem Zustellvertrag ohne Garantie.


## Besucher per SSO identifizieren {#sso}

Aktivieren Sie als Inhaber das Board und konfigurieren Sie dessen separates SSO-Geheimnis. Ihr Backend signiert ein HS256-JWT mit stabilem `sub`, erforderlichem `exp` und optionaler E-Mail-Adresse sowie optionalem Namen. Verwenden Sie höchstens 600 Sekunden Gültigkeit und ein eindeutiges `jti`; die Prüfung toleriert 60 Sekunden Uhrabweichung. Leiten Sie sofort zu `/f/<board-token>?sso=<jwt>` weiter. Tokens werden pro Board nur einmal verbraucht; eine Wiederholung erfordert einen frisch signierten Token. Verwenden Sie niemals den Erfassungsschlüssel als SSO-Geheimnis. Halten Sie Tokens aus Logs und geteilten Screenshots heraus.

Prüfen Sie, dass der Besucher Mein Feedback mit der vorgesehenen Identität öffnet. Ein abgelaufener Token erfordert eine neue Weiterleitung. Ist das SSO-Geheimnis kompromittiert, erneuern Sie es über die Bestätigung im Board und aktualisieren Sie das Backend zugleich. Der E-Mail-Code bleibt die Alternative, wenn SSO nicht verfügbar ist.

![Getrennte Abläufe für Backend-Erfassung und Browser-SSO mit unterschiedlichen Geheimnissen.](/documentation/de/feedback-ingestion-and-sso-workflow.png)
