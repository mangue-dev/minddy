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
  "revision": 13,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
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
      "content/knowledge/core-tracker.md",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/use-onboarding.ts",
      "components/wizard/wizard-dialog.tsx",
      "components/import/import-guide.tsx",
      "lib/import-guides.ts",
      "lib/project-seed-handoff.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-907 first-run profile page and phone getting-started tour before Home: checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx and lib/first-run.ts; no browser walkthrough; existing figure kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 project wizard: the origin question, the brief step and the name suggestion are gone; the wizard opens on the name and key, with I want to join a project between Continue and Back; steps in order name, icon, repository, Invite your team, Bring your issues over, Finishing touches; Back is a full button from the second step; the import step offers a tool list, a folded How to export from section and Choose the CSV file, and the import dialog opens on the new project; checked against components/create-project-wizard.tsx, lib/project-draft.ts PROJECT_WIZARD_STEPS, components/wizard/wizard-dialog.tsx, components/import/import-guide.tsx, lib/project-seed-handoff.ts, app/(app)/projects/[id]/page.tsx and messages/*.json; no browser walkthrough; the existing figure shows an issue, not the wizard, and was kept); agent:claude-code (MIN-964 tour on every platform: the new-account paragraph no longer limits the getting-started steps to a phone, and components/sidebar-onboarding.tsx left the evidence; checked against components/first-run/first-run-gate.tsx and components/first-run/onboarding-screen.tsx; no browser walkthrough; no figure recaptured)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 new-account paragraph, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 tour follow-up skip sentence with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 wizard steps, join sentence and import paragraph rewritten, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
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
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

Hat dein Team bereits ein Projekt, gib dem Eigentümer deine Konto-E-Mail und nimm die Einladung im Posteingang an, statt ein zweites Projekt zu erstellen. Im ersten Schritt des Assistenten erklärt **Ich möchte einem Projekt beitreten**, wie der Beitritt funktioniert.

Ein neues Konto fragt zuerst auf **Wie sollen wir dich nennen?** nach deinem Namen und Bild. Danach folgen die ersten Schritte, eine Seite nach der anderen: Erstelle das Projekt im ersten Schritt oder wähle **Onboarding überspringen**, bestätige und folge diesem Beispiel ab der Startseite. Siehe [Ein Konto erstellen und anmelden](/de/dokumentation/accounts#account-access).

1. Öffne nach der Anmeldung die Startseite und wähle **Neues Projekt** in der Navigation. Der Assistent beginnt mit **Wie heißt dein Projekt?**: Gib einen Namen und einen Schlüssel aus zwei bis fünf Buchstaben ein und wähle **Weiter**.
2. Lass auf **Projektsymbol** das Standardsymbol stehen und wähle **Weiter**. Wähle auf **Ein Repository verknüpfen** für dieses manuelle Beispiel **Überspringen**. Ab dem zweiten Schritt führt **Zurück** unter **Weiter** zum vorherigen Schritt.
3. Wähle auf **Lade dein Team ein** für dieses manuelle Beispiel **Überspringen**; wenn du mit anderen arbeitest, suche stattdessen Personen aus deinen anderen Projekten nach Namen oder gib ihre E-Mail-Adressen ein. Verschickt wird erst, wenn du **Fertigstellen** wählst.
4. Wähle auf **Tickets übernehmen** die Option **Überspringen**: Dieses Beispiel beginnt ohne Tickets. Wie du stattdessen aus einem anderen Tool startest, beschreibt der Absatz nach diesen Schritten.
5. Prüfe auf **Der letzte Schliff** Smart Assign. Wähle **Fertigstellen**, warte auf die Erstellung und öffne das neue Projekt.
6. Öffne das Projekt und erstelle ein Ticket. Gib ihm einen konkreten Titel, etwa „Kontaktlink der Website prüfen“. Beschreibe die Seite, das erwartete Ziel und die Prüfung des Ergebnisses. Wenn die Schaltfläche Smart Fill angezeigt wird und aktiviert ist, schalte sie für dieses manuelle Beispiel vor der Erstellung aus. Sie steuert das Ausfüllen dieses Tickets und ist von Smart Assign und von Routinen unabhängig.
7. Wähle eine zuständige Person, Priorität und Aufwand, wenn diese Angaben bei der Planung helfen. Bestätige die Erstellung, öffne das entstandene Ticket und prüfe Projekt und Kennung.
8. Wähle den Status „In Bearbeitung“, wenn die Arbeit beginnt. Prüfe den Link und halte das Ergebnis in einem Kommentar fest. Verwende „In Prüfung“, wenn jemand das Ergebnis noch prüfen muss.
9. Wähle „Erledigt“, sobald das erwartete Ergebnis überprüft ist. Boards blenden die Spalte **Erledigt** standardmäßig aus: Wähle **Erledigt** im Filter **Status** des Boards oder suche die Kennung des Tickets, um die Änderung zu bestätigen.

Um Tickets aus einem anderen Tool zu übernehmen, wähle dieses Tool in der Liste auf **Tickets übernehmen**: Linear, Jira, Notion, GitHub, Trello oder minddy. **So exportierst du aus …** klappt die Exportschritte des gewählten Tools auf. Exportiere dort die CSV-Datei und wähle dann **CSV-Datei auswählen**. Die gewählte Datei erscheint mit einer Schaltfläche zum Entfernen. Importiert wird sie, sobald das Projekt existiert: Das Projekt öffnet sich mit einem Importdialog, der die Datei enthält. Dort ordnest du die Spalten zu und bestätigst den Import. Ein gespeicherter Entwurf des Assistenten behält die Datei nicht; setzt du die Erstellung später fort, wähle sie erneut aus.

![Ticket AUR-3 in Bearbeitung mit Beschreibung, zugewiesener Person, Aufwand und Kategorie.](/documentation/de/reader-first-project.png)

## Unerwartete Ergebnisse klären {#first-use-recovery}

Eine Einladung gilt für ein bestimmtes Konto und eine bestimmte Instanz. Fehlt sie, prüfe die E-Mail-Adresse, die du dem Eigentümer gegeben hast, und öffne den Posteingang auf derselben Instanz. Der Name eines Projekts allein berechtigt dich nicht zum Beitritt. Verschwindet ein Ticket nach einem Statuswechsel aus dem aktuellen Board, entferne Ansichtsfilter oder suche nach seiner Kennung, bevor du eine weitere Kopie erstellst. Erledigte und abgebrochene Tickets verlassen das Board standardmäßig; wähle **Erledigt** oder **Abgebrochen** im Filter **Status**, um sie anzuzeigen.

Konnten nicht alle im Assistenten hinzugefügten Einladungen verschickt werden, ist das Projekt trotzdem erstellt, und eine Benachrichtigung nennt jede nicht eingeladene Person mit dem Grund. Prüfe die ausstehenden Einladungen in den Mitgliedereinstellungen des Projekts, bevor du erneut einlädst.

Öffne auf dem Smartphone das Navigationsmenü, wähle das Projekt und verwende dessen Ticket-Steuerelemente. Status- und Eigenschaftsauswahl ermöglichen denselben Ablauf ohne Desktop-Tastenkürzel. Speichere projektspezifische Entscheidungen auf einer Seite und verknüpfe sie mit dem Ticket, wenn die Aufgabe dauerhaft verfügbaren Kontext braucht.
