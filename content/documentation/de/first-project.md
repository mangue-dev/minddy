---
{
  "id": "first-project",
  "locale": "de",
  "title": "Dein erstes Problem abschließen",
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
  "revision": 3,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "project-members",
    "create-an-issue",
    "issue-statuses"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-first-project.png",
      "alt": "Abgeschlossenes Demo-Ticket mit Beschreibung und gespeichertem Kommentar.",
      "caption": "Der abgeschlossene Status dokumentiert die Prüfung des Anwendungsablaufs. Er belegt keine Prüfung des E-Mail-Links der Beispielwebsite.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Vom Projekt zum abgeschlossenen Problem {#first-project}

Verwende ein Konto auf der vorgesehenen Instanz. In diesem Beispiel erstellst du ein Demonstrationsprojekt für eine Website und ein Problem zur Prüfung ihres Kontaktlinks. Der Ablauf funktioniert in Cloud und auf einer eingerichteten selbst gehosteten Instanz; KI ist dafür nicht erforderlich.

1. Öffne nach der Anmeldung die Startseite. Wähle für neue Arbeit die Aktion für ein neues Projekt in der Navigation. Wähle im Assistenten ein vollständig neues Projekt, gib einen Namen und einen Schlüssel aus zwei bis fünf Buchstaben ein und gehe zu den Schritten für Symbol und Repository weiter. Lass für dieses manuelle Beispiel das Standardsymbol stehen und wähle kein Repository. Die anfängliche Beschreibung kannst du leer lassen. Prüfe im letzten Schritt Smart Assign und die automatische Zuweisung. Lass die automatische Zuweisung ausgeschaltet, wenn du das Beispielticket selbst zuweisen möchtest. Wähle die Abschlussaktion, warte auf die Erstellung und öffne das neue Projekt. Hat dein Team bereits ein Projekt, gib dem Eigentümer deine Konto-E-Mail und nimm die Einladung im Posteingang an, statt ein zweites Projekt zu erstellen.
2. Öffne das Projekt und erstelle ein Problem. Gib ihm einen konkreten Titel, etwa „Kontaktlink der Website prüfen“. Beschreibe die Seite, das erwartete Ziel und die Prüfung des Ergebnisses. Wenn die Schaltfläche Smart-Fill angezeigt wird und aktiviert ist, schalte sie für dieses manuelle Beispiel vor der Erstellung aus. Sie steuert das Ausfüllen dieses Tickets und ist von den Automatisierungs- und Smart-Assign-Schaltern des Projekts unabhängig.
3. Wähle eine zuständige Person, Priorität und Aufwand, wenn diese Angaben bei der Planung helfen. Bestätige die Erstellung, öffne das entstandene Problem und prüfe Projekt und Kennung.
4. Wähle den Status „In Bearbeitung“, wenn die Arbeit beginnt. Prüfe den Link und halte das Ergebnis in einem Kommentar fest. Verwende „In Überprüfung“, wenn jemand das Ergebnis noch prüfen muss.
5. Wähle „Fertig“, sobald das erwartete Ergebnis überprüft ist. Suche das Problem unter der abgeschlossenen Arbeit des Projekts oder anhand seiner Kennung, um die Änderung zu bestätigen.

![Abgeschlossenes Demo-Ticket mit Beschreibung und gespeichertem Kommentar.](/documentation/de/reader-first-project.png)

## Unerwartete Ergebnisse klären {#first-use-recovery}

Eine Einladung gilt für ein bestimmtes Konto und eine bestimmte Instanz. Fehlt sie, prüfe die E-Mail-Adresse, die du dem Eigentümer gegeben hast, und öffne den Posteingang auf derselben Instanz. Der Name eines Projekts allein berechtigt dich nicht zum Beitritt. Verschwindet ein Problem nach einem Statuswechsel aus dem aktuellen Board, entferne Ansichtsfilter oder suche nach seiner Kennung, bevor du eine weitere Kopie erstellst.

Öffne auf dem Smartphone das Navigationsmenü, wähle das Projekt und verwende dessen Problem-Steuerelemente. Status- und Eigenschaftsauswahl ermöglichen denselben Ablauf ohne Desktop-Tastenkürzel. Speichere projektspezifische Entscheidungen auf einer Seite und verknüpfe sie mit dem Problem, wenn die Aufgabe dauerhaft verfügbaren Kontext braucht.
