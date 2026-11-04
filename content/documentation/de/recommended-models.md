---
{
  "id": "recommended-models",
  "locale": "de",
  "title": "Empfohlene Modellkonfiguration",
  "summary": "Eine Instanz mit der KI-Modellkonfiguration von minddy Cloud starten.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-04",
  "compatibility": {
    "version": "MIN-829 instance administration",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/api/recommended-models/route.ts",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "components/admin/admin-models-dashboard.tsx",
      "lib/server/assistant/admin-tools.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-04"
  },
  "related": [
    "instance-administration",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Die empfohlene Modellkonfiguration importieren"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Mit der Konfiguration von minddy Cloud beginnen {#recommended-models}

minddy Cloud veröffentlicht die KI-Modellkonfiguration, die es verwendet, immer aktuell: [lade die empfohlene Konfiguration herunter](https://www.minddy.app/api/recommended-models?download=1). Die Datei nutzt das versionierte Format von **Exportieren** im Admin-Tab **Modelle** (`minddy.instance-models`): Standardmodelle der Kategorien, Modelle der Aufgaben, Routing-Kürzel, Reasoning-Stufe, empfohlene Modelle und Anbieter-Standards für persönliche Schlüssel. Sie enthält weder Schlüssel noch Konten noch Nutzung.

## Auf deiner Instanz importieren {#import}

Lade die Datei herunter, öffne **Modelle** im Admin-Dashboard deiner Instanz, wähle **Importieren** und wähle die Datei aus. Jede Änderung wird aufgelistet, bevor etwas geschrieben wird; **Übernehmen** schreibt alle oder keine, wenn ein Wert abgelehnt wird, zum Beispiel ein Entscheidungsmodell, das dein Anbieter nicht bereitstellt. Einstellungen, die die Datei nicht enthält, kehren zu ihrem Standard zurück. Eine Datei aus einer neueren minddy-Version wird abgelehnt, bis deine Instanz aktualisiert ist. Du kannst die Datei auch in einer Numo-Unterhaltung aus einer Administratorsitzung anhängen und Numo bitten, sie zu importieren: Numo zeigt dieselbe Liste der Änderungen und lässt dich bestätigen. Siehe [Instanzverwaltung](/docs/instance-administration#models-file).

## Deine eigene Konfiguration veröffentlichen {#publish}

Eine selbst gehostete Instanz veröffentlicht standardmäßig nichts. Setze `MINDDY_PUBLISH_MODEL_CONFIG=1`, um ihre Konfiguration unter `/api/recommended-models` bereitzustellen, etwa um mehrere Instanzen gleich einzurichten. Die Datei ist öffentlich: Sie nennt nur Modelle und wie sie bereitgestellt werden.
