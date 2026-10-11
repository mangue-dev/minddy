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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (de translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
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
      "alt": "Ereignisroutine mit verschachtelten UND/ODER-Bedingungen.",
      "caption": "Lokale Demonstration des tatsächlichen Auslösereditors. Keine Routine wurde gespeichert oder ausgeführt.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        788,
        1339
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

Nur der Projekteigentümer kann Routinen erstellen, bearbeiten oder aktivieren. Öffnen Sie Routinen, wählen Sie ein eigenes Projekt und formulieren Sie die Anweisung für Numo. Erwähnen Sie relevante Tickets, Seiten oder Ziele. Jede Ausführung besitzt eine private Numo-Konversation, einen Verlauf, Minddy-Werkzeuge und bei Bedarf delegierte Codearbeit. Code-Worker verwenden die Kontovorgaben des Eigentümers; ein Repository ist nur für Repository-Arbeit erforderlich.

Wählen Sie einen Auslöser:

- **Zeitplan:** täglich, wöchentlich oder monatlich mit Uhrzeit und Ihrer Zeitzone. Prüfen Sie die Vorschau des ersten Starts.
- **Ereignis:** Ticketerstellung, Eintritt in einen Zielstatus, Zuweisung, Kommentar zu einem verfolgten Ticket oder eingegangenes Feedback. Wählen Sie den erforderlichen Status, die Person oder das Ticket. Der Statusauslöser umfasst direkt in diesem Status erstellte Tickets. Eine Zuweisung erfordert einen tatsächlichen Wechsel der zuständigen Person.
- **Datenbankeintrag:** wählen Sie eine Seitendatenbank dieses Projekts. Erstellung, Duplizierung, Datenbankimport oder Verschieben in diese Datenbank gelten als Eingang. Die Wiederherstellung eines Eintrags erzeugt keinen neuen Eingang.

Stellen Sie bei Bedarf eine Verzögerung nach dem Ereignis zwischen 0 und 120 Minuten ein. Ihre Zeitzone bleibt Teil des Numo-Kontexts. Ereignis- und Datenbankroutinen warten auf künftige Eingänge und haben keinen nächsten geplanten Termin. Die automatische Verarbeitung benötigt den Scheduler der Instanz; ein manueller Start bleibt möglich.

## Bedingungen mit Wartezustand erstellen {#conditions}

Kombinieren Sie über **Bedingung hinzufügen** und **Gruppe hinzufügen** die Gruppen **Alle Bedingungen** (UND) und **Eine beliebige Bedingung** (ODER). Wählen Sie Ticketstatus, zuständige Person, Kategorie, Priorität oder Aufwand; bei einer Datenbank die typisierte Eigenschaft. Wählen Sie einen passenden Operator und Wert. Personen, Kategorien und Datenbanken müssen zum Projekt gehören. Bedingungen sind auf sechs verschachtelte Ebenen und 64 Knoten beschränkt; ausführbare Ausdrücke sind nicht erlaubt.

Beispiel: Eintritt in Triage UND Kategorie Backend UND (eine Person ist zugewiesen ODER Priorität ist Hoch). Ein Ticket ohne Kategorie wartet zunächst. Die spätere Ergänzung von Backend kann die Ausführung starten. Ein verbrauchter Wartezustand startet keine zweite Ausführung. Das Verlassen des Zielstatus beendet ihn; ein erneuter Eintritt erzeugt einen neuen. Eine Neuzuweisung ersetzt ebenfalls den vorherigen Wartezustand.

Ein Eintrag ohne erforderliche Eigenschaft wartet auf eine passende Bearbeitung. Wird eine referenzierte Eigenschaft entfernt oder ihr Typ geändert, erscheint ein Filterfehler: korrigieren Sie die Bedingungen vor dem Fortsetzen. Die Verzögerung gilt auch, wenn ein Filter später erfüllt wird. Feedbackeingänge umfassen private und noch nicht geprüfte Rückmeldungen; Numo veröffentlicht sie nicht und umgeht keine Moderation.

![Ereignisroutine mit verschachtelten UND/ODER-Bedingungen.](/documentation/de/scheduled-routines-workflow.png)

## Ausführungen verwalten und prüfen {#runs}

Öffnen Sie die Routine, um wartende Bedingungen zu prüfen, Anweisung oder Auslöser zu ändern, zu pausieren oder Ausführungen zu lesen. Pausieren, Löschen und Konfigurationsänderungen verwerfen wartende Einträge. Eine erneute Aktivierung wartet auf künftige Ereignisse ohne alte Eingänge zu wiederholen. Ein manueller Start funktioniert mit jedem Auslöser ohne dessen Ereignis und verbraucht ebenfalls Budget.

Jede Ausführung verwendet das KI-Budget des Eigentümers, standardmäßig mit einer Obergrenze von 15 % des Monatsbudgets einschließlich Numo und delegierter Worker. Öffnen Sie ihre Konversation für Quelle, Ergebnis, Prüfungen, Fragen und delegierte Arbeit. Antworten Sie bei erforderlicher Eingabe in derselben Konversation; das verbleibende Ausführungsbudget bleibt erhalten. Prüfen Sie gespeicherte Ergebnisse, bevor Sie ein Limit ändern oder erneut starten. Nach einem Eigentümerwechsel kann die Routine des vorherigen Eigentümers keine neue Arbeit starten; erstellen Sie eine Routine als aktueller Eigentümer.

Archivierte Projektautomatisierungen erscheinen als pausierte Vorschläge, wenn ihr Eigentümer Routinen öffnet. Lesen Sie vor der Aktivierung den [Übergangsleitfaden](/docs/automation-settings).

Das Limit gilt bei verfügbarem enthaltenem Monatsbudget; ein unbeschränkter Modus mit persönlichem Schlüssel erhält kein künstliches Monatsbudget.
