---
{
  "id": "ai-keys-and-models",
  "locale": "de",
  "title": "Eigene KI-Schlüssel und Modelle konfigurieren",
  "summary": "Anbieterrouting und Einsatzbereiche unter Berücksichtigung von Anbieter- und Sandbox-Kosten wählen.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 3,
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
      "content/knowledge/plans-and-billing.md",
      "components/settings/account-ai-keys-section.tsx",
      "components/settings/account-sandbox-section.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/ai-keys-and-models-workflow.png",
      "alt": "KI-Anbieterauswahl mit ausgewähltem minddy Cloud.",
      "caption": "Der ausgewählte Cloud-Anbieter nutzt den Kontotarif. Persönliche Anbieter richtest du über diese Auswahl ein.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/ai-keys-and-models-defaults-workflow.png",
      "alt": "Standardmodell und Denkstufe für Codearbeit.",
      "caption": "Standardmodell und Denkstufe für Codearbeit. Neue Code-Worker verwenden diese Vorgaben; laufende Worker behalten ihre festgelegten Einstellungen.",
      "revision": 4,
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
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow"
  ]
}
---

## Anbieter hinzufügen und zuordnen {#ai-keys-and-models}

Öffnen Sie die KI-Einstellungen des Kontos, fügen Sie einen kompatiblen Anbieter hinzu und geben Sie seinen Schlüssel sowie gegebenenfalls die erforderliche Basis-URL ein. Speichern Sie und prüfen Sie den Bestätigungszustand. Bei KI-Aufrufen mit verfügbarer verwalteter Alternative bleibt der Verbrauch bei Minddy, wenn ein Schlüssel unbestätigt oder nicht erreichbar ist. Dies setzt konfigurierte verwaltete KI voraus; Codeworker folgen den unten beschriebenen anbietergebundenen Modellregeln. Fügen Sie den Schlüssel niemals in eine Konversation oder einen Screenshot ein.

Ordnen Sie die Modellfamilien für Text, Transkription und Embeddings kompatiblen Schlüsseln zu oder belassen Sie sie bei Minddy. Wählen Sie für jeden Schlüssel die aktivierten Bereiche: Numo-Konversationen, Codearbeit, Automatisierungen, Sprache und Feedback. Ein Bereich oder eine Modellfamilie ohne nutzbare Zuordnung bleibt beim Minddy-Verbrauch. Ihr Anbieter berechnet Aufrufe mit seinem Schlüssel. Die Rechenleistung der Serversandbox verursacht weiterhin tatsächliche Kosten und wird im Verbrauch erfasst. Diese Erfassung ist von einem Kontolimit zu unterscheiden: Für einen Worker mit validiertem BYOK gelten weder das Tarifkontingent noch dessen Rechenleistungslimit; von Minddy finanzierte Arbeit bleibt dagegen an das enthaltene Kontingent gebunden.

![KI-Anbieterauswahl mit ausgewähltem minddy Cloud.](/documentation/de/ai-keys-and-models-workflow.png)


## Modelle und Ausführungsort {#models}

Die Wahl des Codemodells ist an seinen Anbieter gebunden. Nach dem Ändern, Deaktivieren oder Verlust eines persönlichen Schlüssels passt die bisherige Auswahl möglicherweise nicht mehr zum aktiven Anbieter. Ein neuer Worker startet dann erst, wenn Sie in den KI-Kontoeinstellungen ein kompatibles Codemodell wählen. Er wählt nicht stillschweigend ein günstigeres Modell oder einen Plattformstandard. Ein bereits festgelegter BYOK-Lauf wechselt den Kostenträger nicht, wenn sein Schlüssel nicht mehr verfügbar ist.

Legen Sie hier das standardmäßige Codemodell und den Reasoning-Wert für neue Worker fest. Bereits bestehende Worker behalten ihren bei der Erstellung festgelegten Reasoning-Wert. Wählen Sie Region und Größe neuer Sandboxes getrennt davon. Diese Standardwerte ersetzen nicht das in einer Konversation ausgewählte Modell.

Lokales Ollama und OpenAI-kompatible Endpunkte können bei entsprechender Konfiguration Konversationen über die Desktop-Brücke bedienen. Sie können weder delegierte Codearbeit noch Routinen in der Serversandbox bedienen. Verwenden Sie dafür einen vom Server erreichbaren Anbieter. Entfernen Sie einen nicht mehr benötigten Anbieter über seine Bestätigung und prüfen Sie vor dem nächsten Lauf die neue Zuordnung.

![Standardmodell und Denkstufe für Codearbeit.](/documentation/de/ai-keys-and-models-defaults-workflow.png)
