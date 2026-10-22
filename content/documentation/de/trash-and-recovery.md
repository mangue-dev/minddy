---
{
  "id": "trash-and-recovery",
  "locale": "de",
  "title": "Papierkorb und Wiederherstellung",
  "summary": "Finde ein gelöschtes Objekt, stelle seine Voraussetzungen wieder her und unterscheide die endgültige Entfernung.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W19"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 8,
  "sourceRevision": 7,
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
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md",
      "lib/server/trash.ts",
      "components/app-sidebar.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "pages",
    "accounts",
    "projects"
  ],
  "aliases": [],
  "tags": [
    "Gelöschte Arbeit wiederherstellen"
  ],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-trash.png",
      "alt": "Wiederherstellbares Ticket AUR-20 im Papierkorb mit Projekt, löschender Person und verbleibender Aufbewahrungsdauer.",
      "caption": "Über die Zeilenaktionen stellst du das Ticket wieder her. Das Leeren des Papierkorbs ist ein eigener endgültiger Vorgang.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        994,
        526
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Einen Eintrag finden und wiederherstellen {#trash-and-recovery}

Öffne den Papierkorb über das Kontomenü. Er enthält wiederherstellbare gelöschte Arbeit, darunter unterstützte Tickets, Ziele, Feedback, Routinen, Projekte und Seiten. Prüfe Objekttyp, Löschzeitpunkt und angezeigte verbleibende Aufbewahrungsdauer, bevor du die Wiederherstellung wählst.

Stelle zuerst das erforderliche übergeordnete Objekt oder den Container wieder her, falls der Eintrag davon abhängt. Stelle beispielsweise eine gelöschte Datenbank vor einem separat gelöschten Eintrag wieder her. Öffne das wiederhergestellte Ziel und prüfe Inhalt und Eigenschaften. Gelöschte Einträge bleiben 30 Tage wiederherstellbar, bevor die Aufbewahrungsroutine sie endgültig entfernt. Nur der Projekteigentümer darf ein Projekt oder eine Routine wiederherstellen oder endgültig löschen. Der Eigentümer und Mitglieder können andere unterstützte Projektobjekte wiederherstellen oder entfernen, solange sie Zugriff haben. Ein Leser kann ein Projekt nicht ändern, daher erscheinen Einträge aus einem Projekt, das du nur liest, nicht in deinem Papierkorb.

![Wiederherstellbares Ticket AUR-20 im Papierkorb mit Projekt, löschender Person und verbleibender Aufbewahrungsdauer.](/documentation/de/reader-trash.png)

## Endgültiges Löschen und fehlgeschlagene Wiederherstellung {#permanent-removal}

Endgültiges Entfernen und Leeren des Papierkorbs lassen sich nicht rückgängig machen. Lies Bestätigung und Objektanzahl, bevor du fortfährst; diese Funktionen sind keine gewöhnlichen Möglichkeiten, erledigte Arbeit auszublenden. Nach Ablauf der Aufbewahrung ist ein Eintrag möglicherweise nicht mehr über die Oberfläche wiederherstellbar.

Schlägt die Wiederherstellung fehl, lies die Fehlermeldung und prüfe, ob das zugehörige Projekt oder übergeordnete Objekt existiert und du noch Zugriff hast. Lösche Objekte nicht wiederholt endgültig und lege sie nicht neu an, um einen Wiederherstellungskonflikt zu lösen. Exportiere wichtige Daten vor dem Löschen des Kontos; eine Kontolöschung hat andere Folgen als das Verschieben eines einzelnen Objekts in den wiederherstellbaren Papierkorb.
