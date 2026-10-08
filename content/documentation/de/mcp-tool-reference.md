---
{
  "id": "mcp-tool-reference",
  "locale": "de",
  "title": "Minddy MCP nutzen und aktuelle Werkzeuge entdecken",
  "summary": "Minddy bietet /api/mcp mit Streamable HTTP, zustandslosen Werkzeugen und OAuth 2.1.",
  "topic": "Technische Grundlagen",
  "type": "reference",
  "audiences": [
    "integrator"
  ],
  "workflows": [
    "T06"
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
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source and final correction review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and final correction review)",
    "date": "2026-10-08"
  },
  "related": [
    "numo-execution-model",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Minddy MCP nutzen und aktuelle Werkzeuge entdecken {#mcp-tool-reference}

Minddy bietet /api/mcp mit Streamable HTTP, zustandslosen Werkzeugen und OAuth 2.1. Verbinden Sie Ihr Konto durch Browserzustimmung; alte statische mdyk_-Schlüssel gelten nicht. Starten Sie minddy_list_projects für zugängliche Projekt-UUIDs und lesen Sie Schemas des verbundenen Servers. /llms-full.txt wird daraus erzeugt und nennt genaue aktuelle Parameter. Erraten Sie Werkzeuge nicht anhand alter Kopien. Projektwerkzeuge prüfen Zugriff erneut und geben stabile Fehlercodes zurück.

## Vor Planänderungen lesen {#issue-plans}

minddy_get_issue akzeptiert eine Ticket-UUID, eine Ticketkennung wie DEMO-42 oder eine Ticketnummer; project_id wird separat angegeben. plan_tasks liefert nullbasierte task_index-Werte. minddy_update_plan_task nimmt tasks mit pending, in_progress, completed oder cancelled an; ein ungültiger Index lehnt den ganzen Satz ab. Ergänzen Sie mit minddy_append_to_plan und ändern Sie Passagen mit minddy_edit_issue_text sowie eindeutigen exakten old_string/new_string. Lesen Sie bei veralteter Passage neu. Gesamtersatz kann fremden Fortschritt überschreiben. Fragen unter ## Questions zählen nicht als Aufgaben.

## Versionen und Eigentum beachten {#pages-and-routines}

minddy_list_pages zeigt Hierarchie, minddy_search_pages Textausschnitte und minddy_get_page vollständiges Markdown, Kommentare und Datenbankwerte. Verwenden Sie Teiländerungen und aktuelle Versionsguards bei Gesamtersatz. Erhalten Sie Datei-/Bild-URLs exakt. minddy_create_page mit database=true erstellt Datenbanken; minddy_update_page_database verlangt Revision für Schema, vorherigen Wert für Zellen und Vorschau-/Anwendungstokens für Konvertierung. Eigentümerwerkzeuge erstellen, pausieren, verschieben und entfernen Routinen. Lesen Sie zuerst vorhandene Routinen gegen Duplikate. minddy_add_resource begrenzt Dateien auf 10 MB; Seitenwerkzeuge erfinden keine URLs.

## Mit einem Beispiel überprüfen {#example}

Das bereinigte Beispiel ändert die erste Aufgabe eines zuvor gelesenen Plans. Ersetzen Sie Projekt-UUID und Ticket durch entdeckte Werte; task_index muss aus der letzten Lektüre stammen. Prüfen Sie zurückgegebene plan_tasks und plan_progress. Bei Zugriffsfehlern prüfen Sie Konto/Projekt, bei veraltetem Konflikt lesen Sie erneut und ändern nur das Gewünschte. Wiederholen Sie unklare externe Mutationen nicht vor Ergebniskontrolle.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```
