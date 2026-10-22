---
{
  "id": "integration-troubleshooting",
  "locale": "de",
  "title": "Fehlerbehebung bei Verbindungen",
  "summary": "minddy MCP verbindet externe Assistenten mit minddy; persönliche MCP-Verbindungen lassen Numo fremde Server aufrufen.",
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
  "revision": 7,
  "sourceRevision": 7,
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
      "content/knowledge/agents-and-mcp.md",
      "docs/github-issue-sync.md",
      "lib/server/integration-auth.ts",
      "lib/mcp-authorization.ts",
      "lib/server/mcp-http.ts",
      "lib/server/mcp-client.ts",
      "lib/server/safe-fetch.ts",
      "app/api/mcp/route.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks",
    "minddy-mcp"
  ],
  "aliases": [],
  "tags": [
    "OAuth-, MCP-, Webhook- oder Git-Verbindung wiederherstellen"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## OAuth-, MCP-, Webhook- oder Git-Verbindung wiederherstellen {#integration-troubleshooting}

minddy MCP verbindet externe Assistenten mit minddy; persönliche MCP-Verbindungen lassen Numo fremde Server aufrufen. Kontotabs und Zugangsdaten unterscheiden sich. Prüfe persönliche Verbindungen in Einstellungen und verwende Test/Neuverbindung. OAuth-Discovery, dynamische Registrierung, PKCE und Refresh sind möglich, aber Katalogeinträge umgehen weder Anbieterfreigabe, Entwicklervorschau noch registrierte Apps. Prüfe aktuelle Voraussetzungen, bevor du einen minddy-Fehler annimmst.


## Mit passenden Rechten neu verbinden {#oauth}

Registriere den exakt angezeigten Callback in der Anbieter-App, wenn bestehende Clientzugänge erforderlich sind. Desktop-OAuth öffnet den Systembrowser und kehrt zurück. Persönliche MCP-Verbindungen von Numo benötigen öffentliches HTTPS; lokale Befehle und private Netzserver sind ausgeschlossen. Für externe Assistenten, die sich mit minddy MCP verbinden, siehe [Netzwerkzugriff auf deine Instanz](/docs/minddy-mcp#network-access). Bearertokens und Geheimnisse gehören in Auth/Header, nicht in URLs. URL-Wechsel löscht gespeicherte Zugangsdaten und Header. Deaktivieren/Entfernen stoppt neue Aufrufe, gesendete können noch enden. Routinen nutzen den aktuellen Projekteigentümer; Eigentümerwechsel leiht keine bisherigen persönlichen Zugänge.

## Vor Wiederholung das Ergebnis prüfen {#webhooks}

Aufrufe von Numo an persönliche MCP-Server haben 30 Sekunden Deadline, 1 MiB Transport- und 64 KB Ergebnisgrenze. Timeout beweist keinen Mutationsfehler. Prüfe das Ziel vor Wiederholung. Bei API-401 prüfst du Instanz, Art und Widerruf ohne Schlüsselausgabe; falsche Art ergibt 403. Bei Webhooks prüfst du letzten Status, öffentliches Ziel, Rohkörper-HMAC und `delivery_id`-Deduplizierung. Verworfene Zustellungen haben keine dauerhafte Wiederholungswarteschlange. Bewahre kontrollierte Codes und Zeiten ohne private Inhalte oder Zugangsdaten.

## Rechte und Synchronisierung prüfen {#git}

Gitadapter zielen auf github.com und gitlab.com. Prüfe verknüpftes Repository, Installationszugriff und Verbindungskanal. GitHub-Synchronisierung benötigt Issues lesen/schreiben und Webhookabonnements für Issues, Issue comments und Issue dependencies; bestehende Installationen müssen neuen Rechten zustimmen. Ältere Payload-Zeitstempel überschreiben keine neueren lokalen Änderungen. Remote-IDs verhindern doppelte Zustellung. Inline-Anhang-URLs bleiben Forgelinks statt kopierter Bytes. Prüfe lokalen und entfernten Zustand vor Neuverbindung oder Schreibwiederholung und teile nur bereinigte Diagnosen.
