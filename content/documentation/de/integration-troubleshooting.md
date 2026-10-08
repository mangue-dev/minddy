---
{
  "id": "integration-troubleshooting",
  "locale": "de",
  "title": "Fehlerbehebung bei Verbindungen",
  "summary": "Minddy MCP verbindet externe Assistenten mit Minddy; persönliche MCP-Verbindungen lassen Numo fremde Server aufrufen.",
  "topic": "Technische Grundlagen",
  "type": "troubleshooting",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "OAuth-, MCP-, Webhook- oder Git-Verbindung wiederherstellen"
  ],
  "figures": [
    {
      "id": "integration-troubleshooting-flow",
      "kind": "screenshot",
      "src": "/documentation/de/integration-troubleshooting-error.png",
      "alt": "Ladefehler der MCP-Verbindungen mit der Schaltfläche Erneut versuchen.",
      "caption": "Erneut versuchen lädt die Verbindungen neu, sobald das Netzwerk wieder verfügbar ist.",
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
    "integration-troubleshooting-flow"
  ]
}
---

## OAuth-, MCP-, Webhook- oder Git-Verbindung wiederherstellen {#integration-troubleshooting}

Minddy MCP verbindet externe Assistenten mit Minddy; persönliche MCP-Verbindungen lassen Numo fremde Server aufrufen. Kontotabs und Zugangsdaten unterscheiden sich. Prüfen Sie persönliche Verbindungen in Einstellungen und verwenden Sie Test/Neuverbindung. OAuth-Discovery, dynamische Registrierung, PKCE und Refresh sind möglich, aber Katalogeinträge umgehen weder Anbieterfreigabe, Entwicklervorschau noch registrierte Apps. Prüfen Sie aktuelle Voraussetzungen, bevor Sie einen Minddy-Fehler annehmen.


![Ladefehler der MCP-Verbindungen mit der Schaltfläche Erneut versuchen.](/documentation/de/integration-troubleshooting-error.png)

## Mit passenden Rechten neu verbinden {#oauth}

Registrieren Sie den exakt angezeigten Callback in der Anbieter-App, wenn bestehende Clientzugänge erforderlich sind. Desktop-OAuth öffnet den Systembrowser und kehrt zurück. Entfernte Verbindungen benötigen öffentliches HTTPS; lokale Befehle und private Netzserver sind ausgeschlossen. Bearertokens und Geheimnisse gehören in Auth/Header, nicht in URLs. URL-Wechsel löscht gespeicherte Zugangsdaten und Header. Deaktivieren/Entfernen stoppt neue Aufrufe, gesendete können noch enden. Routinen nutzen den aktuellen Projekteigentümer; Eigentümerwechsel leiht keine bisherigen persönlichen Zugänge.

## Vor Wiederholung das Ergebnis prüfen {#webhooks}

Entfernte MCP-Aufrufe haben 30 Sekunden Deadline, 1 MiB Transport- und 64 KB Ergebnisgrenze. Timeout beweist keinen Mutationsfehler. Prüfen Sie das Ziel vor Wiederholung. Bei API-401 prüfen Sie Instanz, Art und Widerruf ohne Schlüsselausgabe; falsche Art ergibt 403. Bei Webhooks prüfen Sie letzten Status, öffentliches Ziel, Rohkörper-HMAC und delivery_id-Deduplizierung. Verworfene Zustellungen haben keine dauerhafte Wiederholungswarteschlange. Erhalten Sie kontrollierte Codes und Zeiten ohne private Inhalte oder Zugangsdaten.

## Rechte und Synchronisierung prüfen {#git}

Gitadapter zielen auf github.com und gitlab.com. Prüfen Sie verknüpftes Repository, Installationszugriff und Verbindungskanal. GitHub-Synchronisierung benötigt Issues lesen/schreiben und Webhookabonnements für Issues, Issue comments und Issue dependencies; bestehende Installationen müssen neuen Rechten zustimmen. Ältere Payload-Zeitstempel überschreiben keine neueren lokalen Änderungen. Remote-IDs verhindern doppelte Zustellung. Inline-Anhang-URLs bleiben Forgelinks statt kopierter Bytes. Prüfen Sie lokalen und entfernten Zustand vor Neuverbindung oder Schreibwiederholung und teilen Sie nur bereinigte Diagnosen.
