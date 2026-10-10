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
    "A08",
    "A10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
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
      "lib/billing-plans.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "components/ai-elements/dictate-button.tsx",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed)",
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ai-keys-and-models-defaults-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/ai-keys-and-models-defaults-workflow.png",
      "alt": "Standardmodell und Denkstufe für Codearbeit.",
      "caption": "Standardmodell und Denkstufe für Codearbeit. Neue Code-Worker verwenden diese Vorgaben; laufende Worker behalten ihre festgelegten Einstellungen.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        217
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/plans-and-ai-usage-workflow.png",
      "alt": "KI-Nutzungsseite des Demonstrationskontos.",
      "caption": "KI-Nutzungsseite des Demonstrationskontos. Budget, Nutzungskategorien und Verlauf werden aus dem Konto gelesen; kein Kauf oder kostenpflichtiger Lauf wurde ausgelöst.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1154,
        1016
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow",
    "ai-keys-and-models-defaults-workflow",
    "plans-and-ai-usage-workflow"
  ]
}
---

Die KI-Kontoeinstellungen legen Anbieter, persönliche Schlüssel und Standardwerte für die unterstützten Funktionen fest. Prüfen Sie vor Arbeitsbeginn die Modellzuordnung. Unterscheiden Sie beim Cloud-Verbrauch zwischen Anbieterabrechnung, enthaltenem KI-Kontingent, Sandbox-Rechenleistung und Routinenlimits.

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

## Text und Änderungen diktieren {#voice-dictation}

Mit dem Mikrofon neben einem unterstützten Feld können Sie Issues, Ziele, Kommentare, Numo-Nachrichten, Feedback oder Routine-Anweisungen diktieren. Sie benötigen Schreibrechte an dieser Stelle, ein funktionierendes Mikrofon und einen Browser mit Aufnahmeunterstützung. Erlauben Sie den Mikrofonzugriff für die Website im Browser und im Betriebssystem. Verwenden Sie für eine entfernte Instanz HTTPS. In der Cloud muss KI-Budget verfügbar sein; selbst gehostete Instanzen benötigen zusätzlich funktionierende Anbieter für Transkription und Diktat. Persönliche Sprachschlüssel und Modellzuweisungen richten Sie [weiter oben](#ai-keys-and-models) ein.

1. Öffnen Sie das gewünschte Formular oder Issue und wählen Sie dessen Mikrofon. In einem geöffneten Issue schaltet Command+Umschalt+D unter macOS beziehungsweise Strg+Umschalt+D auf anderen Systemen die Sprachbearbeitung um. Prüfen Sie, ob Aufnahmezeit und Wellenform erscheinen.
2. Sprechen Sie in der Oberflächensprache, die der Transkription als Hinweis dient. Benennen Sie Änderungen deutlich, etwa „Setze die Priorität auf hoch“. Beenden Sie die Aufnahme mit der quadratischen Schaltfläche und warten Sie auf Transkription und Numo-Verarbeitung, bevor Sie das Formular schließen.
3. Prüfen Sie das Ergebnis. Numo-Nachrichten, Kommentare und Routine-Anweisungen erhalten bearbeitbaren Text; lesen Sie ihn vor dem Senden oder Speichern. Erstellungsformulare erhalten Entwurfsfelder, die Sie noch bestätigen müssen. Die Sprachbearbeitung eines bestehenden Issues übernimmt Änderungen sofort: prüfen Sie danach die Felder und korrigieren Sie Fehler mit den üblichen Bedienelementen. Diktieren gewährt keine zusätzlichen Rechte.

### Verbrauch und Aufnahmegrenzen {#voice-limits}

Die Audiodaten werden an den konfigurierten Transkriptionsdienst gesendet und können anschließend von einem KI-Modell überarbeitet oder interpretiert werden. Es gelten die Anbieter- und Budgetregeln des Kontos; Aufnahme und anschließende Interpretation können getrennten Verbrauch verursachen. Öffentliches Feedback hat eigene Verfügbarkeits- und Abrechnungsregeln im [Feedback-Leitfaden](/docs/feedback). Die Demo auf der Startseite besitzt ein separates Limit und ist kein Diktatkontingent des Kontos.

Der Transkriptionsendpunkt für angemeldete Nutzer akzeptiert bis zu 10 MiB Audio und 30 Anfragen pro Konto und Stunde. Der gemeinsame Recorder stoppt nach 20 Minuten als Schutzmaßnahme. Kürzere Aufnahmen erleichtern die Prüfung. Behalten Sie vorhandenen Text, bis das Ergebnis geprüft ist; der Recorder ist keine Audiosicherung.

### Nach einem fehlgeschlagenen Diktat fortfahren {#voice-recovery}

Bei verweigertem Zugriff aktivieren Sie die Mikrofonberechtigung für die Website und für den Browser oder die Desktop-App im Betriebssystem. Wird kein Gerät gefunden, schließen Sie ein Mikrofon an oder wählen Sie es aus; ist es belegt, schließen Sie die Anwendung, die es verwendet. Bei fehlender Aufnahmeunterstützung verwenden Sie einen kompatiblen Browser oder tippen den Text.

Bei Stille oder leerem Ergebnis prüfen Sie das Eingabegerät und machen eine kurze hörbare Aufnahme. Teilen Sie zu große Aufnahmen auf. Eine Meldung zum Anfragelimit nennt eine Wartezeit; warten Sie vor dem nächsten Versuch. Bei Budget- oder Anbieterfehlern prüfen Sie KI-Verbrauch, Sprachzuweisungen und Instanzkonfiguration. Schlägt die Überarbeitung fehl, wird aber erkannter Text zurückgegeben, prüfen und bearbeiten Sie diesen Text. Prüfen Sie vor der Wiederholung einer fehlgeschlagenen Issue-Änderung die aktuellen Felder, damit Sie die Änderung nicht doppelt ausführen.
