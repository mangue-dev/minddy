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
  "revision": 33,
  "sourceRevision": 33,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-08",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "app/(app)/home/page.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts",
      "lib/server/numo-notes.ts",
      "lib/server/numo/memory-prompt.ts",
      "components/settings/account-numo-memory-section.tsx",
      "lib/server/assistant/long-message.ts",
      "lib/server/assistant/create-page-database.ts",
      "lib/server/numo/journal-content.ts",
      "lib/server/numo/journal-prompt.ts",
      "lib/server/numo/wake.ts",
      "lib/server/assistant/proactive-guard.ts",
      "components/settings/account-numo-background-section.tsx",
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts"
    ]
  },
  "review": {
    "revision": 33,
    "fact": "agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-915 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-927 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-923 passage with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-930 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-08"
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 33,
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
      "revision": 33,
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

1. Prüfe den Kontext im Eingabebereich. Nenne das Ticket ausdrücklich, wenn mehrere Einträge relevant sind. Um ein Ticket als Kontext hinzuzufügen, tippe `@` im Eingabebereich oder verwende **Kontext hinzufügen**, das den Kontext in dieselben Abschnitte wie das Menü `@` gliedert, Tickets unter **Tickets** und deine verbundenen MCP-Server unter **MCP-Server**; eine Beschreibung listet auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets unter **Inhaltlich verwandt** auf.
2. Wähle Anbieter, Gesprächsmodell und Denkintensität über das Anbieterlogo neben dem Mikrofon; beim Darüberfahren siehst du das aktuelle Modell. Diese Auswahl gilt für das Gespräch. Bietet das Modell keine Einstellung der Denkintensität, bleibt der Regler auf **Kein Reasoning**; bei einem Modell, das immer nachdenkt, nutzt **Kein Reasoning** dessen leichteste Stufe.
3. Sende einen begrenzten Auftrag, etwa: „Lies dieses Ticket und schlage Abnahmekriterien vor. Ändere seinen Status nicht.“
4. Lies die Antwort und öffne Ticket- oder Quellenlinks. Prüfe nach einer Änderung das betroffene Objekt. Tickets, Ziele, Projekte, Seiten und Mitglieder, die Numo gefunden hat, erscheinen in der Antwort als Erwähnungs-Chips: Ein Chip öffnet, worauf er verweist, und was du nicht sehen kannst, erscheint als **Nicht verfügbar**. Numo setzt diese Erwähnungen auch in das, was es schreibt, etwa Ticketbeschreibungen und Pläne, Zielbeschreibungen, Kommentare, Seiten und das Notizbuch, nur für Elemente, die es eindeutig ermittelt hat; ein dort erwähntes Mitglied wird wie bei jeder Erwähnung benachrichtigt.

In einem neuen, leeren Gespräch schlagen vier Zeilen über dem Eingabefeld Aufträge vor, die zur aktuellen Seite passen, etwa **Dieses Ticket zusammenfassen** oder **Einen Umsetzungsplan schreiben**, wenn ein Ticket im Seitenpanel geöffnet ist. Eine Zeile füllt das Eingabefeld, ohne es abzusenden, sodass du den Auftrag zuerst anpassen kannst. Die Zeilen verschwinden, sobald das Eingabefeld Text enthält, und erscheinen wieder, wenn du es leerst. Sie werden im Desktop-Layout angezeigt, nicht auf einem Telefon. Das Eingabefeld unten auf der **Startseite** zeigt dieselben Zeilen, mit Vorschlägen wie **Den Fokus für heute wählen** oder **Überfälliges finden**. Die **Startseite** ist selbst eine Unterhaltung mit Numo, wie das Panel ohne seine Kopfzeile: Jeder Besuch öffnet eine neue, außer eine Antwort läuft noch, und sie bleibt von der im Panel geöffneten getrennt; die vorherige bleibt im Verlauf, und die Schaltfläche **Neue Unterhaltung** oben rechts beginnt eine weitere. Sobald Numo seine Zusammenfassung geschrieben hat, sind die Zeilen der **Startseite** die Vorschläge, die es dazu geschrieben hat ([Numos Zusammenfassung auf der Startseite](#home-word)).

Auf der **Startseite** und im Numo-Panel, wenn es vergrößert ist oder den Fokus hat, kannst du lostippen, ohne ins Eingabefeld zu klicken: Eine schnelle Folge von Tasten außerhalb eines Textfelds landet im Eingabefeld, das den Fokus übernimmt. Eine einzelne Taste löst weiterhin ihr Tastenkürzel aus, etwa C für ein neues Ticket, auf diesen Bildschirmen rund 0,2 Sekunden später. G gefolgt von einer Taste bleibt eine Navigationsfolge; eine dritte Taste in der Folge macht daraus Text.

Um Numo zu einer Textstelle zu fragen, markiere sie in einem Editor, etwa auf einer Seite oder in einer Ticketbeschreibung, und wähle am Computer **Numo fragen** in der Auswahlleiste. Das Panel öffnet sich, ohne etwas zu senden: Neben der Seite oder dem Ticket, aus dem sie stammt, erscheint die Textstelle als Kontext-Pill mit ihren ersten Wörtern; fährst du mit der Maus über die Pill, siehst du die ganze Stelle. Tippe deine Frage, etwa „Formuliere das knapper“ oder „Mach daraus Tickets“, und sende sie ab. Die Textstelle geht nur mit dieser Nachricht mit. Um sie wegzulassen, entferne ihre Pill mit dem Kreuz.

Numo kann sich außerdem die Bilder in einer Ticket- oder Zielbeschreibung, einem Plan, einem Kommentar, einer Seite oder deinem Notizbuch ansehen, wenn das Modell der Unterhaltung Bilder annimmt. Ohne diese Fähigkeit sagt Numo, dass es ein Bild nicht ansehen konnte, statt es zu beschreiben.

Numo kann auch eine Datei zum Herunterladen schreiben: einen Bericht oder ein Dokument als PDF, einen Export als CSV oder eine Text-, Markdown-, HTML-, JSON-, XML-, SVG- oder Kalenderdatei. Bitte in deiner Anfrage darum; Numo kann sie aus Dateien erstellen, die du der Unterhaltung hinzugefügt hast. Die Datei erscheint als Karte unter seiner Antwort: Ein Klick auf die Karte öffnet ihre Vorschau, wenn das Format es erlaubt, **Herunterladen** speichert sie, und das Menü daneben bietet **Vorschau** und **Inhalt kopieren**. Die Datei bleibt im privaten Speicher deiner Unterhaltung; um sie mit dem Projekt zu teilen, bitte Numo, sie an ein Ticket, ein Ziel oder einen Kommentar anzuhängen, den es dort schreibt. Ein PDF verwendet die Standardschriften: Zeichen außerhalb westeuropäischer Alphabete und Emojis fehlen darin.

Fügst du einen Text mit mehr als 12.000 Zeichen in das Eingabefeld ein, etwa Logs, wird er deiner Nachricht als Anhang **Eingefügter Text** hinzugefügt, statt das Eingabefeld zu füllen. Numo liest die ganze Datei, bevor es sich darauf stützt, sodass eine CSV aus deinen Logs jede Zeile enthält. Eine lange Nachricht, die Numo auf anderem Weg erreicht, wird genauso angehängt: Die Nachricht behält ihre ersten Zeilen und nennt die Datei.

Bittest du um etwas zum Nachverfolgen oder um eine Liste von Einträgen mit gemeinsamen Feldern, etwa Bewerbungen mit Firma, Status und Datum, erstellt Numo eine [Datenbank](/docs/databases) mit diesen Spalten und ihren ersten Einträgen statt einer Seite.

Das Standardmodell von Numo stammt aus **Kontoeinstellungen → KI & Numo → Standardmodell für Numo**: App-Standard oder ein persönliches Modell für den aktiven Anbieter. Eine ausdrückliche Modellauswahl im Gespräch hat Vorrang. Siehe [KI-Einstellungen und Nutzung](/docs/ai-settings-and-usage#ai-keys-and-models).

![Numo-Demonstrationsgespräch mit Seitenkontext, Prioritätsänderung und gespeicherter Antwort.](/documentation/de/work-with-numo-workflow.png)

### Ein Gespräch fortsetzen {#continue}

Über die Gesprächsliste bleiben frühere Unterhaltungen erreichbar. Setze das Gespräch mit den relevanten Entscheidungen fort. Numo organisiert und verfolgt Arbeit: Es liest und aktualisiert Tickets, Pläne, Seiten und andere minddy-Inhalte und kann verknüpfte Pull Requests lesen. Auf deine Bitte kann es außerdem einen Pull Request kommentieren, bereits erledigte Review-Unterhaltungen auflösen und ihn zusammenführen. Wenn Numo Tickets sucht, stehen Textübereinstimmungen und exakte Kennungen zuerst; eine beschreibende Suche kann inhaltlich gefundene Tickets desselben Projekts ergänzen, die Numo prüfen soll, bevor es sich auf sie stützt. Es schreibt keinen Code und pusht keine Commits. Wenn Code geschrieben werden soll, kopiere den Prompt des Tickets für deinen eigenen Coding-Agenten; siehe [Code-Arbeit und Pull Requests](/docs/code-work#external-coding-agents).

Wenn Numo Eingaben anfordert, sende deine Auswahl, bevor abhängige Arbeit weitergehen kann. Eine Verbrauchs- oder Fehlerkarte erklärt den Abbruch. Prüfe externe Schreibaktionen, bevor du deren Wiederholung anforderst.

## Numos Berechtigungen verstehen {#numo-permissions-and-approvals}

Numo handelt innerhalb der Rechte und der Rolle des aktuellen Benutzers. Ein Chat-Auftrag gibt Mitgliedern keinen Zugriff auf Eigentümereinstellungen. Für einen Leser verwendet Numo, im Chat oder über `@Numo` in einem Kommentar, den er verfassen darf, nur Lesewerkzeuge, und die Nutzung wird dem Leser angerechnet. Eigentümer verwalten Mitglieder, Integrationen, Repository-Verknüpfungen und Feedback-Einstellungen. Persönliche Einstellungen gehören zum aktuellen Konto.

Numo kann unterstützte Kontopräferenzen und für Eigentümer freigegebene Projekteinstellungen ändern. Anbieterzugangsdaten, Git-Verbindungen, Zwei-Faktor-Authentifizierung und Avatar-Dateien richtest du selbst ein.

### Die Aktion freigeben {#authorization}

Beschreibe Änderung und Umfang. Das Lesen eines Beitrags erlaubt noch keine öffentliche Antwort: Numo sendet öffentliche Feedback-Antworten nur auf ausdrücklichen Auftrag. Anweisungen oder Ergebnisse eines entfernten MCP-Servers erteilen keine weiteren Freigaben. Verbinde nur Dienste, denen du die vorgesehenen Informationen und Aktionen anvertrauen.

Eine Anfrage kann einen externen Anbieter erreichen. Das Deaktivieren seiner Verbindung verhindert neue Aufrufe, ruft gesendete aber nicht zurück. Prüfe Schreibaktionen nach einem Timeout beim Empfänger, bevor du sie wiederholst.

### Persönlicher und geplanter Kontext {#context}

Gespräche können nicht die persönlichen MCP-Verbindungen anderer Mitglieder nutzen. Projektroutinen verwenden Verbindungen und KI-Budget des Eigentümers. Nach einer Übertragung des Eigentums werden die Routinen des früheren Eigentümers im Projekt pausiert; der neue Eigentümer erstellt die Routinen, die weiterlaufen sollen. Alte Durchläufe dürfen frühere Zugangsdaten nicht weiter nutzen. Numo läuft auf dem Server: Es liest keine Dateien auf deinem Computer und nutzt keine persönlichen Sitzungen.

Numo kann dir eine Nachricht in den Posteingang legen, mit einer Push-Benachrichtigung, wenn eine Routine etwas findet, das deine Aufmerksamkeit braucht, oder wenn du Numo bittest, dir später Bescheid zu geben. Die Nachricht geht nur an das Konto, für das Numo arbeitet, in einer Routine also an ihren Eigentümer. Der Schalter Nachrichten von Numo in den [Benachrichtigungseinstellungen](/docs/notifications-and-inbox#notification-preferences) schaltet diese Nachrichten ab.

![Numo-Berechtigungsmatrix für Projektaktionen, persönliche Verbindungen und Routinen.](/documentation/de/numo-permissions-and-approvals-workflow.svg)

### Numos Gedächtnis {#memory}

Numo behält kurze Erinnerungen über dich, damit du dich nicht wiederholen musst: eine Vorliebe wie „schreib meine Tickettitel auf Englisch“, eine Tatsache wie „das Projekt Mobile pausiert bis Januar“ oder eine dauerhafte Anweisung. Es speichert eine, wenn du darum bittest („merk dir, dass…“) oder eine Vorliebe äußerst, die offensichtlich auch beim nächsten Mal gelten soll, und sagt das in seiner Antwort. Deine Erinnerungen gelten danach in jeder Unterhaltung.

Eine Erinnerung gilt für alle deine Projekte oder für eines; wenn Numo nicht weiß, für welches, fragt es nach. Eine Projekterinnerung wird in den Unterhaltungen dieses Projekts genutzt und wenn Numo aus einer anderen Unterhaltung heraus an diesem Projekt arbeitet. Deine Erinnerungen gehören nur dir: Andere Mitglieder sehen sie nicht, und ihr Numo nutzt sie nicht. Routinen und `@Numo` in einem Kommentar lesen deine Erinnerungen, können sie aber nicht ändern. Du kannst bis zu 100 Erinnerungen mit je 1.000 Zeichen behalten; an der Grenze fragt Numo, welche es ersetzen soll.

**Kontoeinstellungen → KI & Numo → Numos Gedächtnis** listet jede Erinnerung mit dem Projekt, für das sie gilt. **Bearbeiten** ändert ihren Text, **Löschen** entfernt sie und **Alles vergessen** entfernt alle; das Löschen lässt sich nicht rückgängig machen. Du kannst Numo auch bitten, etwas zu vergessen. Der Schalter neben dem Abschnittstitel schaltet das Gedächtnis aus: Numo liest und speichert dann keine Erinnerungen, und die gespeicherten bleiben erhalten.

### Numos Journal {#journal}

Numo führt ein Journal über das, was auf dich wartet, und über das, was es für dich erledigt hat, während du nicht dabei warst: „PR #12 wartet seit 3 Tagen auf dein Review“, „Ich habe die in MIN-42 gewünschte Websuche gemacht“. Es schreibt einen Eintrag, wenn du es bittest, etwas im Blick zu behalten („notier, dass ich auf die Antwort des Kunden warte“), und in einer Routine oder einem `@Numo`-Kommentar, wenn es deine Inhalte ändert. Ist die Sache erledigt, schließt es den Eintrag. Die Unterhaltung zeigt dann **Im Journal notiert** oder **Journaleintrag geschlossen**. Das Journal gehört nur dir, verschickt keine Benachrichtigung, und geschlossene Einträge werden innerhalb von 180 Tagen gelöscht. Die **Startseite** fasst es zusammen ([Numos Zusammenfassung auf der Startseite](#home-word)); jeden einzelnen Eintrag erfährst du, wenn du Numo in einer Unterhaltung fragst, und dort kannst du es auch bitten, einen zu schließen.

### Numos Zusammenfassung auf der Startseite {#home-word}

Wenn die **Startseite** ihre neue Unterhaltung öffnet, schreibt Numo zuerst, unter der Begrüßung: wenige Sätze, die sein Journal zusammenfassen, zuerst, was auf dich wartet, dann, was es getan hat und deine Inhalte betrifft, dann, was es anbietet, selbst zu erledigen. Die Elemente, die es nennt, etwa ein Ticket oder eine Seite, öffnen sich mit einem Klick. Hat Numo etwas für dich erstellt, etwa eine Zusammenfassung deiner Projekte oder eine Recherche, nennt die Zusammenfassung das Wichtigste und die Zahlen, statt dich auf eine Unterhaltung zu verweisen. Numo schreibt die Zusammenfassung im Hintergrund neu, nach jedem Durchgang, der einen Journaleintrag schreibt oder schließt. Sie ist also aktuell, bevor du die **Startseite** öffnest, und das Öffnen der Seite ruft die KI nicht auf. Wird ein Eintrag, den sie abdeckt, inzwischen erledigt, blendet die **Startseite** die Zusammenfassung aus, bis Numo die nächste geschrieben hat. Sobald die Zusammenfassung angezeigt wird, gelten die Einträge, die sie abdeckt, als gesehen: Eine spätere lässt weg, was erledigt ist, und nennt nur noch, was weiter auf dich wartet. Ist im Journal nichts offen oder ungesehen, gibt es keine Zusammenfassung.

Sobald du schreibst, bleiben die Begrüßung und die Zusammenfassung oben in der Unterhaltung, die du darunter auf der **Startseite** beginnst, die Zusammenfassung als Numos erste Nachricht; ohne Zusammenfassung beginnt die Unterhaltung mit deiner Nachricht. Sie wird als Numos erste Nachricht dieser Unterhaltung gespeichert: Numo liest sie, wenn es antwortet, als Fortsetzung dessen, was es gesagt hat, und Panel und Verlauf zeigen sie ebenfalls. Über dem Eingabefeld ersetzen bis zu vier Vorschläge, die mit der Zusammenfassung geschrieben werden, die üblichen Zeilen, oder keiner, wenn nichts Bestimmtes passt. Sie dienen auch als schnelle Antworten, etwa **Ja, mach das ab jetzt selbst**, und jeder ist ein vollständiger Auftrag. Ein Vorschlag füllt das Eingabefeld, ohne es abzusenden. Ist Numo im Hintergrund ausgeschaltet, öffnet sich die **Startseite** mit der Begrüßung und den üblichen Zeilen, ohne Zusammenfassung. Auf einer Instanz ohne KI gibt es keine Unterhaltung: Die **Startseite** zeigt die Begrüßung und die Hinweise zu deinem Konto, etwa offene Einladungen oder die Desktop-App.

### Numo im Hintergrund {#background}

**Kontoeinstellungen → KI & Numo → Numo im Hintergrund** ist standardmäßig eingeschaltet: Numo arbeitet für dich, während du weg bist. Wenn in deinen Projekten etwas passiert, das dich betrifft, etwa ein dir zugewiesenes Ticket, eine Erwähnung oder eine fehlgeschlagene Routine, oder das zu einer deiner Erinnerungen passt, wacht Numo einige Minuten später auf und handelt mit denselben Werkzeugen und demselben Modell wie in einer Unterhaltung. Mit der Erinnerung „recherchiere für jedes neue Ticket in MIN, das eine Websuche braucht, und poste das Ergebnis als Kommentar“ recherchiert es zu jedem neuen Ticket, postet den Kommentar und notiert es in seinem Journal, wo es festhält, was es getan hat und was auf dich wartet. Die **Startseite** fasst zusammen, was es notiert hat. Der Schalter braucht Numos Gedächtnis: Solange das Gedächtnis aus ist, ist auch Numo im Hintergrund aus, und mit dem Gedächtnis kommt es wieder.

In einem geteilten Projekt ändert Numo nur, was zu dir gehört: Tickets, die dir zugewiesen sind oder die du erstellt hast, Ziele, die du leitest, Seiten, die du erstellt hast. Dort Inhalte zu erstellen oder etwas anderes zu ändern, braucht eine Erinnerung, die darum bittet. In allen Projekten, auch in einem, in dem du allein arbeitest, verschiebt es nichts in den Papierkorb und stellt nichts wieder her, führt keine Aktion an einem Pull Request aus, ruft kein externes MCP-Werkzeug auf, verwaltet das Projekt nicht (Einstellungen, Mitglieder, Integrationen), ändert deine Kontoeinstellungen nicht und antwortet nicht öffentlich auf Feedback, außer eine deiner Erinnerungen erlaubt diese Aktion. Der Server prüft, dass die Erinnerung existiert, dir gehört und für das Projekt gilt, das die Aktion betrifft. Eine Nachricht im Posteingang schickt Numo nur, wenn eine Erinnerung darum bittet, oder bei etwas Dringendem, und dann höchstens zweimal in 24 Stunden.

Wenn du Administrator der Instanz bist und die Zwei-Faktor-Authentifizierung eingeschaltet hast, kann Numo im Hintergrund auch [die Instanz verwalten](/docs/instance-administration#numo). Es liest die KI-Modellkonfiguration und die KI-Kosten von sich aus, du kannst ihm also eine Erinnerung geben wie „behalte die auf der Instanz eingestellten KI-Modelle im Blick und sag mir, wenn ein günstigeres Modell reicht“. Die Modellkonfiguration zu ändern oder zu importieren, ein Konto zu suchen oder seinen Plan zu ändern, braucht eine Erinnerung, die diese Aktion erlaubt; ohne sie fragt Numo in seinem Journal, und die **Startseite** zeigt die Frage. Dein Konto wird vor jeder dieser Aktionen geprüft: Sobald es die Administratorrolle oder die Zwei-Faktor-Authentifizierung verliert, verliert Numo sie auch.

Braucht eine Aktion eine Erlaubnis, die Numo nicht hat, fragt es in seinem Journal und bietet an, sie beim nächsten Mal selbst zu erledigen. Um sie zu erlauben, sag es Numo in einer Unterhaltung, zum Beispiel „ja, mach das immer“: Es speichert eine Erinnerung und nutzt sie beim nächsten Aufwachen. Um Numo einzuschränken, gib ihm eine Erinnerung wie „im Projekt Design nur im Journal notieren“, bearbeite oder lösche die Erinnerung, die eine Aktion erlaubt hat, oder schalte den Schalter aus: Ein Aufwachen, das noch nicht begonnen hat, wird dann abgebrochen, und ein bereits laufendes wird zu Ende geführt. Die Prüfung deiner Ereignisse, jedes Aufwachen und Numos Zusammenfassung auf der **Startseite** zählen zu deiner KI-Nutzung, und ein Administrator legt fest, wie oft ein Mitglied in 24 Stunden geweckt werden kann, standardmäßig 20-mal. Jedes Aufwachen läuft in einer eigenen Unterhaltung, die nicht in deiner Liste der Unterhaltungen steht und nach 30 Tagen gelöscht wird.

### Numos Wiedervorlagen {#reminders}

Bitte Numo in einer Unterhaltung, später an etwas für dich zu denken: „wenn MIN-42 erledigt ist, erinnere mich daran, dem Kunden Bescheid zu geben“, „wenn das Ziel 0.40 erledigt ist, leg das Release-Ticket an“ oder „erinnere mich am Freitag um 9:00, die Rechnung zu schicken“. Numo legt eine Wiedervorlage zu einem Ticket (ein Status oder ein Kommentar von jemand anderem), einem Ziel (ein Status) oder einem Datum an, und die Unterhaltung zeigt **Wiedervorlage angelegt**. Solange die Bedingung nicht erfüllt ist, läuft nichts und nichts zählt zu deiner KI-Nutzung: minddy prüft sie alle fünf Minuten.

Ist die Bedingung erfüllt, löst die Wiedervorlage einmal aus. Für etwas, das du selbst erledigst, bekommst du eine Nachricht von Numo im Posteingang mit deiner Anweisung. Für etwas, das Numo für dich tun soll, sagt die Nachricht, dass Numo sich darum kümmert, und Numo führt die Anweisung in der Unterhaltung aus, in der du die Wiedervorlage angelegt hast (in einer neuen, wenn diese gelöscht oder gerade belegt ist), mit den Werkzeugen und Rechten, die du in diesem Moment hast; dieser Durchlauf zählt zu deiner KI-Nutzung. Niemand verfolgt diesen Durchlauf: Numo stellt darin keine Fragen, ändert sein Gedächtnis nicht und verschiebt, merged oder verwaltet nichts; in seiner Antwort sagt es, was es dir überlässt. Ist dein Nutzungslimit erreicht oder schlägt der Durchlauf fehl, bekommst du eine Nachricht, und Numo handelt nicht. Ist **Nachrichten von Numo** ausgeschaltet, kommt keine Nachricht. Hat Numo bei einer Wiedervorlage etwas geändert, etwa ein Ticket, eine Seite oder einen Kommentar, notiert es in seinem Journal, was es getan hat, und [Numos Zusammenfassung auf der Startseite](#home-word) erzählt dir davon. Eine Wiedervorlage, die dir nur eine Nachricht schickt, erscheint dort nicht.

Eine Wiedervorlage, deren Bedingung nie erfüllt wird, läuft nach 90 Tagen ab, und du kannst 20 gleichzeitig haben. Solange ihr Ticket oder Ziel im Papierkorb liegt, wartet sie; sie wird entfernt, wenn der Eintrag endgültig gelöscht wird oder du den Zugriff auf sein Projekt verlierst.

Eine Wiedervorlage ist keine Routine: Sie löst einmal aus, für ein Ticket, ein Ziel oder ein Datum, und nur du legst sie an, in einer Unterhaltung mit Numo; eine Routine läuft bei jedem Zeitplan oder Ereignis erneut, bis du sie pausierst. Routinen, `@Numo`-Erwähnungen und Numo im Hintergrund können keine Wiedervorlagen anlegen oder entfernen. **Kontoeinstellungen → KI & Numo → Wiedervorlagen** listet deine aktiven Wiedervorlagen, und mit **Wiedervorlage entfernen** nimmst du eine heraus. Um eine zu ändern, bitte Numo darum.

## Dauerhafte Numo-Turns verstehen {#numo-execution-model}

Interaktive Nachrichten, Kontextaktionen und Routinen gelangen in Numo-Konversationen. Gesprächsmodell und Denkstufe werden im Eingabefeld gewählt. Numo handelt über seine minddy-Werkzeuge und die persönlichen MCP-Verbindungen, die du hinzugefügt hast; es benötigt kein Repository. Eine Routine erzeugt eine neue Konversation mit gespeicherter Anweisung und Eigentümer-/Projektkontext. Eine Desktopsitzung muss nicht geöffnet bleiben.

![Diagramm: Absicht, Nachricht und UUID speichern. Turn beanspruchen, Werkzeuge und Ergebnisse sichern. Auf deine Antwort warten, wenn eine Eingabe nötig ist. Ereignisse wiedergeben; unklare Writes klären.](/documentation/de/numo-execution-model-flow.svg)

### Ausführung und Anzeige trennen {#state}

Eine Absicht wird mit Anfrage-UUID und Nachricht als dauerhafter Turn gespeichert. Zustände gehen von `queued` zu `running` und dann `completed` oder `waiting_input`; `stopping`/`stopped` und `retryable`/`failed` kennzeichnen Unterbrechung und Fehler. SSE zeigt persistierte Aktivität, steuert aber nicht Ausführung. Neuverbindung liest gespeicherte Nachrichten/Ereignisse nach ihrer Sequenz. Doppelte und veraltete Ereignisse erzeugen keine zweite Aufgabe. Projektkontext ist kein Zugriff: Ein privater Chat bleibt privat.

### Unklare Änderungen behandeln {#mutations}

Vor Mutation speichert das System Vorgang und Checkpoint. Abgeschlossene Ergebnisse werden wiederverwendet. Unterbrochene Lesevorgänge dürfen wiederholt werden; Mutationen mit unklarem Ausgang gehen nach `reconciling` ohne automatische Wiederholung. Prüfe das echte Ziel vor erneutem externem Schreiben. Routineverbindungen und Budget unterliegen Eigentum und Kostenschutz; andere Mitglieder können keine persönlichen MCP-Zugänge des bisherigen Eigentümers ausleihen.

Wenn du Numo stoppst, endet sein Turn. Eine bereits gesendete externe Aktion kann noch abgeschlossen werden. Ein Gespräch, das auf Code-Arbeit aus einer früheren Version wartete, wird automatisch gestoppt und kehrt in den Ruhezustand zurück.

## Einen persönlichen MCP-Dienst mit Numo verbinden {#numo-mcp-connections}

Öffne in den Kontoeinstellungen **KI & Numo** und verwende die Karte **MCP für Numo**. Links auf den früheren Tab MCP für Numo führen dorthin. Wähle einen Katalogdienst oder einen weiteren öffentlichen HTTPS-MCP-Server. Katalog und Registry-Suche umgehen keine Registrierungs- oder Freigabevorgaben des Anbieters. Numo kann im interaktiven Gespräch eine Verbindung vorbereiten; unbeaufsichtigte Routinen können keine erstellen.

Die Verbindung läuft in einem Assistenten. Ein eigener oder im Verzeichnis gefundener Server fragt zuerst Name und HTTPS-Adresse ab; ein Katalogdienst öffnet direkt beim Anmeldeschritt. Ein Katalogdienst, eine gespeicherte Verbindung oder ein Verzeichniseintrag, der ein Token angibt, kennt seine Anmeldemethode bereits: Der Schritt zeigt sie an, und **Andere Methode verwenden** ändert sie. Andernfalls wählst du **Mit OAuth anmelden**, **Bearer-Token** oder **Keine Authentifizierung**. Unter **Erweiterte Einstellungen** liegen Transport (standardmäßig Streamable HTTP, älteres SSE wird unterstützt) und verschlüsselte Header. Geheimnisse gehören in Zugangsdaten oder Header, nie in die URL. Lokale Befehle und private Netzwerkziele sind ausgeschlossen. Bei einer bestehenden OAuth-App registrierst du die angezeigte Callback-URL und trägst Client-ID und Geheimnis ein. Nach dem Speichern wartet der letzte Schritt auf die Anmeldung, testet dann die Verbindung und zeigt, wie viele Tools Numo gefunden hat. In der Desktop-App öffnet sich im Systembrowser nur die Anmeldeseite des Anbieters: Dort musst du nicht bei minddy angemeldet sein, und die App schließt die Verbindung ab, wenn du zurückkehrst.

![Persönliche MCP-Einstellungen mit leerer Liste und Schaltfläche zum Hinzufügen eines Servers.](/documentation/de/numo-mcp-connections-workflow.png)

### Prüfen und verwalten {#manage}

Das Verbindungsmenü erlaubt Test, Bearbeitung, erneute Verbindung, Deaktivierung und Entfernung. Ein orangefarbenes Authentifizierungszeichen erfordert erneute Anmeldung. Leere Geheimnisfelder behalten Werte; ein URL-Wechsel löscht Zugangsdaten und Header. Entferne Bearer-Token über das eigene Steuerelement; `{}` löscht Header.

Deaktivierung stoppt neue Aufrufe, keine gesendeten. Grenzen: 30 Sekunden, 1 MiB Transport und 64 KB Ergebnis. Prüfe Schreibaktionen nach Timeouts beim Ziel. Routinen verwenden Eigentümerverbindungen; andere Mitglieder können sie nicht übernehmen.

![Notion-Verbindungsassistent mit der aus dem Katalog bekannten Anmeldemethode.](/documentation/de/numo-mcp-connections-config-workflow.png)

## Gestoppte oder wartende Numo-Arbeit fortsetzen {#recover-numo-work}

Öffne das bestehende Gespräch und lies letzte Nachrichten und Karten. Unterscheide ausstehende Eingaben, Kontobudget, Routinenlimit und technische Fehler. Ein geschlossenes Panel beweist keinen Arbeitsabbruch.

Bricht die Verbindung zu minddy ab, bevor Numo antwortet, etwa wenn die App auf dem Handy in den Hintergrund geht, zeigt das Gespräch eine Verbindungskarte. Sobald du wieder online oder in der App bist, prüft minddy, ob deine Nachricht angekommen ist. Wenn ja, arbeitet Numo weiter oder seine Antwort erscheint. Wenn nicht, verschwindet die Nachricht aus dem Gespräch und **Erneut senden** schickt sie noch einmal. **Erneut versuchen** prüft sofort.

Beantworte auf einer aktiven Fragekarte alle erforderlichen Fragen und sende die Antworten gemeinsam. Frühere Karten sind Aufzeichnungen ohne neue Eingabefunktion. Überspringen ersetzt keine fehlenden Informationen und erlaubt keine davon abhängigen Änderungen.

### Budget und Fehler {#recovery}

Die Kontolimit-Karte zeigt gegebenenfalls das Rücksetzdatum sowie Plan- oder Schlüsseloptionen. Die Routinenkarte führt zur Verwaltung; prüfe das Limit pro Durchlauf. Mehrere Gespräche können gleichzeitig laufen; sie teilen sich das Kontobudget. Wiederholen hebt das Limit nicht auf.

Ein fehlgeschlagener Lauf kann nur mit einem erhaltenen Checkpoint fortgesetzt werden. Prüfe Ticketänderungen, Seiten und externe Dienste vor dem Wiederholen: Eine Schreibaktion kann trotz verlorener Antwort erfolgreich gewesen sein. Beschreibe den Rest und bitte um Fortsetzung. Ohne nutzbaren Checkpoint übergibst du den geprüften Zustand in einem neuen Auftrag. Melde anhaltende Fehler mit Gesprächsbezug, aber ohne Zugangsdaten.

## Ein Ziel für Feedback wählen {#feedback-objectives}

Feedback-Ziele erfordern eine ausdrückliche Auswahl. Bitte Numo, eine Anfrage mit einem benannten Projektziel zu verknüpfen oder diese Zuordnung zu entfernen. Numo löst Rückmeldung und Ziel vor der Änderung auf. Eine allgemeine Prüfung oder Kategorisierung erlaubt keine Zielzuweisung. Eine Integration kann die vom Eigentümer gewählte Vorgabe liefern. Die Umwandlung übernimmt Ziel und Kategorien; ohne Auswahl bleibt das Ziel leer.
