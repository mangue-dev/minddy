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
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate with allowlisted private native preview (MIN-676); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls",
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
      "content/documentation/reviews/pr397-review-fixes-2026-10-09.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "content/documentation/reviews/min-676-private-native-preview-2026-10-10.md",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "lib/native-agent-models.ts",
      "components/settings/native-agent-model-preferences.tsx",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/min-676-review-fixes-2026-10-11.md"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (PR #397 source review of voice/export additions; existing procedures and figures retained, no operational rerun); agent:/root/native_hosting_terms (private preview controls and limitations source/UI-test review; prior procedures retained, no native operational run); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (experimental Claude and explicit cold continuation source and fixture review; no live provider execution)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (PR #397 localized additions and equivalent meaning review; no independent or human review claimed); agent:/root/native_hosting_terms (localized private preview additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale experimental and reconnect additions; agent review, not human acceptance)",
    "date": "2026-10-11"
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
      "revision": 13,
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
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/plans-and-ai-usage-workflow.png",
      "alt": "KI-Nutzungsseite des Demonstrationskontos.",
      "caption": "KI-Nutzungsseite des Demonstrationskontos. Budget, Nutzungskategorien und Verlauf werden aus dem Konto gelesen; kein Kauf oder kostenpflichtiger Lauf wurde ausgelöst.",
      "revision": 13,
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
    "plans-and-ai-usage-workflow"
  ]
}
---

Die KI-Kontoeinstellungen legen Anbieter, persönliche Schlüssel und Standardwerte für die unterstützten Funktionen fest. Prüfen Sie vor Arbeitsbeginn die Modellzuordnung. Unterscheiden Sie beim Cloud-Verbrauch zwischen Anbieterabrechnung, enthaltenem KI-Kontingent, Sandbox-Rechenleistung und Routinenlimits.

Die KI-Kontoeinstellungen trennen **Minddy-KI** und **Code-Agent**. Minddy-KI konfiguriert API-Anbieter für Numo-Gespräche, Automatisierungen, Sprache und Feedback. Coding-Abonnements gelten nur für Repository-Worker; sie finanzieren nicht die allgemeine Minddy-KI.

## Eigene KI-Schlüssel und Modelle konfigurieren {#ai-keys-and-models}

Öffnen Sie die KI-Einstellungen des Kontos, fügen Sie einen kompatiblen Anbieter hinzu und geben Sie seinen Schlüssel sowie gegebenenfalls die erforderliche Basis-URL ein. Speichern Sie und prüfen Sie den Bestätigungszustand. Bei KI-Aufrufen mit verfügbarer verwalteter Alternative bleibt der Verbrauch bei minddy, wenn ein Schlüssel unbestätigt oder nicht erreichbar ist. Dies setzt konfigurierte verwaltete KI voraus; Codeworker folgen den unten beschriebenen anbietergebundenen Modellregeln. Fügen Sie den Schlüssel niemals in eine Konversation oder einen Screenshot ein.

Ordnen Sie die Modellfamilien für Text, Transkription und Embeddings kompatiblen Schlüsseln zu oder belassen Sie sie bei minddy. Wählen Sie für jeden Schlüssel die aktivierten Bereiche: Numo-Konversationen, Automatisierungen, Sprache und Feedback. Wählen Sie die OpenCode-Finanzierung separat unter **Code-Agent**. Ein Bereich oder eine Modellfamilie ohne nutzbare Zuordnung bleibt beim minddy-Verbrauch. Ihr Anbieter berechnet Aufrufe mit seinem Schlüssel. Die Rechenleistung der Serversandbox verursacht weiterhin tatsächliche Kosten und wird im Verbrauch erfasst. Diese Erfassung ist von einem Kontolimit zu unterscheiden: Für einen Worker mit validiertem BYOK gelten weder das Tarifkontingent noch dessen Rechenleistungslimit; von minddy finanzierte Arbeit bleibt dagegen an das enthaltene Kontingent gebunden.

![KI-Anbieterauswahl mit ausgewähltem minddy Cloud.](/documentation/de/ai-keys-and-models-workflow.png)

### Den Code-Agenten wählen {#native-agent-preview}

**Claude Code ist Experimentell.** Es benötigt einen Tarif mit Claude Code; ein Free-Konto reicht nicht aus. Die tatsächliche Ausführung über ein Abonnement und die Sitzungserneuerung sind noch nicht validiert. Eine Kontoverbindung bestätigt nicht, dass der Tarif das gewählte Modell unterstützt.

Bitten Sie Numo nach der erneuten Verbindung ausdrücklich, die Arbeit des vorherigen Agenten fortzusetzen. Eine neue Nachricht in dessen früherer Code-Unterhaltung öffnet Numo mit Ihrer Anfrage und diesem Agenten als Kontext. Minddy erstellt einen neuen Lauf mit der neuen Verbindung und behält Engine, Modell, Denkstufe, Branch und den verfügbaren Gesprächskontext innerhalb der Größenbegrenzung bei. Der vorige Lauf behält seine gespeicherte Verbindungsgeneration; aktive Worker erhalten keine neue Verbindung.

Wählen Sie unter **Code-Agent** entweder **OpenCode (Minddy Cloud)** oder OpenCode mit dem oben konfigurierten Textmodell-Anbieter. **KI-Anbieter** bestimmt die Finanzierung von Codearbeiten unabhängig von anderen API-Funktionen. Konfigurieren Sie hier das OpenCode-Modell und die Denkstufe. Region und Sandbox-Größe stehen im selben Abschnitt und gelten für gehostete Code-Worker.

Wählen Sie zuerst **Codex** oder **Claude Code**, um nur dessen Verbindungssteuerung anzuzeigen. Die Auswahl verbindet das Konto nicht und startet keine Arbeit. Die aktuellen Codex-Anmeldeelemente beschreiben den historischen technischen Prototyp; verwenden Sie sie nicht in gehostetem Minddy, bis eine autorisierte Integration diesen Mechanismus ersetzt. Für freigeschaltete Claude-Konten startet **Claude Code verbinden** die Browserfreigabe. Erteilen Sie sie nur auf der offiziellen Claude-Seite und fügen Sie nur deren Autorisierungscode in Minddy ein. Wählen Sie bei Aufforderung **Verbindung abschließen**. **Verbindung abbrechen** beendet einen Versuch. **Trennen** entfernt den gespeicherten Minddy-Zugriff; es kündigt weder das Abonnement noch bestätigt es einen entfernten OAuth-Widerruf.

Gehostete Codex-Abonnementauthentifizierung ist nicht allgemein verfügbar. OpenAI schließt app-server-Authentifizierung für gehostete Dienste ausdrücklich aus und verweist auf Sign in with ChatGPT. Minddy benötigt vor der Freigabe eine autorisierte Integration. Eingeschränkte technische Tests belegen weder die Anbietererlaubnis noch die Wiederherstellung nach natürlichem Token-Ablauf. Die kostenpflichtige Claude-Code-Ausführung bleibt ungetestet. Das Entfernen von UI-Badges ändert diese Bedingungen nicht. [OpenAI app-server](https://learn.chatgpt.com/docs/app-server#auth-endpoints), [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source).

Unterhaltungen nativer Agenten zeigen die gespeicherte Engine, das Modell und den Denkaufwand oder ohne eigene Auswahl den Agentenstandard. Sie bieten keine OpenCode-API-Steuerung oder Bildanhänge. OpenCode-Unterhaltungen behalten ihre API-Steuerung.

Vor der Delegation erhält Numo die aktuelle Kontoauswahl und die Fähigkeiten des gewählten Adapters. Sobald ein Worker gestartet ist, sind dessen gespeicherte Engine und Fähigkeiten für diesen Lauf maßgeblich, auch nach Änderungen an den Kontoeinstellungen. Numo nennt diesen Worker, wenn es delegierte Arbeit erklärt. Ist die Kontoauswahl nicht lesbar, prüft es die Einstellungen, statt zu raten.

Der native Adapter stellt kontrollierte Minddy-Werkzeuge über MCP bereit. Anbietereigene integrierte Werkzeuge, Bildeingaben und Subagenten sind in diesen Adaptern nicht verfügbar. Worker-Fragen beantwortet es anhand verlässlichen Gesprächskontexts oder fragt dich, wenn eine Entscheidung fehlt. Numo darf eigene unterstützte Werkzeuge innerhalb deiner Autorisierung verwenden; nicht unterstützte Engine-Operationen erfindet es nicht.

Eine fehlende Verbindung, abgelaufener Zugriff oder ein Anbieterlimit stoppt native Arbeit. Minddy wechselt nicht automatisch zu OpenCode, einem anderen API-Anbieter oder einem anderen Kostenträger. Wählen Sie ausdrücklich **OpenCode** für den API-Weg. Gehostetes Codex muss auf die autorisierte Integration warten; eine neue Gerätecode-Anmeldung ist kein erlaubter Wiederherstellungsweg. Verbinden Sie bei Claude das gewählte Konto erneut, wenn Zugriff verfügbar ist. Trennung oder Zugriffsverlust erhalten die gespeicherte Auswahl, bis Sie sie ändern. Bestehende Worker behalten ihre aufgezeichnete Engine.

Native Abonnements finanzieren nur Code-Modellnutzung; Numo-API-Aufrufe und Sandbox-Rechenleistung werden getrennt erfasst.

### Modelle und Ausführungsort {#models}

**OpenCode:** Die Wahl des Codemodells ist an seinen Anbieter gebunden. Nach dem Ändern, Deaktivieren oder Verlust eines persönlichen Schlüssels passt die bisherige Auswahl möglicherweise nicht mehr zum aktiven Anbieter. Ein neuer Worker startet dann erst, wenn Sie in den KI-Kontoeinstellungen ein kompatibles Codemodell wählen. Er wählt nicht stillschweigend ein günstigeres Modell oder einen Plattformstandard. Ein bereits festgelegter BYOK-Lauf wechselt den Kostenträger nicht, wenn sein Schlüssel nicht mehr verfügbar ist.

Wählen Sie unter **Code-Agent** Modell und Denkaufwand für neue Agenten. **Automatisch** überlässt dem ausgewählten Agenten den Standard. Codex liest mit **Modelle aktualisieren** den Katalog der verbundenen Codex-CLI samt unterstützten Denkstufen. Die API-Modellliste von OpenRouter wird dafür nicht verwendet. Aktualisieren Sie nach einem Verbindungswechsel oder für aktuelle Optionen. Ihr Konto kann ein gelistetes Codex-Modell weiterhin einschränken; erst die Ausführung bestätigt den Zugriff. Claude Code bietet die Aliasnamen **Sonnet**, **Opus** und **Haiku**, die den Empfehlungen der installierten CLI folgen. Die Ausführung mit einem Claude-Abonnement wurde noch nicht getestet. Die Aktualisierung startet kurz eine Sandbox und zerstört sie danach; ihr Rechenaufwand wird getrennt von der Modellnutzung des Abonnements erfasst.

Bei Codex oder Claude Code setzt ein Modellwechsel den Denkaufwand auf **Automatisch**, damit keine inkompatible Stufe des vorherigen Modells übernommen wird. Wählen Sie danach eine unterstützte Stufe. OpenCode, Codex und Claude Code haben getrennte Einstellungen. Vorhandene Agenten behalten Engine, Modell und Denkaufwand vom Start, auch bei einer Fortsetzung. Diese Einstellungen ändern nicht das Modell der Numo-Unterhaltung. Region und Sandbox-Größe bleiben im selben Abschnitt.

Lokales Ollama und OpenAI-kompatible Endpunkte können bei entsprechender Konfiguration Konversationen über die Desktop-Brücke bedienen. Sie können weder delegierte Codearbeit noch Routinen in der Serversandbox bedienen. Verwenden Sie dafür einen vom Server erreichbaren Anbieter. Entfernen Sie einen nicht mehr benötigten Anbieter über seine Bestätigung und prüfen Sie vor dem nächsten Lauf die neue Zuordnung.


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
