---
{
  "id": "numo",
  "locale": "de",
  "title": "Numo",
  "summary": "Arbeiten Sie mit Numo, verstehen Sie Berechtigungen und Ausführung, verbinden Sie MCP-Dienste und setzen Sie wartende oder unterbrochene Arbeit fort.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement",
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
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-670 source, de wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-670 source, de wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance)",
    "date": "2026-10-10"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Eine Projektaufgabe mit Numo erledigen",
    "Numos Berechtigungen verstehen",
    "Dauerhafte Numo-Turns und delegierte Arbeit verstehen",
    "Einen persönlichen MCP-Dienst mit Numo verbinden",
    "Gestoppte oder wartende Numo-Arbeit fortsetzen"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/work-with-numo-workflow.png",
      "alt": "Numo-Demonstrationsgespräch mit Seitenkontext, Prioritätsänderung und gespeicherter Antwort.",
      "caption": "Vorhandener Demonstrationsverlauf, für die Anzeige übersetzt. Die gespeicherte Antwort nennt AUR-11 und AUR-7. Die Aufnahme belegt keine neue Ausführung.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/de/numo-permissions-and-approvals-workflow.svg",
      "alt": "Numo-Berechtigungsmatrix für Projektaktionen, persönliche Verbindungen und Routinen.",
      "caption": "Projektzugriff und ausdrückliche Aufträge begrenzen Numo-Aktionen. Externe Inhalte können keine Berechtigung erteilen.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo: Zugriff und Autorisierung",
        "headers": [
          "Aktion oder Kontext",
          "Wer autorisiert",
          "Grenze"
        ],
        "rows": [
          [
            "Projektarbeit",
            "Mitglied mit Projektzugriff",
            "Die bestehenden Projektberechtigungen gelten weiterhin"
          ],
          [
            "Inhabereinstellungen",
            "Projektinhaber",
            "Mitglieder, Repository und Feedback-Einstellungen"
          ],
          [
            "Zugangsdaten und Sicherheit",
            "Kontoinhaber, in den Einstellungen",
            "Schlüssel, Git und Zwei-Faktor-Authentifizierung direkt einrichten"
          ],
          [
            "Öffentliche Feedback-Antwort",
            "Ausdrücklicher Benutzerauftrag",
            "Lesen einer Anfrage erlaubt keine öffentliche Antwort"
          ],
          [
            "Persönliches MCP",
            "Auftraggeber des Gesprächs",
            "Keine persönlichen Verbindungen anderer Mitglieder"
          ],
          [
            "Geplante Routine",
            "Aktueller Projektinhaber",
            "Verbindungen und KI-Budget des Inhabers"
          ],
          [
            "Entferntes MCP-Ergebnis",
            "Nicht vertrauenswürdiger Dienstinhalt",
            "Kann keine weiteren Aktionen autorisieren"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/de/numo-execution-model-flow.svg",
      "alt": "Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Bei Bedarf aktuellen Codeworker abwarten. Ereignisse wiedergeben; unklare Writes klären.",
      "caption": "Lesen Sie die Schritte in dieser Reihenfolge. Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Bei Bedarf aktuellen Codeworker abwarten. Ereignisse wiedergeben; unklare Writes klären.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Absicht, Nachricht und UUID speichern"
          },
          {
            "title": "Turn beanspruchen, Werkzeuge und Ergebnisse sichern"
          },
          {
            "title": "Bei Bedarf aktuellen Codeworker abwarten"
          },
          {
            "title": "Ereignisse wiedergeben; unklare Writes klären"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/numo-mcp-connections-workflow.png",
      "alt": "Persönliche MCP-Einstellungen mit leerer Liste und Schaltfläche zum Hinzufügen eines Servers.",
      "caption": "Numo-Verbindungen sind persönlich. Projektroutinen verwenden die Verbindungen des Projektinhabers.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/numo-mcp-connections-config-workflow.png",
      "alt": "Formular für einen eigenen MCP-Server mit erweiterten Einstellungen für Authentifizierung, Transport und Header.",
      "caption": "Formular für einen eigenen MCP-Server mit erweiterten Einstellungen für Authentifizierung, Transport und Header. Es wurden keine Zugangsdaten eingegeben und kein Server kontaktiert.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        940
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

Numo arbeitet mit dem Kontext Ihrer Unterhaltung und den Berechtigungen Ihres Kontos. Formulieren Sie einen begrenzten Auftrag und prüfen Sie das Ergebnis. Die Abschnitte zu Freigaben und Ausführung erklären delegierte oder geplante Arbeit. Prüfen Sie bei wartenden oder fehlgeschlagenen Schritten den gespeicherten Zustand, bevor Sie einen Auftrag wiederholen.

## Eine Projektaufgabe mit Numo erledigen {#work-with-numo}

Öffnen Sie das betreffende Ticket oder Projekt und klicken Sie auf die schwebende Numo-Schaltfläche. Die aktuelle Seite wird zum Gesprächskontext. Kontextaktionen, die Arbeit an Numo übergeben, öffnen dasselbe Panel. Sie benötigen Projektzugriff und verfügbares KI-Budget oder einen kompatiblen eigenen Schlüssel.

1. Prüfen Sie den Kontext im Eingabebereich. Nennen Sie das Ticket ausdrücklich, wenn mehrere Einträge relevant sind.
2. Wählen Sie Gesprächsmodell und Denkintensität. Für den Code-Worker gelten separate Kontoeinstellungen.
3. Senden Sie einen begrenzten Auftrag, etwa: „Lies dieses Ticket und schlage Abnahmekriterien vor. Ändere seinen Status nicht.“
4. Lesen Sie die Antwort und öffnen Sie Ticket- oder Quellenlinks. Prüfen Sie nach einer Änderung das betroffene Objekt.

![Numo-Demonstrationsgespräch mit Seitenkontext, Prioritätsänderung und gespeicherter Antwort.](/documentation/de/work-with-numo-workflow.png)

### Fortsetzen oder delegieren {#continue}

Über die Gesprächsliste bleiben frühere Unterhaltungen erreichbar. Setzen Sie das Gespräch mit den relevanten Entscheidungen fort. Änderungen am Repository delegiert Numo an einen Worker in einer Server-Sandbox und zeigt Fortschritt, Dateien, Prüfungen und Pull Request. Der Worker arbeitet nicht in Ihrem lokalen Ordner.

Wenn Numo Eingaben anfordert, senden Sie Ihre Auswahl, bevor abhängige Arbeit weitergehen kann. Eine Verbrauchs- oder Fehlerkarte erklärt den Abbruch. Prüfen Sie externe Schreibaktionen, bevor Sie deren Wiederholung anfordern.

## Numos Berechtigungen verstehen {#numo-permissions-and-approvals}

Numo handelt innerhalb der Rechte des aktuellen Benutzers. Ein Chat-Auftrag gibt Mitgliedern keinen Zugriff auf Eigentümereinstellungen. Eigentümer verwalten Mitglieder, Integrationen, Repository-Verknüpfungen und Feedback-Einstellungen. Persönliche Einstellungen gehören zum aktuellen Konto.

Numo kann unterstützte Kontopräferenzen und für Eigentümer freigegebene Projekteinstellungen ändern. Anbieterzugangsdaten, native Abonnementverbindungen, Git-Verbindungen, Zwei-Faktor-Authentifizierung und Avatar-Dateien richten Sie selbst ein. Code-Agent sowie OpenCode-Modell und Denkstufe wählen Sie ausschließlich in den KI-Kontoeinstellungen.

### Die Aktion freigeben {#authorization}

Beschreiben Sie Änderung und Umfang. Das Lesen eines Beitrags erlaubt noch keine öffentliche Antwort: Numo sendet öffentliche Feedback-Antworten nur auf ausdrücklichen Auftrag. Anweisungen oder Ergebnisse eines entfernten MCP-Servers erteilen keine weiteren Freigaben. Verbinden Sie nur Dienste, denen Sie die vorgesehenen Informationen und Aktionen anvertrauen.

Eine Anfrage kann einen externen Anbieter erreichen. Das Deaktivieren seiner Verbindung verhindert neue Aufrufe, ruft gesendete aber nicht zurück. Prüfen Sie Schreibaktionen nach einem Timeout beim Empfänger, bevor Sie sie wiederholen.

### Persönlicher und geplanter Kontext {#context}

Gespräche können nicht die persönlichen MCP-Verbindungen anderer Mitglieder nutzen. Projektroutinen verwenden Verbindungen und KI-Budget des Eigentümers. Nach einem Eigentümerwechsel starten Sie einen neuen Durchlauf unter dem aktuellen Eigentümer. Alte Durchläufe dürfen frühere Zugangsdaten nicht weiter nutzen. Eine Server-Sandbox erbt weder lokale Dateien noch persönliche Desktop-Sitzungen.

![Numo-Berechtigungsmatrix für Projektaktionen, persönliche Verbindungen und Routinen.](/documentation/de/numo-permissions-and-approvals-workflow.svg)

## Dauerhafte Numo-Turns und delegierte Arbeit verstehen {#numo-execution-model}

Interaktive Nachrichten, Kontextaktionen und Routinen gelangen in Numo-Konversationen. Gesprächsmodell und Denkstufe werden im Eingabefeld gewählt. Delegierte Repository-Arbeit verwendet den Code-Agenten aus den KI-Kontoeinstellungen: OpenCode nutzt sein konfiguriertes API-Modell und die Denkstufe; Codex oder Claude Code nutzt bei freigeschaltetem Zugriff das verbundene persönliche Abonnement und CLI-Vorgaben. Direkte Minddy-Werkzeuge benötigen kein Repository. Codearbeit öffnet nur bei Bedarf eine gehostete Serversandbox für das verknüpfte Repository. Eine Routine erzeugt eine neue Konversation mit gespeicherter Anweisung und Eigentümer-/Projektkontext. Eine Desktopsitzung muss nicht geöffnet bleiben. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

Gehostete Codex-Abonnementauthentifizierung ist nicht allgemein verfügbar. OpenAI schließt app-server-Authentifizierung für gehostete Dienste ausdrücklich aus und verweist auf Sign in with ChatGPT. Minddy benötigt vor der Freigabe eine autorisierte Integration. Bisherige eingeschränkte technische Tests belegen weder die Erlaubnis noch eine echte Token-Erneuerung oder einen Start ohne Wiederholung. Die kostenpflichtige Claude-Code-Ausführung bleibt ungetestet. Das Entfernen von UI-Badges ändert diese Bedingungen nicht. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

Vor der Delegation erhält Numo die aktuelle Kontoauswahl und die Fähigkeiten des gewählten Adapters. Sobald ein Worker gestartet ist, sind dessen gespeicherte Engine und Fähigkeiten für diesen Lauf maßgeblich, auch nach Änderungen an den Kontoeinstellungen. Numo nennt diesen Worker, wenn es delegierte Arbeit erklärt. Ist die Kontoauswahl nicht lesbar, prüft es die Einstellungen, statt zu raten.

Der native Adapter stellt kontrollierte Minddy-Werkzeuge über MCP bereit. Anbietereigene integrierte Werkzeuge, Bildeingaben und Subagenten sind in diesen Adaptern nicht verfügbar. Worker-Fragen beantwortet es anhand verlässlichen Gesprächskontexts oder fragt dich, wenn eine Entscheidung fehlt. Numo darf eigene unterstützte Werkzeuge innerhalb deiner Autorisierung verwenden; nicht unterstützte Engine-Operationen erfindet es nicht.

![Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Bei Bedarf aktuellen Codeworker abwarten. Ereignisse wiedergeben; unklare Writes klären.](/documentation/de/numo-execution-model-flow.svg)

### Ausführung und Anzeige trennen {#state}

Eine Absicht wird mit Anfrage-UUID und Nachricht als dauerhafter Turn gespeichert. Zustände gehen von `queued` zu `running` und dann `completed`, `waiting_input` oder `waiting_work`; `stopping`/`stopped` und `retryable`/`failed` kennzeichnen Unterbrechung und Fehler. SSE zeigt persistierte Aktivität, steuert aber nicht Ausführung. Neuverbindung liest gespeicherte Nachrichten/Ereignisse nach ihrer Sequenz. Workerabschluss setzt nur den auf diesen Lauf wartenden Parent fort; doppelte und veraltete Ereignisse erzeugen keine zweite Aufgabe. Projektkontext ist kein Zugriff: Ein privater Chat bleibt privat.

### Unklare Änderungen behandeln {#mutations}

Vor Mutation speichert das System Vorgang und Checkpoint. Abgeschlossene Ergebnisse werden wiederverwendet. Unterbrochene Lesevorgänge dürfen wiederholt werden; Mutationen mit unklarem Ausgang gehen nach `reconciling` ohne automatische Wiederholung. Prüfen Sie das echte Ziel vor erneutem externem Schreiben. Routineverbindungen und Budget unterliegen Eigentum und Kostenschutz; andere Mitglieder können keine persönlichen MCP-Zugänge des bisherigen Eigentümers ausleihen. Ein gestoppter Parent unterbricht aktive Delegation, aber eine schon gesendete externe Aktion kann noch enden.

## Einen persönlichen MCP-Dienst mit Numo verbinden {#numo-mcp-connections}

Öffnen Sie MCP für Numo in den Kontoeinstellungen. Wählen Sie einen Katalogdienst oder einen weiteren öffentlichen HTTPS-MCP-Server. Katalog und Registry-Suche umgehen keine Registrierungs- oder Freigabevorgaben des Anbieters. Numo kann im interaktiven Gespräch eine Verbindung vorbereiten; unbeaufsichtigte Routinen können keine erstellen.

Nutzen Sie OAuth oder erweiterte Einstellungen für Bearer-Token, keine Authentifizierung oder verschlüsselte Header. Streamable HTTP ist Standard; älteres SSE wird unterstützt. Geheimnisse gehören in Zugangsdaten oder Header, nie in die URL. Lokale Befehle und private Netzwerkziele sind ausgeschlossen. Bei einer bestehenden OAuth-App registrieren Sie die angezeigte Callback-URL und tragen Client-ID und Geheimnis ein. Desktop-OAuth öffnet den Systembrowser und kehrt zur App zurück.

![Persönliche MCP-Einstellungen mit leerer Liste und Schaltfläche zum Hinzufügen eines Servers.](/documentation/de/numo-mcp-connections-workflow.png)

### Prüfen und verwalten {#manage}

Das Verbindungsmenü erlaubt Test, Bearbeitung, erneute Verbindung, Deaktivierung und Entfernung. Ein orangefarbenes Authentifizierungszeichen erfordert erneute Anmeldung. Leere Geheimnisfelder behalten Werte; ein URL-Wechsel löscht Zugangsdaten und Header. Entfernen Sie Bearer-Token über das eigene Steuerelement; `{}` löscht Header.

Deaktivierung stoppt neue Aufrufe, keine gesendeten. Grenzen: 30 Sekunden, 1 MiB Transport und 64 KB Ergebnis. Prüfen Sie Schreibaktionen nach Timeouts beim Ziel. Routinen verwenden Eigentümerverbindungen; andere Mitglieder können sie nicht übernehmen.

![Formular für einen eigenen MCP-Server mit erweiterten Einstellungen für Authentifizierung, Transport und Header.](/documentation/de/numo-mcp-connections-config-workflow.png)

## Gestoppte oder wartende Numo-Arbeit fortsetzen {#recover-numo-work}

Öffnen Sie das bestehende Gespräch und lesen Sie letzte Nachrichten und Worker-Karte. Unterscheiden Sie ausstehende Eingaben, Kontobudget, Routinenlimit, ausgeschöpfte Operationszuteilung und technische Fehler. Ein geschlossenes Panel beweist keinen Arbeitsabbruch.

Beantworten Sie auf einer aktiven Fragekarte alle erforderlichen Fragen und senden Sie die Antworten gemeinsam. Frühere Karten sind Aufzeichnungen ohne neue Eingabefunktion. Überspringen ersetzt keine fehlenden Informationen und erlaubt keine davon abhängigen Änderungen.

### Budget und Fehler {#recovery}

Die Kontolimit-Karte zeigt gegebenenfalls das Rücksetzdatum sowie Tarif- oder Schlüsseloptionen. Die Routinenkarte führt zur Verwaltung; prüfen Sie das Limit pro Durchlauf. Eine Operationszuteilung betrifft diese Operation. Wiederholen hebt das Limit nicht auf. Eigene Modellschlüssel machen Sandbox-Rechenleistung nicht kostenlos.

Ein fehlgeschlagener Lauf kann nur mit einem erhaltenen Checkpoint fortgesetzt werden. Prüfen Sie Ticketänderungen, Branch, PR und externe Dienste vor dem Wiederholen: Eine Schreibaktion kann trotz verlorener Antwort erfolgreich gewesen sein. Beschreiben Sie den Rest und bitten Sie um Fortsetzung. Ohne nutzbaren Checkpoint übergeben Sie den geprüften Zustand in einem neuen Auftrag. Melden Sie anhaltende Fehler mit Gesprächsbezug, aber ohne Zugangsdaten.

## Ein Ziel für Feedback wählen {#feedback-objectives}

Feedback-Ziele erfordern eine ausdrückliche Auswahl. Bitten Sie Numo, eine Anfrage mit einem benannten Projektziel zu verknüpfen oder diese Zuordnung zu entfernen. Numo löst Rückmeldung und Ziel vor der Änderung auf. Eine allgemeine Prüfung oder Kategorisierung erlaubt keine Zielzuweisung. Eine Integration kann die vom Eigentümer gewählte Vorgabe liefern. Die Umwandlung übernimmt Ziel und Kategorien; ohne Auswahl bleibt das Ziel leer.
