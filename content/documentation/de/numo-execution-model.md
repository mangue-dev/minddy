---
{
  "id": "numo-execution-model",
  "locale": "de",
  "title": "Dauerhafte Numo-Turns und delegierte Arbeit verstehen",
  "summary": "Interaktive Nachrichten, Kontextaktionen und Routinen gelangen in Numo-Konversationen.",
  "topic": "Technische Grundlagen",
  "type": "explanation",
  "audiences": [
    "integrator",
    "operator"
  ],
  "workflows": [
    "T05"
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
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "content/knowledge/agents-and-mcp.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "mcp-tool-reference",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/de/numo-execution-model-flow.svg",
      "alt": "Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Bei Bedarf aktuellen Codeworker abwarten. Ereignisse wiedergeben; unklare Writes klären.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Bei Bedarf aktuellen Codeworker abwarten. Ereignisse wiedergeben; unklare Writes klären.",
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
    "numo-execution-model-flow"
  ]
}
---

## Dauerhafte Numo-Turns und delegierte Arbeit verstehen {#numo-execution-model}

Interaktive Nachrichten, Kontextaktionen und Routinen gelangen in Numo-Konversationen. Gesprächsmodell und Reasoning werden im Eingabefeld gewählt; delegierte Codearbeit nutzt die Standardwerte des Kontos für Codemodell und Reasoning. Direkte Minddy-Werkzeuge benötigen kein Repository. Codearbeit öffnet eine Serversandbox für das verknüpfte Repository nur bei Bedarf. Eine Routine erzeugt eine neue Konversation mit gespeicherter Anweisung und Eigentümer-/Projektkontext. Eine Desktopsitzung muss dafür nicht geöffnet bleiben.


![Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Bei Bedarf aktuellen Codeworker abwarten. Ereignisse wiedergeben; unklare Writes klären.](/documentation/de/numo-execution-model-flow.svg)

## Ausführung und Anzeige trennen {#state}

Eine Absicht wird mit Anfrage-UUID und Nachricht als dauerhafter Turn gespeichert. Zustände gehen von queued zu running und dann completed, waiting_input oder waiting_work; stopping/stopped und retryable/failed kennzeichnen Unterbrechung und Fehler. SSE zeigt persistierte Aktivität, steuert aber nicht Ausführung. Neuverbindung liest gespeicherte Nachrichten/Ereignisse nach ihrer Sequenz. Workerabschluss setzt nur den auf diesen Lauf wartenden Parent fort; doppelte und veraltete Ereignisse erzeugen keine zweite Aufgabe. Projektkontext ist kein Zugriff: Ein privater Chat bleibt privat.

## Unklare Änderungen behandeln {#mutations}

Vor Mutation speichert das System Vorgang und Checkpoint. Abgeschlossene Ergebnisse werden wiederverwendet. Unterbrochene Lesevorgänge dürfen wiederholt werden; Mutationen mit unklarem Ausgang gehen nach reconciling ohne automatische Wiederholung. Prüfen Sie das echte Ziel vor erneutem externem Schreiben. Routineverbindungen und Budget unterliegen Eigentum und Kostenschutz; andere Mitglieder können keine persönlichen MCP-Zugänge des bisherigen Eigentümers ausleihen. Ein gestoppter Parent unterbricht aktive Delegation, aber eine schon gesendete externe Aktion kann noch enden.
