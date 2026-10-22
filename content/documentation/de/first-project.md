---
{
  "id": "first-project",
  "locale": "de",
  "title": "Erste Schritte",
  "summary": "Erstelle ein Projekt oder tritt einem bei, erfasse eine Aufgabe und schließe sie nach Prüfung des Ergebnisses ab.",
  "topic": "Erste Schritte",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "content/knowledge/core-tracker.md",
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "accounts",
    "projects",
    "issues"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [
    "Dein erstes Ticket abschließen"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-first-project.png",
      "alt": "Ticket AUR-3 in Bearbeitung mit Beschreibung, zugewiesener Person, Aufwand und Kategorie.",
      "caption": "Das Ticket zeigt Kennung, Status und Eigenschaften. Setze es erst auf erledigt, wenn das erwartete Ergebnis geprüft ist.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Vom Projekt zum abgeschlossenen Ticket {#first-project}

Verwende ein Konto auf der vorgesehenen Instanz. In diesem Beispiel erstellst du ein Demonstrationsprojekt für eine Website und ein Ticket zur Prüfung ihres Kontaktlinks. Der Ablauf funktioniert in Cloud und auf einer eingerichteten selbst gehosteten Instanz; KI ist dafür nicht erforderlich.

Hat dein Team bereits ein Projekt, gib dem Eigentümer deine Konto-E-Mail und nimm die Einladung im Posteingang an, statt ein zweites Projekt zu erstellen.

1. Öffne nach der Anmeldung die Startseite. Wähle für neue Arbeit die Aktion für ein neues Projekt in der Navigation. Wähle im Assistenten ein vollständig neues Projekt, gib einen Namen und einen Schlüssel aus zwei bis fünf Buchstaben ein.
2. Gehe zu den Schritten für Symbol und Repository weiter. Lass für dieses manuelle Beispiel das Standardsymbol stehen und wähle kein Repository. Die anfängliche Beschreibung kannst du leer lassen.
3. Danach bietet der Assistent an, dein Team einzuladen. Überspringe diesen Schritt für dieses manuelle Beispiel; wenn du mit anderen arbeitest, suche stattdessen Personen aus deinen anderen Projekten nach Namen oder gib ihre E-Mail-Adressen ein. Verschickt wird erst, wenn du die Erstellung abschließt.
4. Prüfe im letzten Schritt Smart Assign und die automatische Zuweisung. Lass die automatische Zuweisung ausgeschaltet, wenn du das Beispielticket selbst zuweisen möchtest. Wähle die Abschlussaktion, warte auf die Erstellung und öffne das neue Projekt.
5. Öffne das Projekt und erstelle ein Ticket. Gib ihm einen konkreten Titel, etwa „Kontaktlink der Website prüfen“. Beschreibe die Seite, das erwartete Ziel und die Prüfung des Ergebnisses. Wenn die Schaltfläche Smart Fill angezeigt wird und aktiviert ist, schalte sie für dieses manuelle Beispiel vor der Erstellung aus. Sie steuert das Ausfüllen dieses Tickets und ist von Smart Assign und von Routinen unabhängig.
6. Wähle eine zuständige Person, Priorität und Aufwand, wenn diese Angaben bei der Planung helfen. Bestätige die Erstellung, öffne das entstandene Ticket und prüfe Projekt und Kennung.
7. Wähle den Status „In Bearbeitung“, wenn die Arbeit beginnt. Prüfe den Link und halte das Ergebnis in einem Kommentar fest. Verwende „In Prüfung“, wenn jemand das Ergebnis noch prüfen muss.
8. Wähle „Erledigt“, sobald das erwartete Ergebnis überprüft ist. Boards blenden die Spalte **Erledigt** standardmäßig aus: Wähle **Erledigt** im Filter **Status** des Boards oder suche die Kennung des Tickets, um die Änderung zu bestätigen.

![Ticket AUR-3 in Bearbeitung mit Beschreibung, zugewiesener Person, Aufwand und Kategorie.](/documentation/de/reader-first-project.png)

## Unerwartete Ergebnisse klären {#first-use-recovery}

Eine Einladung gilt für ein bestimmtes Konto und eine bestimmte Instanz. Fehlt sie, prüfe die E-Mail-Adresse, die du dem Eigentümer gegeben hast, und öffne den Posteingang auf derselben Instanz. Der Name eines Projekts allein berechtigt dich nicht zum Beitritt. Verschwindet ein Ticket nach einem Statuswechsel aus dem aktuellen Board, entferne Ansichtsfilter oder suche nach seiner Kennung, bevor du eine weitere Kopie erstellst. Erledigte und abgebrochene Tickets verlassen das Board standardmäßig; wähle **Erledigt** oder **Abgebrochen** im Filter **Status**, um sie anzuzeigen.

Konnten nicht alle im Assistenten hinzugefügten Einladungen verschickt werden, ist das Projekt trotzdem erstellt, und eine Benachrichtigung nennt jede nicht eingeladene Person mit dem Grund. Prüfe die ausstehenden Einladungen in den Mitgliedereinstellungen des Projekts, bevor du erneut einlädst.

Öffne auf dem Smartphone das Navigationsmenü, wähle das Projekt und verwende dessen Ticket-Steuerelemente. Status- und Eigenschaftsauswahl ermöglichen denselben Ablauf ohne Desktop-Tastenkürzel. Speichere projektspezifische Entscheidungen auf einer Seite und verknüpfe sie mit dem Ticket, wenn die Aufgabe dauerhaft verfügbaren Kontext braucht.
