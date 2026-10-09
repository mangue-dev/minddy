---
{
  "id": "ai-settings-and-usage",
  "locale": "de",
  "title": "KI-Einstellungen und Verbrauch",
  "summary": "Konfigurieren Sie persönliche KI-Schlüssel und Standardmodelle und verstehen Sie Cloud-Tariflimits und Verbrauchserfassung.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A04",
    "A08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "lib/server/agent/execute.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "scheduled-routines"
  ],
  "aliases": [
    "ai-keys-and-models",
    "plans-and-ai-usage",
    "plans-and-billing"
  ],
  "tags": [
    "Eigene KI-Schlüssel und Modelle konfigurieren",
    "Cloud-Tarife und KI-Verbrauch verstehen"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/ai-keys-and-models-workflow.png",
      "alt": "KI-Anbieterauswahl mit ausgewähltem minddy Cloud.",
      "caption": "Der ausgewählte Cloud-Anbieter nutzt den Kontotarif. Persönliche Anbieter richtest du über diese Auswahl ein.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/ai-keys-and-models-defaults-workflow.png",
      "alt": "Standardmodell und Denkstufe für Codearbeit.",
      "caption": "Standardmodell und Denkstufe für Codearbeit. Neue Code-Worker verwenden diese Vorgaben; laufende Worker behalten ihre festgelegten Einstellungen.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        217
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/plans-and-ai-usage-workflow.png",
      "alt": "KI-Nutzungsseite des Demonstrationskontos.",
      "caption": "KI-Nutzungsseite des Demonstrationskontos. Budget, Nutzungskategorien und Verlauf werden aus dem Konto gelesen; kein Kauf oder kostenpflichtiger Lauf wurde ausgelöst.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1154,
        1766
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Persönliche KI-Schlüssel, Standardmodelle und Cloud-Kontingente bestimmen, wie KI-Arbeit ausgeführt und abgerechnet wird. Die folgenden Abschnitte erklären Anbieter und Ausführungsort sowie Tarifkapazität und Budgetverbrauch; prüfen Sie die verfügbaren Einstellungen und den aktuellen Verbrauch in Ihrem Konto.

## Eigene KI-Schlüssel und Modelle konfigurieren {#ai-keys-and-models}

Öffnen Sie die KI-Einstellungen des Kontos, fügen Sie einen kompatiblen Anbieter hinzu und geben Sie seinen Schlüssel sowie gegebenenfalls die erforderliche Basis-URL ein. Speichern Sie und prüfen Sie den Bestätigungszustand. Bei KI-Aufrufen mit verfügbarer verwalteter Alternative bleibt der Verbrauch bei minddy, wenn ein Schlüssel unbestätigt oder nicht erreichbar ist. Dies setzt konfigurierte verwaltete KI voraus; Codeworker folgen den unten beschriebenen anbietergebundenen Modellregeln. Fügen Sie den Schlüssel niemals in eine Konversation oder einen Screenshot ein.

Ordnen Sie die Modellfamilien für Text, Transkription und Embeddings kompatiblen Schlüsseln zu oder belassen Sie sie bei minddy. Wählen Sie für jeden Schlüssel die aktivierten Bereiche: Numo-Konversationen, Codearbeit, Automatisierungen, Sprache und Feedback. Ein Bereich oder eine Modellfamilie ohne nutzbare Zuordnung bleibt beim minddy-Verbrauch. Ihr Anbieter berechnet Aufrufe mit seinem Schlüssel. Die Rechenleistung der Serversandbox verursacht weiterhin tatsächliche Kosten und wird im Verbrauch erfasst. Diese Erfassung ist von einem Kontolimit zu unterscheiden: Für einen Worker mit validiertem BYOK gelten weder das Tarifkontingent noch dessen Rechenleistungslimit; von minddy finanzierte Arbeit bleibt dagegen an das enthaltene Kontingent gebunden.

![KI-Anbieterauswahl mit ausgewähltem minddy Cloud.](/documentation/de/ai-keys-and-models-workflow.png)

### Modelle und Ausführungsort {#models}

Die Wahl des Codemodells ist an seinen Anbieter gebunden. Nach dem Ändern, Deaktivieren oder Verlust eines persönlichen Schlüssels passt die bisherige Auswahl möglicherweise nicht mehr zum aktiven Anbieter. Ein neuer Worker startet dann erst, wenn Sie in den KI-Kontoeinstellungen ein kompatibles Codemodell wählen. Er wählt nicht stillschweigend ein günstigeres Modell oder einen Plattformstandard. Ein bereits festgelegter BYOK-Lauf wechselt den Kostenträger nicht, wenn sein Schlüssel nicht mehr verfügbar ist.

Legen Sie hier das standardmäßige Codemodell und den Reasoning-Wert für neue Worker fest. Bereits bestehende Worker behalten ihren bei der Erstellung festgelegten Reasoning-Wert. Wählen Sie Region und Größe neuer Sandboxes getrennt davon. Diese Standardwerte ersetzen nicht das in einer Konversation ausgewählte Modell.

Lokales Ollama und OpenAI-kompatible Endpunkte können bei entsprechender Konfiguration Konversationen über die Desktop-Brücke bedienen. Sie können weder delegierte Codearbeit noch Routinen in der Serversandbox bedienen. Verwenden Sie dafür einen vom Server erreichbaren Anbieter. Entfernen Sie einen nicht mehr benötigten Anbieter über seine Bestätigung und prüfen Sie vor dem nächsten Lauf die neue Zuordnung.

![Standardmodell und Denkstufe für Codearbeit.](/documentation/de/ai-keys-and-models-defaults-workflow.png)

## Cloud-Tarife und KI-Verbrauch verstehen {#plans-and-ai-usage}

Cloud bietet Free, Go und Pro. Alle enthalten MCP, Numo-Konversationen, Kontextaktionen, Codearbeit und Routinen. Kapazität, enthaltene KI, Modelle und Speicher unterscheiden sich. Öffnen Sie Abrechnung für Ihr aktuelles Kontingent und den Verbrauch. Vergleichen Sie vor der Tarifwahl die öffentliche Preisseite; ihre Angaben bilden die aktuelle Referenz.

Verwenden Sie den Ihrem Konto angebotenen Zahlungs- oder Abonnementverwaltungsbefehl. Prüfen Sie Betrag, Abrechnungszeitraum und Anbieterbestätigung, bevor Sie zustimmen. Ein erfolgreicher Tarifwechsel sollte in der Kontoabrechnung erscheinen. Prüfen Sie dies, statt ein geschlossenes Zahlungsfenster als Nachweis zu betrachten.

### Budgetverbrauch {#consumption}

Das enthaltene KI-Kontingent umfasst Reasoning, minddy-Werkzeugaufrufe, Automatisierungen, Worker-Modellaufrufe und Rechenleistung der Serversandbox. Die monatliche Grenze des enthaltenen KI-Kontingents gilt für Arbeit, die minddy finanziert. Das Limit pro Routinenlauf ist eine eigene Grenze, die den Lauf pausieren kann; abgeschlossene Arbeit bleibt in der Konversation erhalten. Diese Grenzen erlauben keine automatische Abrechnung von Überschreitungen. Prüfen Sie die Limitkarte und das Datum der Budgetzurücksetzung, sofern es verfügbar ist.

Kompatible persönliche Schlüssel lassen Modellaufrufe beim Anbieter abrechnen, statt das enthaltene KI-Kontingent zu verbrauchen. Für einen Worker mit einem validierten BYOK-Schlüssel gelten weder das Kontingent des Kontotarifs noch dessen Rechenleistungslimit. Die Sandbox-Rechenleistung verursacht weiterhin tatsächliche Kosten und wird im Verbrauch erfasst. Diese Erfassung bedeutet nicht, dass die monatliche Tarifgrenze auf diesen BYOK-Lauf angewendet wird. Nicht zugeordnete Familien oder Bereiche, deren Aufrufe minddy finanziert, bleiben an ihr minddy-Kontingent gebunden. Self-Hosting hat von der Installation abhängige Infrastruktur- und optionale Anbieterkosten. Derselbe Anwendungskern macht daraus kein Cloud-Abonnement.

### Kapazität der Kandidatenversion {#plan-capacities}

Diese Standardwerte beschreiben den identifizierten Kandidaten 0.11.1. Prüfen Sie vor einem Kauf die tatsächliche Preisseite und Ihr Konto. Konfigurierte Zahlungspreise und Kontoausnahmen können abweichen. Die Gästezahl schließt den Projektinhaber aus. Speicher wird dem Inhaber des Projekts angerechnet, das die Dateien erhält.

| Tarif | Projekte | Tickets pro Projekt | Gäste pro Projekt | Speicher | Enthaltene monatliche KI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unbegrenzt | Unbegrenzt | Unbegrenzt | 20 GiB | 5 |
| Pro | Unbegrenzt | Unbegrenzt | Unbegrenzt | 100 GiB | 15 |

![KI-Nutzungsseite des Demonstrationskontos.](/documentation/de/plans-and-ai-usage-workflow.png)
