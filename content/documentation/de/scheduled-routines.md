---
{
  "id": "scheduled-routines",
  "locale": "de",
  "title": "Routinen",
  "summary": "Starten Sie Numo per Zeitplan, Ticketereignis, eingegangenem Feedback oder neuem Datenbankeintrag.",
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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of code delegation in routines; MIN-685 sidebar context menus",
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
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-677-editor-captures.json",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "components/routines/routines-panel.tsx",
      "components/routines/use-routine-actions.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root (MIN-677 source review and single-group editor keyboard/mobile follow-up; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 7; de translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 8; de translation of added passages; no operational rerun)",
    "language": "agent:/root (de translation, label and retained-meaning self-review); agent:/root/min721_de (de translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (de translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-12",
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

Nur der Projekteigentümer kann Routinen erstellen, bearbeiten oder aktivieren. Öffnen Sie Routinen, wählen Sie ein eigenes Projekt und formulieren Sie die Anweisung für Numo. Erwähnen Sie relevante Tickets, Seiten oder Ziele. Jede Ausführung besitzt eine private Numo-Konversation, einen Verlauf und Minddy-Werkzeuge. Routinen organisieren und verfolgen Arbeit, etwa eine wöchentliche Triage, eine Prüfung liegengebliebener Tickets oder eine Wochenzusammenfassung; sie ändern keinen Repository-Code.

Wählen Sie **Geplant** oder **Ereignis**. Datenbankeingänge sind eine Option in der Ereignisliste.

- **Geplant:** täglich, wöchentlich oder monatlich mit Uhrzeit und Ihrer Zeitzone. Prüfen Sie die Vorschau des ersten Starts.
- **Ereignis:** Ticketerstellung, Eintritt in einen Zielstatus, Zuweisung, Kommentar zu einem verfolgten Ticket, eingegangenes Feedback oder ein neuer Datenbankeintrag. Wählen Sie den erforderlichen Status, die Person oder das Ticket. Der Statusauslöser umfasst direkt in diesem Status erstellte Tickets. Eine Zuweisung erfordert einen tatsächlichen Wechsel der zuständigen Person.

Wählen Sie für einen Datenbankeingang **Neuer Datenbankeintrag** in der Ereignisliste und dann eine Seitendatenbank dieses Projekts. Erstellung, Duplizierung, Datenbankimport oder Verschieben in diese Datenbank gelten als Eingang. Die Wiederherstellung eines Eintrags erzeugt keinen neuen Eingang.

**Bedingungen** sind optional: Ohne Filter kann jedes passende Ereignis die Routine starten. Stellen Sie die Verzögerung separat unter **Startzeitpunkt** ein. Die kleinen Informationsschaltflächen erklären das Warten und die Verzögerung. Auswahlfelder verwenden dieselben Status-, Prioritäts-, Kategorie- und Personenanzeigen wie Minddy. Verwenden Sie Pfeiltasten und Eingabe; längere Listen haben eine Suche.

Stellen Sie bei Bedarf eine Verzögerung nach dem Ereignis zwischen 0 und 120 Minuten ein. Ihre Zeitzone bleibt Teil des Numo-Kontexts. Ereignis- und Datenbankroutinen warten auf künftige Eingänge und haben keinen nächsten geplanten Termin. Die automatische Verarbeitung benötigt den Scheduler der Instanz; ein manueller Start bleibt möglich.

## Bedingungen mit Wartezustand erstellen {#conditions}

Erstellen Sie mit **Bedingung hinzufügen** eine einzelne Gruppe mit bis zu 16 Bedingungen. Wählen Sie **Alle Bedingungen** (UND) oder **Eine beliebige Bedingung** (ODER) für die gesamte Gruppe. Wählen Sie Ticketstatus, zuständige Person, Kategorie, Priorität oder Aufwand; bei einer Datenbank deren typisierte Eigenschaft. Wählen Sie einen passenden Operator und Wert. Personen, Kategorien und Datenbanken müssen zu diesem Projekt gehören. Verschachtelte Gruppen können nicht hinzugefügt werden. Gespeicherte verschachtelte Regeln behalten ihre Bedeutung. Wenn sie nicht als gleichwertige einzelne Gruppe angezeigt werden können, löscht **Bedingungen ersetzen** diese Regeln, damit Sie eine neue Gruppe erstellen können.

Beispiel: Eintritt in Triage, wobei alle Bedingungen die Kategorie Backend und die Priorität Hoch verlangen. Ein Ticket ohne Kategorie bleibt wartend. Die spätere Ergänzung von Backend kann die Ausführung starten. Ein verbrauchter Wartezustand startet keine zweite Ausführung. Das Verlassen des Zielstatus beendet ihn; ein erneuter Eintritt erzeugt einen neuen. Eine Neuzuweisung ersetzt ebenfalls den vorherigen Wartezustand.

Ein Eintrag ohne erforderliche Eigenschaft wartet auf eine passende Bearbeitung. Wird eine referenzierte Eigenschaft entfernt oder ihr Typ geändert, erscheint ein Filterfehler: korrigieren Sie die Bedingungen vor dem Fortsetzen. Die Verzögerung gilt auch, wenn ein Filter später erfüllt wird. Feedbackeingänge umfassen private und noch nicht geprüfte Rückmeldungen; Numo veröffentlicht sie nicht und umgeht keine Moderation.

![Modi „Geplant“ und „Ereignis“, eine Bedingungsgruppe, App-Symbole und dezente Informationsschaltflächen.](/documentation/de/scheduled-routines-workflow.png)

## Ausführungen verwalten und prüfen {#runs}

Öffnen Sie die Routine, um wartende Bedingungen zu prüfen, Anweisung oder Auslöser zu ändern, zu pausieren oder Ausführungen zu lesen. Pausieren, Löschen und Konfigurationsänderungen verwerfen wartende Einträge. Eine erneute Aktivierung wartet auf künftige Ereignisse ohne alte Eingänge zu wiederholen. Ein manueller Start funktioniert mit jedem Auslöser ohne dessen Ereignis und verbraucht ebenfalls Budget.

Klicken Sie mit der rechten Maustaste auf eine Routine in der Liste, um ihre letzte Ausführung zu öffnen, ohne sie zuerst auszuwählen; **Letzte Ausführung öffnen** bleibt nicht verfügbar, solange die Routine noch nie gelaufen ist. Der Projekteigentümer kann im selben Menü außerdem **Jetzt ausführen**, **Pausieren** oder **Fortsetzen**, **Bearbeiten** oder **In den Papierkorb verschieben** wählen. **Fortsetzen** ist nicht verfügbar, wenn die Instanz keine Routinen planen kann. Andere Mitglieder sehen nur Einträge, die die Routine nicht verändern. Um eine Routine zu erstellen, klicken Sie in der Seitenleiste mit der rechten Maustaste auf **Routinen** und wählen **Neue Routine**.

Jede Ausführung verwendet das KI-Budget des Eigentümers, standardmäßig mit einer Obergrenze von 15 % des Monatsbudgets einschließlich aller Numo-Aufrufe dieser Ausführung. Öffnen Sie ihre Konversation für Quelle, Ergebnis und Fragen. Antworten Sie bei erforderlicher Eingabe in derselben Konversation; das verbleibende Ausführungsbudget bleibt erhalten. Prüfen Sie gespeicherte Ergebnisse, bevor Sie ein Limit ändern oder erneut starten. Nach einem Eigentümerwechsel kann die Routine des vorherigen Eigentümers keine neue Arbeit starten; erstellen Sie eine Routine als aktueller Eigentümer.

Archivierte Projektautomatisierungen erscheinen als pausierte Vorschläge, wenn ihr Eigentümer Routinen öffnet. Lesen Sie vor der Aktivierung den [Übergangsleitfaden](/docs/automation-settings).

Das Limit gilt bei verfügbarem enthaltenem Monatsbudget; ein unbeschränkter Modus mit persönlichem Schlüssel erhält kein künstliches Monatsbudget.
