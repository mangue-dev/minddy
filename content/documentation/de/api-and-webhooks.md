---
{
  "id": "api-and-webhooks",
  "locale": "de",
  "title": "API, Webhooks und Feedback-SSO",
  "summary": "Erstellen Sie Tickets oder Feedback über die Integrations-API, prüfen Sie signierte Webhooks und authentifizieren Sie Feedback-Besucher mit SSO.",
  "topic": "Technische Grundlagen",
  "type": "guide",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07",
    "F06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 9,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/feedback/integration-contract.ts",
      "lib/server/integration-auth.ts",
      "lib/server/integrations.ts",
      "app/api/v1/issues/route.ts",
      "app/api/v1/feedback/route.ts",
      "app/api/v1/feedback/[id]/vote/route.ts",
      "lib/feedback/sso-jwt.ts",
      "app/f/[token]/sso/route.ts",
      "lib/server/feedback/posts.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/project-integrations.tsx"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "integration-troubleshooting",
    "minddy-mcp"
  ],
  "aliases": [
    "integration-api-and-webhooks",
    "feedback-ingestion-and-sso"
  ],
  "tags": [
    "Tickets oder Feedback erstellen und signierte Webhooks empfangen",
    "Feedback-Eingang und Besucher-SSO verbinden"
  ],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/de/integration-api-and-webhooks-flow.svg",
      "alt": "Diagramm: Server hält Projektintegrationsschlüssel. POST Tickets oder Feedback mit passender Art. Eigentümer wählt Webhookziel für Tickets. Empfänger prüft Rohkörper-HMAC und Zustell-UUID.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Server hält Projektintegrationsschlüssel. `POST` Tickets oder Feedback mit passender Art. Eigentümer wählt Webhookziel für Tickets. Empfänger prüft Rohkörper-HMAC und Zustell-UUID.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Server hält Projektintegrationsschlüssel"
          },
          {
            "title": "`POST` Tickets oder Feedback mit passender Art"
          },
          {
            "title": "Eigentümer wählt Webhookziel für Tickets"
          },
          {
            "title": "Empfänger prüft Rohkörper-HMAC und Zustell-UUID"
          }
        ]
      }
    },
    {
      "id": "feedback-ingestion-and-sso-workflow",
      "kind": "diagram",
      "src": "/documentation/de/feedback-ingestion-and-sso-workflow.svg",
      "alt": "Getrennte Abläufe für Backend-Erfassung und Browser-SSO mit unterschiedlichen Geheimnissen.",
      "caption": "Der Erfassungsschlüssel authentifiziert Serveraufrufe. Das Board-SSO-Geheimnis signiert ein kurzlebiges, einmaliges Besuchertoken.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        760
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "columns",
        "title": "Zwei getrennte Feedback-Abläufe",
        "columns": [
          {
            "title": "Serverseitige Erfassung",
            "items": [
              "Backend verwahrt den Feedback-Schlüssel",
              "`POST /api/v1/feedback` mit Bearer-Schlüssel und stabiler Identität",
              "HTTP 201: gespeicherter Beitrag im Team-Eingang; Board darf deaktiviert sein"
            ]
          },
          {
            "title": "SSO für Browserbesucher",
            "items": [
              "Backend verwahrt das separate Board-SSO-Geheimnis",
              "`HS256`-JWT signieren: `sub`, `exp`, eindeutige `jti`; Gültigkeit ≤ 600 s",
              "Browser zu `/f/<board-token>?sso=<jwt>` umleiten",
              "Einmaliges Token erstellt Besuchersitzung; Mein Feedback öffnen"
            ]
          }
        ],
        "note": "Erfassungsschlüssel und SSO-Geheimnis niemals an Browsercode senden. Uhrtoleranz: 60 s."
      }
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow",
    "feedback-ingestion-and-sso-workflow"
  ]
}
---

Die Integrations-API nimmt Tickets oder Feedback über projektgebundene Schlüssel von Ihrem Server entgegen. Ticketintegrationen können signierte Webhooks senden; Besucher-SSO verwendet ein separates Board-Geheimnis. Prüfen Sie Endpunkt, Identität und Zustellung. Schlüssel bleiben auf dem Server, SSO-Weiterleitungstokens gehören nicht in geteilte Logs.

## Tickets oder Feedback erstellen und signierte Webhooks empfangen {#integration-api-and-webhooks}

Eigentümer erstellen Integrationen mit **Neue Integration** in der Titelzeile von **Projekteinstellungen** → **Integrationen**. `issues` erzeugt interne Arbeit in Triage, `feedback` Nutzerbedarfe mit Stimmen/öffentlichem Status. Der Klartextschlüssel `mdy_` erscheint einmal. Speichern Sie ihn nur serverseitig als `MINDDY_API_KEY` beziehungsweise `MINDDY_FEEDBACK_KEY`, nie im Browser, Git oder geteilten Logs. Jede Integration wird mit Name, Schlüsselpräfix, Erstellungsdatum, letzter Nutzung und einem Badge **Tickets** oder **Feedback** aufgeführt. Zum Widerrufen wählt der Eigentümer **Autorisierung widerrufen** im ⋯-Menü der Integration und bestätigt; sie trägt dann das Badge **Widerrufen** und rückt abgeblendet ans Ende der Liste. Widerruf ist endgültig; unbekannte und widerrufene Schlüssel ergeben 401 `invalid_api_key`. Schlüssel gehören zum Projekt und können die andere Endpunktfamilie nicht aufrufen (403 `wrong_key_kind`). Eine Integration ist keine Person: Sie hat keine Projektrolle und behält die festen Berechtigungen ihrer Art, wenn sich die Rollen der Mitglieder ändern. Leser sehen keine Integrationen.


![Diagramm: Server hält Projektintegrationsschlüssel. POST Tickets oder Feedback mit passender Art. Eigentümer wählt Webhookziel für Tickets. Empfänger prüft Rohkörper-HMAC und Zustell-UUID.](/documentation/de/integration-api-and-webhooks-flow.svg)

### Korrekte Felder senden {#send}

`GET /api/v1/issues/options` liefert Kategorie-IDs und Prioritäts-/Aufwandswerte. Senden Sie anschließend `POST /api/v1/issues` mit einem nicht leeren Titel und optionaler Markdownbeschreibung, Priorität, Aufwand und Kategorien.

| Feld | Grenze |
| --- | --- |
| Titel | 500 Zeichen |
| Beschreibung | 65.536 Zeichen |
| Kategorien | 50 IDs |

Neue Arbeit landet immer in Triage; Status, Zuständiger und Parent sind extern nicht setzbar. 201 liefert `id`, `number`, `identifier` und `status`. Für Feedback-Felder, Identitätsprüfung und Moderation folgen Sie dem [Verfahren zur Feedback-Erfassung](#feedback-ingestion-and-sso).

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Demobericht","description":"Mit Beispieldaten reproduzieren","priority":"low","effort":"s"}'
```

### Ereignisse prüfen und deduplizieren {#receive}

`issues` kann `issue.created`, `issue.status_changed` und `issue.updated` senden. Ein neues Webhookziel muss der Projekteigentümer mit **Webhook konfigurieren…** im ⋯-Menü der Integration wählen. Ist ein Ziel gesetzt, zeigt die Zeile **Webhook** unter der Integration die letzte Lieferung, akzeptiert oder abgelehnt mit Datum, oder **Noch keine Lieferung**. Agenten dürfen bestehende Ereignisse/Umfang einstellen oder deaktivieren, keine neuen Ausgabekanäle anlegen. `integration` umfasst nur Tickets dieses Schlüssels, `all` jedes Projektticket. Prüfen Sie `X-minddy-Signature` als `sha256=` plus HMAC-SHA256 der unveränderten Empfangsbytes mit dem kleingeschriebenen SHA-256-Hexdigest des API-Schlüssels als HMAC-Schlüssel. Vergleichen Sie zeitkonstant vor Vertrauen. Nicht vorher JSON parsen und neu serialisieren. `X-minddy-Delivery` entspricht `delivery_id`; deduplizieren Sie nach UUID.

### Fehler und Grenzen behandeln {#limits}

Zustellung ist best effort: fünf Sekunden Timeout und ein sofortiger Versuch nach Netzwerkfehler oder 5xx, danach endgültige Verwerfung. Duplikate und andere Reihenfolge sind möglich. Speichern Sie geprüfte Daten, antworten Sie schnell 2xx und verarbeiten Sie später. `issue.updated` bündelt Änderungen; `description`/`plan` nennen Felder ohne Werte. Prüfen Sie letzten Status in Einstellungen. Beachten Sie bei 429 `Retry-After`. Validierung ergibt 422, ausgeschöpftes Ticketkontingent endgültig 403 `issue_limit_reached`. Ein Erstellungs-Timeout kann erfolgreich gewesen sein; prüfen Sie vor Wiederholung. Feedbackvote verwendet `POST` `/api/v1/feedback/<post_id>/vote` und ist je Identität idempotent.

## Feedback-Eingang und Besucher-SSO verbinden {#feedback-ingestion-and-sso}

Der Projektinhaber erstellt einen Feedback-Integrationsschlüssel in den Projekteinstellungen. Speichern Sie den einmalig angezeigten Schlüssel als `MINDDY_FEEDBACK_KEY` in der geheimen Backend-Konfiguration. Betten Sie ihn niemals in Browsercode ein. Setzen Sie `MINDDY_ORIGIN` auf den Ursprung der Zielinstanz ohne abschließenden Schrägstrich.

```bash
curl -i "$MINDDY_ORIGIN/api/v1/feedback"   -H "Authorization: Bearer $MINDDY_FEEDBACK_KEY"   -H 'Content-Type: application/json'   --data '{"title":"Lieferdatum anzeigen","body":"Unser Support braucht das geplante Datum.","user":{"external_id":"demo-user-1","name":"Demo-Leser"}}'
```

Geben Sie einen nicht leeren Titel mit höchstens 200 Zeichen, einen optionalen Text mit höchstens 10.000 Zeichen sowie `user.external_id` und/oder `user.email` an. `user.name` ist optional. Die externe ID erlaubt 255 Zeichen, die E-Mail-Adresse 254 und der Name 200. Ihr Backend bestätigt die Identität; anonyme Erfassung wird abgelehnt. Ein Erfolg liefert HTTP 201 mit `id`, `status`, `review_state`, Stimmen und Pseudonym. Das Board muss für die Erfassung nicht aktiviert sein. `analyze` ist ein boolescher Wert mit Standard `true`; die Zeichenfolge `"false"` wird abgelehnt. `false` überspringt Moderation, Kategorisierung und Duplikatzusammenführung für diesen Beitrag und setzt den Prüfstatus ohne Wartezeit auf `published`. Dieser Prüfstatus aktiviert das Board nicht und umgeht weder Sichtbarkeitsregeln noch den Spamstatus. Die API erstellt Beiträge standardmäßig öffentlich und akzeptiert keinen Parameter für private Sichtbarkeit.

### Stimmen, Fehler und Webhooks {#errors}

Senden Sie `{"user":{"external_id":"demo-user-1"}}` per `POST` an `/api/v1/feedback/<id>/vote` mit denselben Headern. Eine Identität erhält eine Stimme; eine wiederholte Abstimmung ist idempotent. Ein zusammengeführter Beitrag liefert 409 `post_merged` mit seinem kanonischen Ziel.

Für die Erstellung sind 20 Aufrufe pro Minute und Schlüssel erlaubt, für Stimmen 60. Beachten Sie `Retry-After` bei 429. Prüfen Sie vor einem neuen Versuch 401 `invalid_api_key`, 403 `wrong_key_kind`, 400 `invalid_json` und Feldfehler mit 422. Die Erstellung ist keine idempotente Aktualisierung: Kontrollieren Sie bei verlorener Antwort zunächst den Feedback-Eingang des Teams. Feedback-Schlüssel bieten keinen ausgehenden Ticket-Webhook. Eine separat konfigurierte Ticketintegration unterstützt diesen Kanal mit eigener Signatur und einem Zustellvertrag ohne Garantie.

### Besucher per SSO identifizieren {#sso}

Aktivieren Sie als Inhaber das Board und konfigurieren Sie dessen separates SSO-Geheimnis. Ihr Backend signiert ein `HS256`-JWT mit stabilem `sub`, erforderlichem `exp` und optionaler E-Mail-Adresse sowie optionalem Namen. Verwenden Sie höchstens 600 Sekunden Gültigkeit und ein eindeutiges `jti`; die Prüfung toleriert 60 Sekunden Uhrabweichung. Leiten Sie sofort zu `/f/<board-token>?sso=<jwt>` weiter. Tokens werden pro Board nur einmal verbraucht; eine Wiederholung erfordert einen frisch signierten Token. Verwenden Sie niemals den Erfassungsschlüssel als SSO-Geheimnis. Halten Sie Tokens aus Logs und geteilten Screenshots heraus.

Prüfen Sie, dass der Besucher Mein Feedback mit der vorgesehenen Identität öffnet. Ein abgelaufener Token erfordert eine neue Weiterleitung. Ist das SSO-Geheimnis kompromittiert, erneuern Sie es über die Bestätigung im Board und aktualisieren Sie das Backend zugleich. Der E-Mail-Code bleibt die Alternative, wenn SSO nicht verfügbar ist.

![Getrennte Abläufe für Backend-Erfassung und Browser-SSO mit unterschiedlichen Geheimnissen.](/documentation/de/feedback-ingestion-and-sso-workflow.svg)


## Ein Ziel für Feedback wählen {#feedback-objective-default}

Bei einer `feedback`-Integration kann der Eigentümer das Ziel bei der Erstellung wählen oder später in der Zeile **Ziel für neues Feedback** unter der bestehenden Integration in **Projekteinstellungen** → **Integrationen**; diese Auswahl kann auch ein neues Ziel anlegen. Nur aktive Ziele desselben Projekts sind zulässig. Neue Aufrufe von `POST /api/v1/feedback` übernehmen diese Vorgabe, auch mit `analyze: false`; senden Sie `objective_id` nicht im API-Payload. Die 201-Antwort enthält die zugeordnete `objective_id` oder `null`. Änderungen betreffen nur zukünftige Übermittlungen. Eine nicht verfügbare Vorgabe liefert 422 `objective_not_found`: wählen Sie ein aktives Ziel oder entfernen Sie die Vorgabe vor einem erneuten Versuch. Numo leitet bei der Prüfung kein Ziel ab. Die Umwandlung übernimmt Ziel und Kategorien.
