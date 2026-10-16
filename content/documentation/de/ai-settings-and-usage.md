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
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate; multi-provider settings and persistent personal Numo defaults; MIN-721 removal of code agents, sandboxes and code-work usage",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
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
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/min-676-review-fixes-2026-10-11.md",
      "content/documentation/reviews/min-676-provider-numo-defaults-2026-10-11.md",
      "content/documentation/reviews/min-676-native-login-wizard-2026-10-11.md",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution); agent:/root (provider routing, persistent Numo defaults and local Docker UI review; no provider inference); agent:/root (guided connection source, behavior fixtures and local visual review; no live provider authentication); agent:/root/min721_docs (MIN-721 source review inherited from en revision 16; de translation of removal edits; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance); agent:/root (complete six-locale defaults and routing meaning review; no human acceptance); agent:/root (six-locale wizard procedure equivalence; no human acceptance); agent:/root/min721_de (de translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance)",
    "date": "2026-10-16"
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
      "kind": "diagram",
      "src": "/documentation/de/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Verbundene Anbieter, Fähigkeitszuordnung und persönliches Numo-Modell sind getrennte Einstellungen.",
      "caption": "Mehrere Anbieter bleiben verbunden. Die Zuordnung wählt je Fähigkeit; Numos Standard wird je Konto und Anbieter gespeichert.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Anbieter und Numo-Standard",
        "items": [
          {
            "title": "Verbundene Anbieter",
            "detail": "Mehrere API-Anbieter bleiben verbunden; neue Verbindungen ersetzen die anderen nicht."
          },
          {
            "title": "Anbieter je Fähigkeit",
            "detail": "Ordnen Sie Text, Transkription und Embeddings getrennt zu und aktivieren Sie die Nutzungen."
          },
          {
            "title": "Numos Standardmodell",
            "detail": "App-Standard oder persönliches Modell. Eine ausdrückliche Gesprächsauswahl hat Vorrang."
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "ai-keys-and-models-workflow"
  ]
}
---

Die KI-Kontoeinstellungen legen Anbieter, persönliche Schlüssel und Standardwerte für die unterstützten Funktionen fest. Prüfen Sie vor Arbeitsbeginn die Modellzuordnung. Unterscheiden Sie beim Cloud-Verbrauch zwischen Anbieterabrechnung, enthaltenem KI-Kontingent und Routinenlimits.

Der Abschnitt **Minddy-KI** der KI-Kontoeinstellungen konfiguriert die API-Anbieter für Numo-Gespräche, Routinen, Automatisierungen, Sprache und Feedback. Coding-Agenten, die Sie selbst ausführen und über minddy MCP verbinden, nutzen ihr eigenes Abonnement oder API-Konto und verbrauchen keine Minddy-KI-Nutzung.

## Eigene KI-Schlüssel und Modelle konfigurieren {#ai-keys-and-models}

In den KI-Kontoeinstellungen wählt **KI-Anbieter** den Textmodell-Anbieter aus Minddy Cloud und Ihren verbundenen kompatiblen Anbietern. **Verbundene Anbieter** zeigt die vollständige Liste. Wählen Sie **Anbieter hinzufügen**, wählen Sie den Anbieter, geben Sie seinen API-Schlüssel und gegebenenfalls die Basis-URL ein und speichern Sie. Sie können mehrere Anbieter verbinden; das Hinzufügen oder Auswählen eines Anbieters löscht die anderen nicht. Fügen Sie Schlüssel niemals in Unterhaltungen oder Screenshots ein.

Ordnen Sie Text, Transkription und Embeddings unabhängig zu. Jede Modellfamilie verwendet jeweils einen Anbieter. Die Nutzungsschalter pro Anbieter bestimmen, ob Numo, Automatisierungen, Sprache und Feedback dessen Schlüssel oder das Minddy-Kontingent verwenden. Beispielsweise kann Text über OpenRouter und Transkription über OpenAI laufen. Die Auswahl eines Textanbieters aktiviert einen zuvor deaktivierten Numo-Nutzungsschalter nicht erneut.

Wählen Sie unter **Numos Standardmodell** den **App-Standard** oder ein bestimmtes Modell des aktiven Numo-Anbieters. Die Auswahl wird für Ihr Konto und getrennt je Anbieter gespeichert, auch nach Neuladen und in neuen Sitzungen. Der App-Standard folgt dem für diesen Anbieter konfigurierten Anwendungsmodell. Ein ausdrücklich gewähltes Unterhaltungsmodell hat Vorrang; Unterhaltungen mit Ihrem Standard übernehmen spätere Kontoänderungen. Bereits zugelassene Ausführungen behalten ihr festgelegtes Modell. Ein nicht mehr verfügbares Modell oder eines außerhalb Ihrer Tarifgrenzen wird abgelehnt: Wählen Sie ein anderes Modell oder den App-Standard. Kontoexport und -import enthalten diese Einstellungen, ohne Anbieter-Zugangsdaten.

Ein unbestätigter oder nicht erreichbarer Schlüssel kann unterstützte allgemeine KI-Aufrufe über das Minddy-Kontingent laufen lassen, wenn verwaltete KI eingerichtet ist. Ihr Anbieter berechnet Aufrufe mit seinem Schlüssel. Validierte persönliche Schlüssel und von Minddy finanzierte Arbeit folgen den [Budgetregeln unten](#consumption).

![Verbundene Anbieter, Fähigkeitszuordnung und persönliches Numo-Modell sind getrennte Einstellungen.](/documentation/de/ai-providers-and-numo-defaults-flow.svg)

### Lokale Modelle {#models}

Lokales Ollama und OpenAI-kompatible Endpunkte können bei entsprechender Konfiguration Konversationen über die Desktop-Brücke bedienen. Routinen laufen auf dem Server und können kein Modell auf Ihrem Computer erreichen. Verwenden Sie für sie einen vom Server erreichbaren Anbieter. Entfernen Sie einen nicht mehr benötigten Anbieter über seine Bestätigung und prüfen Sie vor dem nächsten Lauf die neue Zuordnung.


## Cloud-Tarife und KI-Verbrauch verstehen {#plans-and-ai-usage}

Cloud bietet Free, Go und Pro. Alle enthalten MCP, Numo-Konversationen, Kontextaktionen und Routinen. Kapazität, enthaltene KI, Modelle und Speicher unterscheiden sich. Öffnen Sie Abrechnung für Ihr aktuelles Kontingent und den Verbrauch. Vergleichen Sie vor der Tarifwahl die öffentliche Preisseite; ihre Angaben bilden die aktuelle Referenz.

Verwenden Sie den Ihrem Konto angebotenen Zahlungs- oder Abonnementverwaltungsbefehl. Prüfen Sie Betrag, Abrechnungszeitraum und Anbieterbestätigung, bevor Sie zustimmen. Ein erfolgreicher Tarifwechsel sollte in der Kontoabrechnung erscheinen. Prüfen Sie dies, statt ein geschlossenes Zahlungsfenster als Nachweis zu betrachten.

### Budgetverbrauch {#consumption}

Das enthaltene KI-Kontingent umfasst Numos Reasoning und Werkzeugaufrufe, Routinen, Automatisierungen, Sprachdiktat und Feedback-Verarbeitung. Die monatliche Grenze des enthaltenen KI-Kontingents gilt für Arbeit, die minddy finanziert. Das Limit pro Routinenlauf ist eine eigene Grenze, die den Lauf pausieren kann; abgeschlossene Arbeit bleibt in der Konversation erhalten. Diese Grenzen erlauben keine automatische Abrechnung von Überschreitungen. Prüfen Sie die Limitkarte und das Datum der Budgetzurücksetzung, sofern es verfügbar ist.

Kompatible persönliche Schlüssel lassen Modellaufrufe beim Anbieter abrechnen, statt das enthaltene KI-Kontingent zu verbrauchen. Nicht zugeordnete Familien oder Bereiche, deren Aufrufe minddy finanziert, bleiben an ihr minddy-Kontingent gebunden. Self-Hosting hat von der Installation abhängige Infrastruktur- und optionale Anbieterkosten. Derselbe Anwendungskern macht daraus kein Cloud-Abonnement.

### Kapazität der Kandidatenversion {#plan-capacities}

Diese Standardwerte beschreiben den identifizierten Kandidaten 0.11.1. Prüfen Sie vor einem Kauf die tatsächliche Preisseite und Ihr Konto. Konfigurierte Zahlungspreise und Kontoausnahmen können abweichen. Die Gästezahl schließt den Projektinhaber aus. Speicher wird dem Inhaber des Projekts angerechnet, das die Dateien erhält.

| Tarif | Projekte | Tickets pro Projekt | Gäste pro Projekt | Speicher | Enthaltene monatliche KI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unbegrenzt | Unbegrenzt | Unbegrenzt | 20 GiB | 5 |
| Pro | Unbegrenzt | Unbegrenzt | Unbegrenzt | 100 GiB | 15 |

Die Abrechnung zeigt das verbleibende KI-Budget und die nächste Zurücksetzung, **Budget im Zeitverlauf** und **Was verbraucht dein Budget?**, das den Verbrauch als Anteil am enthaltenen Budget auf **Routinen**, **Numo**, **Sprachdiktat**, **Feedback** und **Automatisierungen** aufteilt. **Nutzungsverlauf** listet die Aktionen des laufenden Zeitraums und ihren Anteil am Budget.

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