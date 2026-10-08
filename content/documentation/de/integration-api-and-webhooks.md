---
{
  "id": "integration-api-and-webhooks",
  "locale": "de",
  "title": "Tickets oder Feedback erstellen und signierte Webhooks empfangen",
  "summary": "Eigentümer erstellen Integrationen in Projekteinstellungen.",
  "topic": "Technische Grundlagen",
  "type": "tutorial",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/api/v1/feedback/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "integration-troubleshooting",
    "mcp-tool-reference"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "integration-api-and-webhooks-flow",
      "kind": "diagram",
      "src": "/documentation/de/integration-api-and-webhooks-flow.svg",
      "alt": "Diagramm: Server hält Projektintegrationsschlüssel. POST Tickets oder Feedback mit passender Art. Eigentümer wählt Webhookziel für Tickets. Empfänger prüft Rohkörper-HMAC und Zustell-UUID.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Server hält Projektintegrationsschlüssel. POST Tickets oder Feedback mit passender Art. Eigentümer wählt Webhookziel für Tickets. Empfänger prüft Rohkörper-HMAC und Zustell-UUID.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "integration-api-and-webhooks-flow"
  ]
}
---

## Tickets oder Feedback erstellen und signierte Webhooks empfangen {#integration-api-and-webhooks}

Eigentümer erstellen Integrationen in Projekteinstellungen. issues erzeugt interne Arbeit in Triage, feedback Nutzerbedarfe mit Stimmen/öffentlichem Status. Der Klartextschlüssel mdy_ erscheint einmal. Speichern Sie ihn nur serverseitig als MINDDY_API_KEY beziehungsweise MINDDY_FEEDBACK_KEY, nie im Browser, Git oder geteilten Logs. Widerruf ist endgültig; unbekannte und widerrufene Schlüssel ergeben 401 invalid_api_key. Schlüssel gehören zum Projekt und können die andere Endpunktfamilie nicht aufrufen (403 wrong_key_kind).


![Diagramm: Server hält Projektintegrationsschlüssel. POST Tickets oder Feedback mit passender Art. Eigentümer wählt Webhookziel für Tickets. Empfänger prüft Rohkörper-HMAC und Zustell-UUID.](/documentation/de/integration-api-and-webhooks-flow.svg)

## Korrekte Felder senden {#send}

GET /api/v1/issues/options liefert Kategorien und Prioritäts-/Aufwandswerte. POST /api/v1/issues nimmt nicht leeren Titel, optional Markdownbeschreibung, Priorität, Aufwand und Kategorien an. Neue Arbeit landet immer in Triage; Status, Zuständiger und Parent sind extern nicht setzbar. Grenzen: Titel 500 Zeichen, Beschreibung 65.536, höchstens 50 Kategorie-IDs. 201 liefert id, number, identifier und status. POST /api/v1/feedback benötigt title und user.external_id und/oder user.email; user.name und body sind optional. analyze ist boolean mit Standard true. false deaktiviert Moderation, Kategorisierung und Duplikatzusammenführung gemeinsam und veröffentlicht unverändert; die Zeichenfolge "false" wird abgelehnt. Prüfen Sie review_state und gewährleisten Sie Identität durch Ihren Server.

```bash
curl --fail-with-body --request POST "$MINDDY_ORIGIN/api/v1/issues" \
  --header "Authorization: Bearer $MINDDY_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{"title":"Demobericht","description":"Mit Beispieldaten reproduzieren","priority":"low","effort":"s"}'
```

## Ereignisse prüfen und deduplizieren {#receive}

issues kann issue.created, issue.status_changed und issue.updated senden. Ein neues Webhookziel muss der Projekteigentümer wählen; Agenten dürfen bestehende Ereignisse/Umfang einstellen oder deaktivieren, keine neuen Ausgabekanäle anlegen. integration umfasst nur Tickets dieses Schlüssels, all jedes Projektticket. Prüfen Sie X-Minddy-Signature als sha256= plus HMAC-SHA256 der unveränderten Empfangsbytes mit dem kleingeschriebenen SHA-256-Hexdigest des API-Schlüssels als HMAC-Schlüssel. Vergleichen Sie zeitkonstant vor Vertrauen. Nicht vorher JSON parsen und neu serialisieren. X-Minddy-Delivery entspricht delivery_id; deduplizieren Sie nach UUID.

## Fehler und Grenzen behandeln {#limits}

Zustellung ist best effort: fünf Sekunden Timeout und ein sofortiger Versuch nach Netzwerkfehler oder 5xx, danach endgültige Verwerfung. Duplikate und andere Reihenfolge sind möglich. Speichern Sie geprüfte Daten, antworten Sie schnell 2xx und verarbeiten Sie später. issue.updated bündelt Änderungen; description/plan nennen Felder ohne Werte. Prüfen Sie letzten Status in Einstellungen. Beachten Sie bei 429 Retry-After. Validierung ergibt 422, ausgeschöpftes Ticketkontingent endgültig 403 issue_limit_reached. Ein Erstellungs-Timeout kann erfolgreich gewesen sein; prüfen Sie vor Wiederholung. Feedbackvote verwendet POST `/api/v1/feedback/<post_id>/vote` und ist je Identität idempotent.
