---
{
  "id": "minddy-mcp",
  "locale": "de",
  "title": "Minddy MCP",
  "summary": "Verbinden Sie einen externen Assistenten mit Minddy, steuern Sie den Zugriff und lernen Sie verfügbare MCP-Tools und sichere Änderungsverfahren kennen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/mcp-access-capture-candidates.json",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Einen externen Assistenten mit Minddy MCP verbinden",
    "Minddy MCP nutzen und aktuelle Werkzeuge entdecken"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-workflow.png",
      "alt": "Minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.",
      "caption": "Wähle deinen Client, um dessen Installationsbefehl oder Konfiguration anzuzeigen.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-install-workflow.png",
      "alt": "Codex-Installationsdialog auf der lokalen Instanz.",
      "caption": "Codex-Installationsdialog auf der lokalen Instanz. Verwende den Ursprung deiner eigenen Instanz; der angezeigte Befehl wurde für diese Aufnahme nicht ausgeführt.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "external-minddy-mcp-accesses-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/external-minddy-mcp-accesses-workflow.png",
      "alt": "Liste verbundener Anwendungen ohne aktive Freigabe.",
      "caption": "Prüfe hier die autorisierten Anwendungen. Das Demonstrationskonto hat keine aktive Freigabe; keine Autorisierung oder Widerruf wurde ausgeführt.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow",
    "external-minddy-mcp-accesses-workflow"
  ]
}
---

Minddy MCP gibt einem externen Assistenten Zugriff als Ihr Minddy-Konto, innerhalb Ihrer bestehenden Berechtigungen. Dieser Leitfaden erklärt Verbindung und Widerruf, das Ermitteln der aktuellen Werkzeugschemas sowie Änderungen an Plänen, Seiten und Routinen mit vorheriger Prüfung des aktuellen Zustands.

## Einen externen Assistenten mit Minddy MCP verbinden {#external-minddy-mcp}

Öffnen Sie die öffentliche MCP-Einrichtungsseite Ihrer Instanz und wählen Sie die Client-Anleitung. Nutzen Sie den dort angezeigten Endpunkt mit `/api/mcp`. Bei Self-Hosting verwenden Sie Ihre Instanzadresse statt Cloud. Der Client muss die beschriebene entfernte MCP-Verbindung und OAuth unterstützen.

Melden Sie sich im Browser an und prüfen Sie die Freigabe. Die Verbindung handelt als Ihr Minddy-Konto und erhält keinen Zugriff auf gesperrte Projekte. Beginnen Sie mit dem Lesen eines bereits zugänglichen Tickets und prüfen Sie das zurückgegebene Projekt.

![Minddy-MCP-Clientauswahl mit Claude, Codex und weiteren Assistenten.](/documentation/de/external-minddy-mcp-workflow.png)

### Umfang und Widerruf {#access}

Externe Clients verwenden verfügbare Tools für Tickets, Pläne, Kommentare, Seiten, Feedback, Zyklen, Routinen und Notizbuch innerhalb ihrer Rechte. MCP ist in jedem Cloud-Tarif verfügbar; KI des Clients hängt weiterhin von dessen Einrichtung und Kosten ab.

Der Bereich Minddy MCP in den Kontoeinstellungen zeigt externe Zugriffe und Widerrufsmöglichkeiten. Widerrufen Sie ungenutzte oder nicht mehr vertrauenswürdige Clients. MCP für Numo verbindet dagegen Numo mit anderen Diensten. Kopieren Sie keine Zugriffstoken in Tickets, öffentliche Beiträge oder Screenshots.

![Codex-Installationsdialog auf der lokalen Instanz.](/documentation/de/external-minddy-mcp-install-workflow.png)

![Liste verbundener Anwendungen ohne aktive Freigabe.](/documentation/de/external-minddy-mcp-accesses-workflow.png)

## Minddy MCP nutzen und aktuelle Werkzeuge entdecken {#mcp-tool-reference}

Minddy bietet /api/mcp mit Streamable HTTP, zustandslosen Werkzeugen und OAuth 2.1. Verbinden Sie Ihr Konto durch Browserzustimmung; alte statische mdyk_-Schlüssel gelten nicht. Starten Sie minddy_list_projects für zugängliche Projekt-UUIDs und lesen Sie Schemas des verbundenen Servers. /llms-full.txt wird daraus erzeugt und nennt genaue aktuelle Parameter. Erraten Sie Werkzeuge nicht anhand alter Kopien. Projektwerkzeuge prüfen Zugriff erneut und geben stabile Fehlercodes zurück.

### Vor Planänderungen lesen {#issue-plans}

minddy_get_issue akzeptiert eine Ticket-UUID, eine Ticketkennung wie DEMO-42 oder eine Ticketnummer; project_id wird separat angegeben. plan_tasks liefert nullbasierte task_index-Werte. minddy_update_plan_task nimmt tasks mit pending, in_progress, completed oder cancelled an; ein ungültiger Index lehnt den ganzen Satz ab. Ergänzen Sie mit minddy_append_to_plan und ändern Sie Passagen mit minddy_edit_issue_text sowie eindeutigen exakten old_string/new_string. Lesen Sie bei veralteter Passage neu. Gesamtersatz kann fremden Fortschritt überschreiben. Fragen unter ## Questions zählen nicht als Aufgaben.

### Versionen und Eigentum beachten {#pages-and-routines}

minddy_list_pages zeigt Hierarchie, minddy_search_pages Textausschnitte und minddy_get_page vollständiges Markdown, Kommentare und Datenbankwerte. Verwenden Sie Teiländerungen und aktuelle Versionsguards bei Gesamtersatz. Erhalten Sie Datei-/Bild-URLs exakt. minddy_create_page mit database=true erstellt Datenbanken; minddy_update_page_database verlangt Revision für Schema, vorherigen Wert für Zellen und Vorschau-/Anwendungstokens für Konvertierung. Eigentümerwerkzeuge erstellen, pausieren, verschieben und entfernen Routinen. Lesen Sie zuerst vorhandene Routinen gegen Duplikate. minddy_add_resource begrenzt Dateien auf 10 MB; Seitenwerkzeuge erfinden keine URLs.

### Mit einem Beispiel überprüfen {#example}

Das bereinigte Beispiel ändert die erste Aufgabe eines zuvor gelesenen Plans. Ersetzen Sie Projekt-UUID und Ticket durch entdeckte Werte; task_index muss aus der letzten Lektüre stammen. Prüfen Sie zurückgegebene plan_tasks und plan_progress. Bei Zugriffsfehlern prüfen Sie Konto/Projekt, bei veraltetem Konflikt lesen Sie erneut und ändern nur das Gewünschte. Wiederholen Sie unklare externe Mutationen nicht vor Ergebniskontrolle.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
