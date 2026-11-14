---
{
  "id": "scheduled-routines",
  "locale": "de",
  "title": "Routinen",
  "summary": "Starte Numo per Zeitplan, Ticketereignis, eingegangenem Feedback oder neuem Datenbankeintrag.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "components/routines/routines-panel.tsx",
      "components/routines/routines-home.tsx",
      "components/routines/use-routine-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-924: routine runs never ask questions, and when they notify the owner, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-983: routines home with the Numo composer, examples and Start from scratch; source audit against the change and catalogs; no browser walkthrough of the procedures; existing figure shows the trigger editor, unchanged, not recaptured)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-924 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-983 passages, UI labels checked against messages/de.json; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Eine Numo-Routine planen und prüfen"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/scheduled-routines-workflow.png",
      "alt": "Modi „Geplant“ und „Ereignis“, eine Bedingungsgruppe, App-Symbole und dezente Informationsschaltflächen.",
      "caption": "Lokale Demonstration des tatsächlichen Auslösereditors. Keine Routine wurde gespeichert oder ausgeführt.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        788,
        910
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Eine Routine erstellen {#scheduled-routines}

Nur der Projekteigentümer kann Routinen erstellen, bearbeiten oder aktivieren. Öffne **Routinen**. Ist keine Routine ausgewählt, zeigt die Seite das Eingabefeld von Numo und Beispielroutinen; das **+** oben in der Liste oder neben einem Projekt führt ebenfalls dorthin. Beschreib die Routine im Eingabefeld, was Numo tun soll und wann, und sende sie ab: Die Konversation mit Numo füllt die Seite, Numo fragt nach dem, was fehlt, etwa dem Projekt, und richtet die Routine ein. Ein Beispiel unter **Empfohlen**, **Triage**, **Nachfassen**, **Berichte** oder **Planung** füllt das Eingabefeld mit seiner Anweisung, die du vor dem Senden anpassen kannst. Um sie selbst einzurichten, wähle **Ohne Vorlage starten**, wähle ein eigenes Projekt und formuliere die Anweisung für Numo. Erwähne relevante Tickets, Seiten oder Ziele. Ohne KI-Anbieter hat die Seite kein Eingabefeld, und ein Beispiel öffnet **Ohne Vorlage starten** mit seiner Anweisung. Jede Ausführung besitzt eine private Numo-Konversation, einen Verlauf und minddy-Werkzeuge. Routinen organisieren und verfolgen Arbeit, etwa eine wöchentliche Triage, eine Prüfung liegengebliebener Tickets oder eine Wochenzusammenfassung; sie ändern keinen Repository-Code.

Wähle in **Ohne Vorlage starten** **Geplant** oder **Ereignis**. Datenbankeingänge sind eine Option in der Ereignisliste.

- **Geplant:** täglich, wöchentlich oder monatlich mit Uhrzeit und deiner Zeitzone. Prüfe die Vorschau des ersten Starts.
- **Ereignis:** Ticketerstellung, Eintritt in einen Zielstatus, Zuweisung, Kommentar zu einem verfolgten Ticket, eingegangenes Feedback oder ein neuer Datenbankeintrag. Wähle den erforderlichen Status, die Person oder das Ticket. Der Statusauslöser umfasst direkt in diesem Status erstellte Tickets. Eine Zuweisung erfordert einen tatsächlichen Wechsel der zuständigen Person. Ein Kommentar eines Lesers startet keine Kommentarroutine.

Wähle für einen Datenbankeingang **Neuer Datenbankeintrag** in der Ereignisliste und dann eine Seitendatenbank dieses Projekts. Erstellung, Duplizierung, Datenbankimport oder Verschieben in diese Datenbank gelten als Eingang. Die Wiederherstellung eines Eintrags erzeugt keinen neuen Eingang.

**Bedingungen** sind optional: Ohne Filter kann jedes passende Ereignis die Routine starten. Stelle die Verzögerung separat unter **Startzeitpunkt** ein. Die kleinen Informationsschaltflächen erklären das Warten und die Verzögerung. Auswahlfelder verwenden dieselben Status-, Prioritäts-, Kategorie- und Personenanzeigen wie minddy. Verwende Pfeiltasten und Eingabe; längere Listen haben eine Suche.

Stelle bei Bedarf eine Verzögerung nach dem Ereignis zwischen 0 und 120 Minuten ein. Deine Zeitzone bleibt Teil des Numo-Kontexts. Ereignis- und Datenbankroutinen warten auf künftige Eingänge und haben keinen nächsten geplanten Termin. Die automatische Verarbeitung benötigt den Scheduler der Instanz; ein manueller Start bleibt möglich.

## Bedingungen mit Wartezustand erstellen {#conditions}

Erstelle mit **Bedingung hinzufügen** eine einzelne Gruppe mit bis zu 16 Bedingungen. Wähle **Alle Bedingungen** (UND) oder **Eine beliebige Bedingung** (ODER) für die gesamte Gruppe. Wähle Ticketstatus, zuständige Person, Kategorie, Priorität oder Aufwand; bei einer Datenbank deren typisierte Eigenschaft. Wähle einen passenden Operator und Wert. Personen, Kategorien und Datenbanken müssen zu diesem Projekt gehören. Verschachtelte Gruppen können nicht hinzugefügt werden. Gespeicherte verschachtelte Regeln behalten ihre Bedeutung. Wenn sie nicht als gleichwertige einzelne Gruppe angezeigt werden können, löscht **Bedingungen ersetzen** diese Regeln, damit du eine neue Gruppe erstellen kannst.

Beispiel: Eintritt in Triage, wobei alle Bedingungen die Kategorie Backend und die Priorität Hoch verlangen. Ein Ticket ohne Kategorie bleibt wartend. Die spätere Ergänzung von Backend kann die Ausführung starten. Ein verbrauchter Wartezustand startet keine zweite Ausführung. Das Verlassen des Zielstatus beendet ihn; ein erneuter Eintritt erzeugt einen neuen. Eine Neuzuweisung ersetzt ebenfalls den vorherigen Wartezustand.

Ein Eintrag ohne erforderliche Eigenschaft wartet auf eine passende Bearbeitung. Wird eine referenzierte Eigenschaft entfernt oder ihr Typ geändert, erscheint ein Filterfehler: korrigiere die Bedingungen vor dem Fortsetzen. Die Verzögerung gilt auch, wenn ein Filter später erfüllt wird. Feedbackeingänge umfassen private und noch nicht geprüfte Rückmeldungen; Numo veröffentlicht sie nicht und umgeht keine Moderation.

![Modi „Geplant“ und „Ereignis“, eine Bedingungsgruppe, App-Symbole und dezente Informationsschaltflächen.](/documentation/de/scheduled-routines-workflow.png)

## Ausführungen verwalten und prüfen {#runs}

Öffne die Routine, um wartende Bedingungen zu prüfen, Anweisung oder Auslöser zu ändern, zu pausieren oder Ausführungen zu lesen. Auf ihrer Seite schreibt der Eigentümer die Anweisung direkt (sie wird beim Tippen gespeichert und bleibt in deinen offenen Tabs und auf deinen Geräten gleich, auch wenn Numo sie umschreibt), klappt **Auslöser** zum Ändern auf, wählt die **Ausgabenobergrenze** und wechselt über das Statusabzeichen oben zwischen **Aktiv** und **Pausiert**. Pausieren, Löschen und Konfigurationsänderungen verwerfen wartende Einträge. Eine erneute Aktivierung wartet auf künftige Ereignisse ohne alte Eingänge zu wiederholen. Ein manueller Start funktioniert mit jedem Auslöser ohne dessen Ereignis und verbraucht ebenfalls Budget.

Klicke mit der rechten Maustaste auf eine Routine in der Liste, um ihre letzte Ausführung zu öffnen, ohne sie zuerst auszuwählen; **Letzte Ausführung öffnen** bleibt nicht verfügbar, solange die Routine noch nie gelaufen ist. Der Projekteigentümer kann im selben Menü außerdem **Jetzt ausführen**, **Pausieren** oder **Fortsetzen**, **Bearbeiten** oder **In den Papierkorb verschieben** wählen. **Fortsetzen** ist nicht verfügbar, wenn die Instanz keine Routinen planen kann. Andere Mitglieder sehen nur Einträge, die die Routine nicht verändern. Um eine Routine zu erstellen, klicke in der Seitenleiste mit der rechten Maustaste auf **Routinen** und wähle **Neue Routine**: Die Seite öffnet sich mit dem Eingabefeld.

Halte die Umschalttaste gedrückt und klicke auf Routinen in der Liste, um mehrere auszuwählen; ein Klick auf eine leere Stelle der Liste hebt die Auswahl auf. **Aktionen** in der schwebenden Leiste oder Command+K unter macOS bzw. Strg+K auf anderen Systemen führt die ausgewählten Routinen, deren Eigentümer du bist, jetzt aus, pausiert sie, setzt sie fort oder verschiebt sie nach einer Bestätigung in den Papierkorb; Routinen aus Projekten, die dir nicht gehören, bleiben unverändert, und jede Ausführung verbraucht Nutzung. **Numo fragen** öffnet Numo mit allen ausgewählten Routinen im Kontext.

Jede Ausführung verwendet das KI-Budget des Eigentümers, standardmäßig mit einer Obergrenze von 15 % des Monatsbudgets einschließlich aller Numo-Aufrufe dieser Ausführung. Öffne ihre Konversation für Quelle und Ergebnis. Eine Ausführung läuft ohne dich und stellt nie Fragen: Steht eine Entscheidung nicht Numo zu, etwa in den Papierkorb verschieben oder mergen, überlässt sie sie dir in einer Nachricht. Schreibe Anweisungen, die nicht auf deine Antwort warten. Prüfe gespeicherte Ergebnisse, bevor du ein Limit änderst oder erneut starten. Wird das Eigentum [übertragen](/docs/projects#transfer-ownership), werden die Routinen des früheren Eigentümers im Projekt pausiert und können keine neue Arbeit starten; der neue Eigentümer erstellt die Routinen, die weiterlaufen sollen.

Eine Ausführung, die normal endet, benachrichtigt dich nicht. Findet sie etwas, um das du dich kümmern musst, hinterlässt Numo dir eine [Nachricht](/docs/notifications-and-inbox#notifications-and-inbox), die das betreffende Element öffnet. Automatisch benachrichtigt wirst du, wenn eine Ausführung fehlschlägt, gestoppt wird oder ihr Budget aufbraucht, und wenn eine geplante oder durch ein Ereignis ausgelöste Ausführung nicht starten kann. Der Schalter **Routinen** in deinen [Benachrichtigungseinstellungen](/docs/notifications-and-inbox#notification-preferences) steuert diese Benachrichtigungen, **Nachrichten von Numo** die Nachrichten.

Projektautomatisierungen aus früheren Versionen laufen nicht mehr und werden nicht in Routinen umgewandelt. Im [Übergangsleitfaden](/docs/automation-settings) liest du, wie du einen Workflow als Routine neu erstellst.

Das Limit gilt bei verfügbarem enthaltenem Monatsbudget; ein unbeschränkter Modus mit persönlichem Schlüssel erhält kein künstliches Monatsbudget.
