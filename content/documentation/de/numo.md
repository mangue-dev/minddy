---
{
  "id": "numo",
  "locale": "de",
  "title": "Numo",
  "summary": "Arbeite mit Numo, verstehe Berechtigungen und Ausführung, verbinde MCP-Dienste und setze wartende oder unterbrochene Arbeit fort.",
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
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:MIN-793 (Numo writes downloadable files: added passage checked against lib/server/assistant/tools.ts, conversation-attachments.ts, markdown-pdf.ts and components/assistant/generated-file-cards.tsx; no figure recaptured; earlier evidence retained in git history)",
    "language": "agent:MIN-793 (de translation of the added passage with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
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
    "Dauerhafte Numo-Turns verstehen",
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 21,
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
      "alt": "Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Auf deine Antwort warten, wenn eine Eingabe nötig ist. Ereignisse wiedergeben; unklare Writes klären.",
      "caption": "Lies die Schritte in dieser Reihenfolge. Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Auf deine Antwort warten, wenn eine Eingabe nötig ist. Ereignisse wiedergeben; unklare Writes klären.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-16",
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
            "title": "Auf deine Antwort warten, wenn eine Eingabe nötig ist"
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "alt": "Notion-Verbindungsassistent mit der aus dem Katalog bekannten Anmeldemethode.",
      "caption": "Anmeldeschritt eines Katalogdienstes. Es wurden keine Zugangsdaten eingegeben und kein Server kontaktiert.",
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        560,
        374
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

Numo arbeitet mit dem Kontext deiner Unterhaltung und den Berechtigungen deines Kontos. Formuliere einen begrenzten Auftrag und prüfe das Ergebnis. Die Abschnitte zu Freigaben und Ausführung erklären geplante Arbeit. Prüfe bei wartenden oder fehlgeschlagenen Schritten den gespeicherten Zustand, bevor du einen Auftrag wiederholst.

## Eine Projektaufgabe mit Numo erledigen {#work-with-numo}

Öffne das betreffende Ticket oder Projekt und klicke auf die schwebende Numo-Schaltfläche. Die aktuelle Seite wird zum Gesprächskontext. Kontextaktionen, die Arbeit an Numo übergeben, öffnen dasselbe Panel. Du benötigst Projektzugriff und verfügbares KI-Budget oder einen kompatiblen eigenen Schlüssel.

1. Prüfe den Kontext im Eingabebereich. Nenne das Ticket ausdrücklich, wenn mehrere Einträge relevant sind. Um ein Ticket als Kontext hinzuzufügen, tippe `@` im Eingabebereich oder verwende **Kontext hinzufügen** → **Ticket**; eine Beschreibung listet auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets unter **Inhaltlich verwandt** auf.
2. Wähle Gesprächsmodell und Denkintensität über das Anbieterlogo neben dem Mikrofon; beim Darüberfahren siehst du das aktuelle Modell. Diese Auswahl gilt für das Gespräch.
3. Sende einen begrenzten Auftrag, etwa: „Lies dieses Ticket und schlage Abnahmekriterien vor. Ändere seinen Status nicht.“
4. Lies die Antwort und öffne Ticket- oder Quellenlinks. Prüfe nach einer Änderung das betroffene Objekt.

In einem neuen, leeren Gespräch schlagen vier Zeilen über dem Eingabefeld Aufträge vor, die zur aktuellen Seite passen, etwa **Dieses Ticket zusammenfassen** oder **Einen Umsetzungsplan schreiben**, wenn ein Ticket im Seitenpanel geöffnet ist. Eine Zeile füllt das Eingabefeld, ohne es abzusenden, sodass du den Auftrag zuerst anpassen kannst. Die Zeilen verschwinden, sobald das Eingabefeld Text enthält, und erscheinen wieder, wenn du es leerst. Sie werden im Desktop-Layout angezeigt, nicht auf einem Telefon.

Numo kann sich außerdem die Bilder in einer Ticket- oder Zielbeschreibung, einem Plan, einem Kommentar, einer Seite oder deinem Notizbuch ansehen, wenn das Modell der Unterhaltung Bilder annimmt. Ohne diese Fähigkeit sagt Numo, dass es ein Bild nicht ansehen konnte, statt es zu beschreiben.

Numo kann auch eine Datei zum Herunterladen schreiben: einen Bericht oder ein Dokument als PDF, einen Export als CSV oder eine Text-, Markdown-, HTML-, JSON-, XML-, SVG- oder Kalenderdatei. Bitte in deiner Anfrage darum; Numo kann sie aus Dateien erstellen, die du der Unterhaltung hinzugefügt hast. Die Datei erscheint als Karte unter seiner Antwort: Ein Klick auf die Karte öffnet ihre Vorschau, wenn das Format es erlaubt, **Herunterladen** speichert sie, und das Menü daneben bietet **Vorschau** und **Inhalt kopieren**. Die Datei bleibt im privaten Speicher deiner Unterhaltung; um sie mit dem Projekt zu teilen, bitte Numo, sie an ein Ticket, ein Ziel oder einen Kommentar anzuhängen, den es dort schreibt. Ein PDF verwendet die Standardschriften: Zeichen außerhalb westeuropäischer Alphabete und Emojis fehlen darin.

Das Standardmodell von Numo stammt aus **Kontoeinstellungen → KI & Numo → Standardmodell für Numo**: App-Standard oder ein persönliches Modell für den aktiven Anbieter. Eine ausdrückliche Modellauswahl im Gespräch hat Vorrang. Siehe [KI-Einstellungen und Nutzung](/docs/ai-settings-and-usage#ai-keys-and-models).

![Numo-Demonstrationsgespräch mit Seitenkontext, Prioritätsänderung und gespeicherter Antwort.](/documentation/de/work-with-numo-workflow.png)

### Ein Gespräch fortsetzen {#continue}

Über die Gesprächsliste bleiben frühere Unterhaltungen erreichbar. Setze das Gespräch mit den relevanten Entscheidungen fort. Numo organisiert und verfolgt Arbeit: Es liest und aktualisiert Tickets, Pläne, Seiten und andere Minddy-Inhalte und kann verknüpfte Pull Requests lesen. Auf deine Bitte kann es außerdem einen Pull Request kommentieren, bereits erledigte Review-Unterhaltungen auflösen und ihn zusammenführen. Wenn Numo Tickets sucht, stehen Textübereinstimmungen und exakte Kennungen zuerst; eine beschreibende Suche kann inhaltlich gefundene Tickets desselben Projekts ergänzen, die Numo prüfen soll, bevor es sich auf sie stützt. Es schreibt keinen Code und pusht keine Commits. Wenn Code geschrieben werden soll, kopiere den Prompt des Tickets für deinen eigenen Coding-Agenten; siehe [Code-Arbeit und Pull Requests](/docs/code-work#external-coding-agents).

Wenn Numo Eingaben anfordert, sende deine Auswahl, bevor abhängige Arbeit weitergehen kann. Eine Verbrauchs- oder Fehlerkarte erklärt den Abbruch. Prüfe externe Schreibaktionen, bevor du deren Wiederholung anforderst.

## Numos Berechtigungen verstehen {#numo-permissions-and-approvals}

Numo handelt innerhalb der Rechte und der Rolle des aktuellen Benutzers. Ein Chat-Auftrag gibt Mitgliedern keinen Zugriff auf Eigentümereinstellungen. Für einen Leser verwendet Numo, im Chat oder über `@Numo` in einem Kommentar, den er verfassen darf, nur Lesewerkzeuge, und die Nutzung wird dem Leser angerechnet. Eigentümer verwalten Mitglieder, Integrationen, Repository-Verknüpfungen und Feedback-Einstellungen. Persönliche Einstellungen gehören zum aktuellen Konto.

Numo kann unterstützte Kontopräferenzen und für Eigentümer freigegebene Projekteinstellungen ändern. Anbieterzugangsdaten, Git-Verbindungen, Zwei-Faktor-Authentifizierung und Avatar-Dateien richtest du selbst ein.

### Die Aktion freigeben {#authorization}

Beschreibe Änderung und Umfang. Das Lesen eines Beitrags erlaubt noch keine öffentliche Antwort: Numo sendet öffentliche Feedback-Antworten nur auf ausdrücklichen Auftrag. Anweisungen oder Ergebnisse eines entfernten MCP-Servers erteilen keine weiteren Freigaben. Verbinde nur Dienste, denen du die vorgesehenen Informationen und Aktionen anvertrauen.

Eine Anfrage kann einen externen Anbieter erreichen. Das Deaktivieren seiner Verbindung verhindert neue Aufrufe, ruft gesendete aber nicht zurück. Prüfe Schreibaktionen nach einem Timeout beim Empfänger, bevor du sie wiederholst.

### Persönlicher und geplanter Kontext {#context}

Gespräche können nicht die persönlichen MCP-Verbindungen anderer Mitglieder nutzen. Projektroutinen verwenden Verbindungen und KI-Budget des Eigentümers. Nach einer Übertragung des Eigentums werden die Routinen des früheren Eigentümers im Projekt pausiert; der neue Eigentümer erstellt die Routinen, die weiterlaufen sollen. Alte Durchläufe dürfen frühere Zugangsdaten nicht weiter nutzen. Numo läuft auf dem Server: Es liest keine Dateien auf deinem Computer und nutzt keine persönlichen Sitzungen.

![Numo-Berechtigungsmatrix für Projektaktionen, persönliche Verbindungen und Routinen.](/documentation/de/numo-permissions-and-approvals-workflow.svg)

## Dauerhafte Numo-Turns verstehen {#numo-execution-model}

Interaktive Nachrichten, Kontextaktionen und Routinen gelangen in Numo-Konversationen. Gesprächsmodell und Denkstufe werden im Eingabefeld gewählt. Numo handelt über seine Minddy-Werkzeuge und die persönlichen MCP-Verbindungen, die du hinzugefügt hast; es benötigt kein Repository. Eine Routine erzeugt eine neue Konversation mit gespeicherter Anweisung und Eigentümer-/Projektkontext. Eine Desktopsitzung muss nicht geöffnet bleiben.

![Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Auf deine Antwort warten, wenn eine Eingabe nötig ist. Ereignisse wiedergeben; unklare Writes klären.](/documentation/de/numo-execution-model-flow.svg)

### Ausführung und Anzeige trennen {#state}

Eine Absicht wird mit Anfrage-UUID und Nachricht als dauerhafter Turn gespeichert. Zustände gehen von `queued` zu `running` und dann `completed` oder `waiting_input`; `stopping`/`stopped` und `retryable`/`failed` kennzeichnen Unterbrechung und Fehler. SSE zeigt persistierte Aktivität, steuert aber nicht Ausführung. Neuverbindung liest gespeicherte Nachrichten/Ereignisse nach ihrer Sequenz. Doppelte und veraltete Ereignisse erzeugen keine zweite Aufgabe. Projektkontext ist kein Zugriff: Ein privater Chat bleibt privat.

### Unklare Änderungen behandeln {#mutations}

Vor Mutation speichert das System Vorgang und Checkpoint. Abgeschlossene Ergebnisse werden wiederverwendet. Unterbrochene Lesevorgänge dürfen wiederholt werden; Mutationen mit unklarem Ausgang gehen nach `reconciling` ohne automatische Wiederholung. Prüfe das echte Ziel vor erneutem externem Schreiben. Routineverbindungen und Budget unterliegen Eigentum und Kostenschutz; andere Mitglieder können keine persönlichen MCP-Zugänge des bisherigen Eigentümers ausleihen.

Wenn du Numo stoppst, endet sein Turn. Eine bereits gesendete externe Aktion kann noch abgeschlossen werden. Ein Gespräch, das auf Code-Arbeit aus einer früheren Version wartete, wird automatisch gestoppt und kehrt in den Ruhezustand zurück.

## Einen persönlichen MCP-Dienst mit Numo verbinden {#numo-mcp-connections}

Öffne in den Kontoeinstellungen **KI & Numo** und verwende die Karte **MCP für Numo**. Links auf den früheren Tab MCP für Numo führen dorthin. Wähle einen Katalogdienst oder einen weiteren öffentlichen HTTPS-MCP-Server. Katalog und Registry-Suche umgehen keine Registrierungs- oder Freigabevorgaben des Anbieters. Numo kann im interaktiven Gespräch eine Verbindung vorbereiten; unbeaufsichtigte Routinen können keine erstellen.

Die Verbindung läuft in einem Assistenten. Ein eigener oder im Verzeichnis gefundener Server fragt zuerst Name und HTTPS-Adresse ab; ein Katalogdienst öffnet direkt beim Anmeldeschritt. Ein Katalogdienst, eine gespeicherte Verbindung oder ein Verzeichniseintrag, der ein Token angibt, kennt seine Anmeldemethode bereits: Der Schritt zeigt sie an, und **Andere Methode verwenden** ändert sie. Andernfalls wählst du **Mit OAuth anmelden**, **Bearer-Token** oder **Keine Authentifizierung**. Unter **Erweiterte Einstellungen** liegen Transport (standardmäßig Streamable HTTP, älteres SSE wird unterstützt) und verschlüsselte Header. Geheimnisse gehören in Zugangsdaten oder Header, nie in die URL. Lokale Befehle und private Netzwerkziele sind ausgeschlossen. Bei einer bestehenden OAuth-App registrierst du die angezeigte Callback-URL und trägst Client-ID und Geheimnis ein. Nach dem Speichern wartet der letzte Schritt auf die Anmeldung, testet dann die Verbindung und zeigt, wie viele Tools Numo gefunden hat. Desktop-OAuth öffnet den Systembrowser und kehrt zur App zurück.

![Persönliche MCP-Einstellungen mit leerer Liste und Schaltfläche zum Hinzufügen eines Servers.](/documentation/de/numo-mcp-connections-workflow.png)

### Prüfen und verwalten {#manage}

Das Verbindungsmenü erlaubt Test, Bearbeitung, erneute Verbindung, Deaktivierung und Entfernung. Ein orangefarbenes Authentifizierungszeichen erfordert erneute Anmeldung. Leere Geheimnisfelder behalten Werte; ein URL-Wechsel löscht Zugangsdaten und Header. Entferne Bearer-Token über das eigene Steuerelement; `{}` löscht Header.

Deaktivierung stoppt neue Aufrufe, keine gesendeten. Grenzen: 30 Sekunden, 1 MiB Transport und 64 KB Ergebnis. Prüfe Schreibaktionen nach Timeouts beim Ziel. Routinen verwenden Eigentümerverbindungen; andere Mitglieder können sie nicht übernehmen.

![Notion-Verbindungsassistent mit der aus dem Katalog bekannten Anmeldemethode.](/documentation/de/numo-mcp-connections-config-workflow.png)

## Gestoppte oder wartende Numo-Arbeit fortsetzen {#recover-numo-work}

Öffne das bestehende Gespräch und lies letzte Nachrichten und Karten. Unterscheide ausstehende Eingaben, Kontobudget, Routinenlimit, ausgeschöpfte Operationszuteilung und technische Fehler. Ein geschlossenes Panel beweist keinen Arbeitsabbruch.

Beantworte auf einer aktiven Fragekarte alle erforderlichen Fragen und sende die Antworten gemeinsam. Frühere Karten sind Aufzeichnungen ohne neue Eingabefunktion. Überspringen ersetzt keine fehlenden Informationen und erlaubt keine davon abhängigen Änderungen.

### Budget und Fehler {#recovery}

Die Kontolimit-Karte zeigt gegebenenfalls das Rücksetzdatum sowie Plan- oder Schlüsseloptionen. Die Routinenkarte führt zur Verwaltung; prüfe das Limit pro Durchlauf. Eine Operationszuteilung betrifft diese Operation. Wiederholen hebt das Limit nicht auf.

Ein fehlgeschlagener Lauf kann nur mit einem erhaltenen Checkpoint fortgesetzt werden. Prüfe Ticketänderungen, Seiten und externe Dienste vor dem Wiederholen: Eine Schreibaktion kann trotz verlorener Antwort erfolgreich gewesen sein. Beschreibe den Rest und bitte um Fortsetzung. Ohne nutzbaren Checkpoint übergibst du den geprüften Zustand in einem neuen Auftrag. Melde anhaltende Fehler mit Gesprächsbezug, aber ohne Zugangsdaten.

## Ein Ziel für Feedback wählen {#feedback-objectives}

Feedback-Ziele erfordern eine ausdrückliche Auswahl. Bitte Numo, eine Anfrage mit einem benannten Projektziel zu verknüpfen oder diese Zuordnung zu entfernen. Numo löst Rückmeldung und Ziel vor der Änderung auf. Eine allgemeine Prüfung oder Kategorisierung erlaubt keine Zielzuweisung. Eine Integration kann die vom Eigentümer gewählte Vorgabe liefern. Die Umwandlung übernimmt Ziel und Kategorien; ohne Auswahl bleibt das Ziel leer.
