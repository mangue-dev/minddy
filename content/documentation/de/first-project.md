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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-689 project creation invitations",
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
      "lib/smart-fill.ts",
      "content/documentation/reviews/second-pass-workflows-2026-10-10.md",
      "content/documentation/reviews/min-689-project-invitations.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-689 project creation invitations: source and unit-test review of the wizard's optional members step, the invitees saved with the project draft and the invitations sent after Finish (components/create-project-wizard.tsx, lib/project-draft.ts and their tests); no browser walkthrough, no new captures; first-project-steps retained because it does not show the wizard)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (de translation of the MIN-689 passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
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
    "Dein erstes Problem abschließen"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-first-project.png",
      "alt": "Abgeschlossenes Demo-Ticket mit Beschreibung und gespeichertem Kommentar.",
      "caption": "Der abgeschlossene Status dokumentiert die Prüfung des Anwendungsablaufs. Er belegt keine Prüfung des E-Mail-Links der Beispielwebsite.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Vom Projekt zum abgeschlossenen Problem {#first-project}

Verwende ein Konto auf der vorgesehenen Instanz. In diesem Beispiel erstellst du ein Demonstrationsprojekt für eine Website und ein Problem zur Prüfung ihres Kontaktlinks. Der Ablauf funktioniert in Cloud und auf einer eingerichteten selbst gehosteten Instanz; KI ist dafür nicht erforderlich.

Hat dein Team bereits ein Projekt, gib dem Eigentümer deine Konto-E-Mail und nimm die Einladung im Posteingang an, statt ein zweites Projekt zu erstellen.

1. Öffne nach der Anmeldung die Startseite. Wähle für neue Arbeit die Aktion für ein neues Projekt in der Navigation. Wähle im Assistenten ein vollständig neues Projekt, gib einen Namen und einen Schlüssel aus zwei bis fünf Buchstaben ein.
2. Gehe zu den Schritten für Symbol und Repository weiter. Lass für dieses manuelle Beispiel das Standardsymbol stehen und wähle kein Repository. Die anfängliche Beschreibung kannst du leer lassen.
3. Danach bietet der Assistent an, dein Team einzuladen. Überspringe diesen Schritt für dieses manuelle Beispiel; wenn du mit anderen arbeitest, füge stattdessen ihre E-Mail-Adressen hinzu. Verschickt wird erst, wenn du die Erstellung abschließt.
4. Prüfe im letzten Schritt Smart Assign und die automatische Zuweisung. Lass die automatische Zuweisung ausgeschaltet, wenn du das Beispielticket selbst zuweisen möchtest. Wähle die Abschlussaktion, warte auf die Erstellung und öffne das neue Projekt.
5. Öffne das Projekt und erstelle ein Problem. Gib ihm einen konkreten Titel, etwa „Kontaktlink der Website prüfen“. Beschreibe die Seite, das erwartete Ziel und die Prüfung des Ergebnisses. Wenn die Schaltfläche Smart-Fill angezeigt wird und aktiviert ist, schalte sie für dieses manuelle Beispiel vor der Erstellung aus. Sie steuert das Ausfüllen dieses Tickets und ist von den Automatisierungs- und Smart-Assign-Schaltern des Projekts unabhängig.
6. Wähle eine zuständige Person, Priorität und Aufwand, wenn diese Angaben bei der Planung helfen. Bestätige die Erstellung, öffne das entstandene Problem und prüfe Projekt und Kennung.
7. Wähle den Status „In Bearbeitung“, wenn die Arbeit beginnt. Prüfe den Link und halte das Ergebnis in einem Kommentar fest. Verwende „In Überprüfung“, wenn jemand das Ergebnis noch prüfen muss.
8. Wähle „Fertig“, sobald das erwartete Ergebnis überprüft ist. Suche das Problem unter der abgeschlossenen Arbeit des Projekts oder anhand seiner Kennung, um die Änderung zu bestätigen.

![Abgeschlossenes Demo-Ticket mit Beschreibung und gespeichertem Kommentar.](/documentation/de/reader-first-project.png)

## Unerwartete Ergebnisse klären {#first-use-recovery}

Eine Einladung gilt für ein bestimmtes Konto und eine bestimmte Instanz. Fehlt sie, prüfe die E-Mail-Adresse, die du dem Eigentümer gegeben hast, und öffne den Posteingang auf derselben Instanz. Der Name eines Projekts allein berechtigt dich nicht zum Beitritt. Verschwindet ein Problem nach einem Statuswechsel aus dem aktuellen Board, entferne Ansichtsfilter oder suche nach seiner Kennung, bevor du eine weitere Kopie erstellst.

Konnten nicht alle im Assistenten hinzugefügten Einladungen verschickt werden, ist das Projekt trotzdem erstellt, und eine Benachrichtigung nennt jede nicht eingeladene Adresse mit dem Grund. Prüfe die ausstehenden Einladungen in den Mitgliedereinstellungen des Projekts, bevor du erneut einlädst.

Öffne auf dem Smartphone das Navigationsmenü, wähle das Projekt und verwende dessen Problem-Steuerelemente. Status- und Eigenschaftsauswahl ermöglichen denselben Ablauf ohne Desktop-Tastenkürzel. Speichere projektspezifische Entscheidungen auf einer Seite und verknüpfe sie mit dem Problem, wenn die Aufgabe dauerhaft verfügbaren Kontext braucht.
