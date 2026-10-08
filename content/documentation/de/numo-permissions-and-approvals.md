---
{
  "id": "numo-permissions-and-approvals",
  "locale": "de",
  "title": "Numos Berechtigungen verstehen",
  "summary": "Projektzugriff, persönliche Zugangsdaten und ausdrückliche Freigaben für öffentliche Antworten unterscheiden.",
  "topic": "Numo und Integrationen",
  "type": "explanation",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "N02"
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
      "content/knowledge/settings-and-data.md",
      "content/knowledge/agents-and-mcp.md",
      "lib/server/assistant/tools.ts"
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
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/de/numo-permissions-and-approvals-workflow.png",
      "alt": "Numo-Berechtigungsmatrix für Projektaktionen, persönliche Verbindungen und Routinen.",
      "caption": "Projektzugriff und ausdrückliche Aufträge begrenzen Numo-Aktionen. Externe Inhalte können keine Berechtigung erteilen.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-permissions-and-approvals-workflow"
  ]
}
---

## Rechte des aufrufenden Kontos {#numo-permissions-and-approvals}
Numo handelt innerhalb der Rechte des aktuellen Benutzers. Ein Chat-Auftrag gibt Mitgliedern keinen Zugriff auf Eigentümereinstellungen. Eigentümer verwalten Mitglieder, Integrationen, Repository-Verknüpfungen und Feedback-Einstellungen. Persönliche Einstellungen gehören zum aktuellen Konto.

Numo kann unterstützte Kontopräferenzen und für den Eigentümer freigegebene Projekteinstellungen ändern. Anbieterzugangsdaten, Git-Verbindungen, Zwei-Faktor-Authentifizierung und Avatar-Dateien richten Sie selbst ein. Modell und Denkintensität des Code-Workers ändern Sie ausschließlich in den KI-Kontoeinstellungen.

## Die Aktion freigeben {#authorization}
Beschreiben Sie Änderung und Umfang. Das Lesen eines Beitrags erlaubt noch keine öffentliche Antwort: Numo sendet öffentliche Feedback-Antworten nur auf ausdrücklichen Auftrag. Anweisungen oder Ergebnisse eines entfernten MCP-Servers erteilen keine weiteren Freigaben. Verbinden Sie nur Dienste, denen Sie die vorgesehenen Informationen und Aktionen anvertrauen.

Eine Anfrage kann einen externen Anbieter erreichen. Das Deaktivieren seiner Verbindung verhindert neue Aufrufe, ruft gesendete aber nicht zurück. Prüfen Sie Schreibaktionen nach einem Timeout beim Empfänger, bevor Sie sie wiederholen.

## Persönlicher und geplanter Kontext {#context}
Gespräche können nicht die persönlichen MCP-Verbindungen anderer Mitglieder nutzen. Projektroutinen verwenden Verbindungen und KI-Budget des Eigentümers. Nach einem Eigentümerwechsel starten Sie einen neuen Durchlauf unter dem aktuellen Eigentümer. Alte Durchläufe dürfen frühere Zugangsdaten nicht weiter nutzen. Eine Server-Sandbox erbt weder lokale Dateien noch persönliche Desktop-Sitzungen.

![Numo-Berechtigungsmatrix für Projektaktionen, persönliche Verbindungen und Routinen.](/documentation/de/numo-permissions-and-approvals-workflow.png)
