---
{
  "id": "ai-settings-and-usage",
  "locale": "de",
  "title": "KI-Einstellungen und Verbrauch",
  "summary": "Konfiguriere persönliche KI-Schlüssel und Standardmodelle und verstehe Cloud-Planlimits und Verbrauchserfassung.",
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
  "revision": 28,
  "sourceRevision": 27,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/agent/model.ts",
      "lib/server/ai-runtime.ts",
      "lib/server/usage.ts",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
      "components/ai-elements/dictate-button.tsx",
      "components/ai-elements/dictation-pill.tsx",
      "components/ai-elements/use-dictation-recorder.ts",
      "components/settings/account-preferences-section.tsx",
      "components/settings/dictation-vocabulary-section.tsx",
      "lib/dictation-vocabulary.ts",
      "lib/dictation-hallucinations.ts",
      "app/api/transcribe/route.ts",
      "lib/use-issue-dictation.ts",
      "components/issue-side-panel.tsx",
      "lib/use-objective-dictation.ts",
      "lib/use-feedback-dictation.ts",
      "components/issue-timeline.tsx",
      "components/assistant/chat-input.tsx",
      "components/routines/routine-prompt-field.tsx",
      "lib/ai-surfaces.ts",
      "components/billing/usage-segment-ui.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/model-preferences.ts",
      "app/api/account/numo-preferences/route.ts",
      "lib/server/ai-routes.ts",
      "lib/server/decisions/engine.ts",
      "app/api/account/ai-decisions/route.ts",
      "lib/decision-engine.ts"
    ]
  },
  "review": {
    "revision": 28,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-946: Billing usage paragraph (budget forecast, Daily usage chart, hover values, Numo's warning), source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: Numo Conversations paragraph and the ai-keys-and-models-workflow diagram's third step and caption, source audit against lib/server/assistant/model-preferences.ts, app/api/account/numo-preferences/route.ts and components/settings/account-ai-keys-section.tsx; diagram SVG fallback updated in every locale; no browser walkthrough); agent:claude-code (MIN-954 model roles: usages and language-model paragraphs of #ai-keys-and-models and the ai-keys-and-models-workflow diagram, source audit against components/settings/account-ai-keys-section.tsx, lib/server/ai-routes.ts and lib/server/ai-runtime.ts; diagram SVG fallback updated in every locale; no browser walkthrough); agent:claude-code (MIN-980: Decisions paragraph of #ai-keys-and-models, source audit against components/settings/account-ai-keys-section.tsx, lib/server/decisions/engine.ts and app/api/account/ai-decisions/route.ts; no browser walkthrough; no figure shows this row; existing figures kept, not recaptured)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-946 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-980 decision passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
    "Cloud-Pläne und KI-Verbrauch verstehen"
  ],
  "figures": [
    {
      "id": "ai-keys-and-models-workflow",
      "kind": "diagram",
      "src": "/documentation/de/ai-providers-and-numo-defaults-flow.svg",
      "alt": "Verbundene Anbieter, ein Anbieter je Modellart und das Sprachmodell sind getrennte Einstellungen.",
      "caption": "Jede Modellart läuft über minddy Cloud oder einen verbundenen Anbieter. Auf minddy Cloud legt die Instanz das Sprachmodell fest; mit einem persönlichen Schlüssel wird sein Modell je Anbieter gespeichert, und ein Gespräch kann ein eigenes wählen.",
      "revision": 28,
      "reviewed": true,
      "capturedAt": "2026-10-28",
      "viewport": [
        816,
        390
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Anbieter, Nutzungen und Numo",
        "items": [
          {
            "title": "Verbundene Anbieter",
            "detail": "minddy Cloud und deine API-Schlüssel stehen nebeneinander bereit."
          },
          {
            "title": "Ein Anbieter je Modellart",
            "detail": "Sprachmodell, Embeddings und Sprache zu Text wählen jeweils ihren."
          },
          {
            "title": "Anbieter und Modell von Numo",
            "detail": "minddy Cloud nutzt das Modell der Instanz. Ein eigener Schlüssel wählt seins."
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

Die KI-Kontoeinstellungen legen Anbieter, persönliche Schlüssel und Standardwerte für die unterstützten Funktionen fest. Prüfe vor Arbeitsbeginn die Modellzuordnung. Unterscheide beim Cloud-Verbrauch zwischen Anbieterabrechnung, enthaltenem KI-Kontingent und Routinenlimits.

Der Abschnitt **minddy-KI** der KI-Kontoeinstellungen konfiguriert die API-Anbieter für Numo-Gespräche, Routinen, Automatisierungen, Sprache und Feedback. Coding-Agenten, die du selbst ausführst und über minddy MCP verbinden, nutzen ihr eigenes Abonnement oder API-Konto und verbrauchen keine minddy-KI-Nutzung.

## Eigene KI-Schlüssel und Modelle konfigurieren {#ai-keys-and-models}

In den KI-Kontoeinstellungen führt **Verbundene Anbieter** minddy Cloud, das in deinem Plan enthalten ist, und die API-Anbieter auf, die du verbunden hast. Wähle **Anbieter hinzufügen**, wähle einen Anbieter, gib seinen API-Schlüssel und gegebenenfalls die erforderliche Basis-URL ein und speichere. Du kannst mehrere Anbieter verbinden; ein neuer entfernt die anderen nicht und ändert nicht, worüber deine Nutzungen laufen. Füge einen Schlüssel nie in ein Gespräch oder einen Screenshot ein.

Darunter wählt **Modelle** einen Anbieter je Modellart: **Sprachmodell** für Numo und jede KI-Funktion, die Text liest oder schreibt, **Embeddings** für die Suche nach Bedeutung sowie verwandte Tickets und verwandtes Feedback, und **Sprache zu Text** für Diktate. Jede Art wählt minddy Cloud oder einen verbundenen Anbieter, der sie bedienen kann: Embeddings und Sprache zu Text brauchen einen Anbieter mit diesen Modellen. Keine Funktion hat einen eigenen Anbieter oder ein eigenes Modell; die Websuche, die minddy Cloud oder einen OpenRouter-Schlüssel braucht, bleibt auf minddy Cloud, wenn dein Sprachmodell über einen anderen Anbieter läuft. Läuft **Embeddings** oder **Sprache zu Text** über einen deiner Schlüssel, erscheint sein Modell unter dem Anbieter: Behalte das vorausgewählte Modell des Anbieters oder wähle ein anderes. Die Auswahl gilt sofort. Auf einer Instanz ohne minddy Cloud bedient ein neu verbundener Anbieter jede Art, die noch keinen hat.

Wähle für **Sprachmodell** den Anbieter. Auf **minddy Cloud** nutzt es das Modell und die Denkintensität, die die Administration der Instanz eingestellt hat; weder diese Zeile noch ein Gespräch bietet dann ein Modell an. Mit einem deiner Schlüssel wählst du ein Modell dieses Anbieters: Numo und jede Textfunktion nutzen es. Die Auswahl zeigt das Standardmodell der App unter seinem eigenen Namen, abgehakt, solange du ihm folgst; wählst du es, folgt deine Einstellung weiter dem App-Standard, sodass spätere Änderungen daran weiter gelten. **App-Standard** erscheint nur dann als Option, wenn dieses Modell nicht im Katalog steht. Dieser Standard wird für dein Konto und getrennt für jeden Anbieter gespeichert, auch über Neuladen und neue Sitzungen hinweg. In einem Gespräch öffnet sich die Modellliste neben dem Mikrofon auf den Anbietern, wenn mehrere verfügbar sind; wähle einen, um seine Modelle zu sehen. Das Gespräch behält diesen Anbieter und dieses Modell, und Gespräche, die deinem Standard folgen, übernehmen spätere Kontoänderungen. Bereits zugelassene Durchläufe behalten ihren festgelegten Anbieter und ihr Modell. Ein gespeichertes Modell, das nicht mehr verfügbar ist, wird abgelehnt: Wähle ein anderes Modell oder das Standardmodell der App. Wird der Anbieter eines Gesprächs entfernt, bittet Numo dich, einen anderen zu wählen, statt selbst zu wechseln. Kontoexport und -import enthalten diese Modelleinstellungen, ohne Anbieter-Zugangsdaten.

**Entscheidungen** wählt, was Smart Fill, Smart Assign, Beziehungen, die Ereignisprüfung und die Prüfung von Feedback beantwortet. Die erste Liste wählt die Modellart: **Entscheidungsmodell**, das bei Unsicherheit auf das Sprachmodell zurückfällt, oder **Sprachmodell**. Die Art, die die Instanz nutzt, ist als Standard markiert; wählst du sie, folgst du wieder dem Administrator. Die zweite Liste wählt den Anbieter: Ein Entscheidungsmodell braucht minddy Cloud oder einen OpenRouter-Schlüssel, den einzigen Anbieter mit Entscheidungsmodellen, ein Sprachmodell nimmt jeden verbundenen Anbieter, der Text liefert. Die Liste zeigt nur Anbieter, die antworten können, und wird zu einfachem Text, wenn nur einer es kann. Solange du nichts wählst, laufen Entscheidungen über den Anbieter deines Sprachmodells, wenn er sie beantworten kann, sonst über minddy Cloud. Auf einem deiner Schlüssel wählt eine dritte Liste sein Modell: eines seiner Entscheidungsmodelle oder ein beliebiges Sprachmodell. Wechselst du Art oder Anbieter, gilt wieder das Standardmodell des Anbieters.

Ein unbestätigter oder nicht erreichbarer Schlüssel kann unterstützte allgemeine KI-Aufrufe über das minddy-Kontingent laufen lassen, wenn verwaltete KI eingerichtet ist. Dein Anbieter berechnet Aufrufe mit seinem Schlüssel, und minddy erfasst sie nicht. Validierte persönliche Schlüssel und von minddy finanzierte Arbeit folgen den [Budgetregeln unten](#consumption).

![Verbundene Anbieter, ein Anbieter je Modellart und das Sprachmodell sind getrennte Einstellungen.](/documentation/de/ai-providers-and-numo-defaults-flow.svg)

### Lokale Modelle {#models}

minddy ruft KI-Modelle vom Server aus auf und kann daher kein Modell nutzen, das auf deinem Computer läuft. **Anbieter hinzufügen** bietet weder lokales Ollama noch lokale OpenAI-kompatible Endpunkte an. Ein in einer früheren Version gespeicherter lokaler Endpunkt erscheint weiterhin unter **Verbundene Anbieter**, kann aber weder Numo-Konversationen noch Routinen oder andere Funktionen bedienen. Entferne ihn und weise stattdessen einen vom Server erreichbaren Anbieter zu. Entferne einen nicht mehr benötigten Anbieter über seine Bestätigung und prüfe vor dem nächsten Lauf die neue Zuordnung.


## Cloud-Pläne und KI-Verbrauch verstehen {#plans-and-ai-usage}

Cloud bietet Free, Go und Pro. Alle enthalten MCP, Numo-Konversationen, Kontextaktionen und Routinen. Kapazität, enthaltene KI, Modelle und Speicher unterscheiden sich. Öffne Nutzung & Abrechnung für dein aktuelles Kontingent und den Verbrauch. Vergleiche vor der Planwahl die öffentliche Preisseite; ihre Angaben bilden die aktuelle Referenz.

Verwende den deinem Konto angebotenen Zahlungs- oder Abonnementverwaltungsbefehl. Prüfe Betrag, Abrechnungszeitraum und Anbieterbestätigung, bevor du zustimmst. Ein erfolgreicher Planwechsel sollte in der Kontoabrechnung erscheinen. Prüfe dies, statt ein geschlossenes Zahlungsfenster als Nachweis zu betrachten.

### Budgetverbrauch {#consumption}

Das enthaltene KI-Kontingent umfasst Numos Reasoning und Werkzeugaufrufe, Routinen, Automatisierungen, Sprachdiktat und Feedback-Verarbeitung. Die monatliche Grenze des enthaltenen KI-Kontingents gilt für Arbeit, die minddy finanziert. Das Limit pro Routinenlauf ist eine eigene Grenze, die den Lauf pausieren kann; abgeschlossene Arbeit bleibt in der Konversation erhalten. Diese Grenzen erlauben keine automatische Abrechnung von Überschreitungen. Prüfe die Limitkarte und das Datum der Budgetzurücksetzung, sofern es verfügbar ist.

Kompatible persönliche Schlüssel lassen Modellaufrufe beim Anbieter abrechnen, statt das enthaltene KI-Kontingent zu verbrauchen. Nicht zugeordnete Familien oder Bereiche, deren Aufrufe minddy finanziert, bleiben an ihr minddy-Kontingent gebunden. Self-Hosting hat von der Installation abhängige Infrastruktur- und optionale Anbieterkosten. Derselbe Anwendungskern macht daraus kein Cloud-Abonnement.

### Kapazitäten der Pläne {#plan-capacities}

Diese Standardwerte beschreiben minddy 0.20.0. Prüfe vor einem Kauf die tatsächliche Preisseite und dein Konto. Konfigurierte Zahlungspreise und Kontoausnahmen können abweichen. Die Gästezahl schließt den Projekteigentümer aus und umfasst Mitglieder, Leser und ausstehende Einladungen; eine Abrechnung pro Platz gibt es nicht. Speicher wird dem Eigentümer des Projekts angerechnet, das die Dateien erhält. Wird das Eigentum übertragen, richten sich diese Limits, der Speicher und Hintergrund-KI wie Smart Assign und die Feedback-Prüfung nach dem Plan des neuen Eigentümers.

| Plan | Projekte | Tickets pro Projekt | Gäste pro Projekt | Speicher | Enthaltene monatliche KI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unbegrenzt | Unbegrenzt | Unbegrenzt | 20 GiB | 5 |
| Pro | Unbegrenzt | Unbegrenzt | Unbegrenzt | 100 GiB | 15 |

Nutzung & Abrechnung zeigt das verbleibende KI-Budget und die nächste Zurücksetzung. **Budget im Zeitverlauf** zeichnet deinen bisherigen Verbrauch als durchgezogene Linie und gestrichelt, wohin das aktuelle Tempo bis zur Erneuerung führt; der Satz unter dem Titel sagt, ob du gut im Plan liegst oder an welchem Tag das Budget aufgebraucht ist. **Was verbraucht dein Budget?**, das den Verbrauch als Anteil am enthaltenen Budget auf **Routinen**, **Numo**, **Sprachdiktat**, **Feedback** und **Automatisierungen** aufteilt. **Nutzung pro Tag** zeigt, was jeder Tag verbraucht hat, nach Nutzungsart; fahre mit der Maus über ein Diagramm, um die Werte eines Tages zu lesen. **Nutzungsverlauf** listet die Aktionen des laufenden Zeitraums und ihren Anteil am Budget. Numo liest dieselben Zahlen und dieselbe Prognose, wenn du nach deinem Budget fragst, und warnt dich auf der **Startseite**, wenn das Budget voraussichtlich vor der Erneuerung aufgebraucht ist.

## Text und Änderungen diktieren {#voice-dictation}

Mit dem Mikrofon neben einem unterstützten Feld kannst du Tickets, Ziele, Kommentare, Numo-Nachrichten, Feedback oder Routine-Anweisungen diktieren. Du benötigst Schreibrechte an dieser Stelle, ein funktionierendes Mikrofon und einen Browser mit Aufnahmeunterstützung. Erlaube den Mikrofonzugriff für die Website im Browser und im Betriebssystem. Verwende für eine entfernte Instanz HTTPS. In der Cloud muss KI-Budget verfügbar sein; selbst gehostete Instanzen benötigen zusätzlich funktionierende Anbieter für Transkription und Diktat. Persönliche Sprachschlüssel und Modellzuweisungen richtest du [weiter oben](#ai-keys-and-models) ein.

1. Öffne das gewünschte Formular oder Ticket und wähle dessen Mikrofon. In einem geöffneten Ticket schaltet Command+Umschalt+D unter macOS beziehungsweise Strg+Umschalt+D auf anderen Systemen die Sprachbearbeitung um. Unten am Bildschirm öffnet sich eine Diktierleiste, auf dem Telefon als Panel, mit der Aufnahmezeit und einer Welle, die deiner Stimme folgt. Der Rest der Oberfläche wartet, bis die Aufnahme endet.
2. Sprich in der Oberflächensprache, die der Transkription als Hinweis dient. Benenne Änderungen deutlich, etwa „Setze die Priorität auf hoch“. Wähle **Transkribieren** (✓), drücke Command+Eingabe unter macOS beziehungsweise Strg+Eingabe auf anderen Systemen (die Eingabetaste allein funktioniert ebenfalls) oder wiederhole das Tastenkürzel und warte dann auf Transkription und Numo-Verarbeitung. Um die Aufnahme zu verwerfen, wähle **Aufnahme verwerfen** (✕) oder drücke Esc, dann **Verwerfen**: Es wird nichts gesendet.
3. Prüfe das Ergebnis. Numo-Nachrichten, Kommentare und Routine-Anweisungen erhalten bearbeitbaren Text; lies ihn vor dem Senden oder Speichern. Erstellungsformulare erhalten Entwurfsfelder, die du noch bestätigen musst. Im Formular für ein neues Ticket mit aktivem Smart Fill überlässt das Diktat Titel (wenn Smart Fill ihn schreibt), Priorität, Aufwand, Kategorien und Ziel Smart Fill, außer du verlangst eine dieser Eigenschaften ausdrücklich, zum Beispiel „setze den Aufwand auf M“. Die Sprachbearbeitung eines bestehenden Tickets übernimmt Änderungen sofort: prüfe danach die Felder und korrigiere Fehler mit den üblichen Bedienelementen. Diktieren gewährt keine zusätzlichen Rechte.

### Verbrauch und Aufnahmegrenzen {#voice-limits}

Die Audiodaten werden an den konfigurierten Transkriptionsdienst gesendet und können anschließend von einem KI-Modell überarbeitet oder interpretiert werden. Die Bereinigung korrigiert Zeichensetzung, Füllwörter und Selbstkorrekturen; um die Wörter so einzufügen, wie sie gehört wurden, deaktiviere **Diktate bereinigen** unter **Kontoeinstellungen** > **Einstellungen** > **Spracheingabe**. Dann wird für deine Diktate kein Bereinigungsmodell aufgerufen. Mit oder ohne Bereinigung entfernt minddy Sätze, die Transkriptionsmodelle bei Stille erfinden, etwa Untertitel-Hinweise oder ein abschließendes „Danke fürs Zuschauen“. Öffentliches Feedback behält seine eigene Verarbeitung. Unter **Wortschatz**, direkt darunter, fügst du bis zu 50 Namen und Begriffe hinzu, die das Diktat in deiner Schreibweise schreiben soll; fülle **Gehört als** aus, um dieses Wort in jedem Diktat zu ersetzen, auch ohne Bereinigung. Es gelten die Anbieter- und Budgetregeln des Kontos; Aufnahme und anschließende Interpretation können getrennten Verbrauch verursachen. Öffentliches Feedback hat eigene Verfügbarkeits- und Abrechnungsregeln im [Feedback-Leitfaden](/docs/feedback). Die Demo auf der Startseite besitzt ein separates Limit und ist kein Diktatkontingent des Kontos.

Der Transkriptionsendpunkt für angemeldete Nutzer akzeptiert bis zu 10 MiB Audio und 30 Anfragen pro Konto und Stunde. Der gemeinsame Recorder stoppt nach 20 Minuten als Schutzmaßnahme. Kürzere Aufnahmen erleichtern die Prüfung. Behalte vorhandenen Text, bis das Ergebnis geprüft ist; der Recorder ist keine Audiosicherung.

### Nach einem fehlgeschlagenen Diktat fortfahren {#voice-recovery}

Bei verweigertem Zugriff aktiviere die Mikrofonberechtigung für die Website und für den Browser oder die Desktop-App im Betriebssystem. Wird kein Gerät gefunden, schließe ein Mikrofon an oder wähle es aus; ist es belegt, schließe die Anwendung, die es verwendet. Bei fehlender Aufnahmeunterstützung verwende einen kompatiblen Browser oder tippe den Text.

Bei Stille oder leerem Ergebnis prüfe das Eingabegerät und mache eine kurze hörbare Aufnahme. Teile zu große Aufnahmen auf. Eine Meldung zum Anfragelimit nennt eine Wartezeit; warte vor dem nächsten Versuch. Bei Budget- oder Anbieterfehlern prüfe KI-Verbrauch, Sprachzuweisungen und Instanzkonfiguration. Schlägt die Überarbeitung fehl, wird aber erkannter Text zurückgegeben, prüfe und bearbeite diesen Text. Prüfe vor der Wiederholung einer fehlgeschlagenen Ticketänderung die aktuellen Felder, damit du die Änderung nicht doppelt ausführst.