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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "alt": "Wiederherstellbares Demo-Ticket mit dreißig verbleibenden Tagen im Papierkorb.",
      "caption": "Über die Zeilenaktionen stellst du das Ticket wieder her. Das Leeren des Papierkorbs ist ein eigener endgültiger Vorgang.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Einen Eintrag finden und wiederherstellen {#trash-and-recovery}

Öffne den Papierkorb über das Kontomenü. Er enthält wiederherstellbare gelöschte Arbeit, darunter unterstützte Probleme, Ziele, Feedback, Routinen, Projekte und Seiten. Prüfe Objekttyp, Löschzeitpunkt und angezeigte verbleibende Aufbewahrungsdauer, bevor du die Wiederherstellung wählst.

Stelle zuerst das erforderliche übergeordnete Objekt oder den Container wieder her, falls der Eintrag davon abhängt. Stelle beispielsweise eine gelöschte Datenbank vor einem separat gelöschten Eintrag wieder her. Öffne das wiederhergestellte Ziel und prüfe Inhalt und Eigenschaften. Gelöschte Einträge bleiben 30 Tage wiederherstellbar, bevor die Aufbewahrungsroutine sie endgültig entfernt. Nur der Projekteigentümer darf ein Projekt oder eine Routine wiederherstellen oder endgültig löschen. Projektmitglieder können andere unterstützte Projektobjekte wiederherstellen oder entfernen, solange sie Zugriff haben.

![Wiederherstellbares Demo-Ticket mit dreißig verbleibenden Tagen im Papierkorb.](/documentation/de/reader-trash.png)

## Endgültiges Löschen und fehlgeschlagene Wiederherstellung {#permanent-removal}

Endgültiges Entfernen und Leeren des Papierkorbs lassen sich nicht rückgängig machen. Lies Bestätigung und Objektanzahl, bevor du fortfährst; diese Funktionen sind keine gewöhnlichen Möglichkeiten, erledigte Arbeit auszublenden. Nach Ablauf der Aufbewahrung ist ein Eintrag möglicherweise nicht mehr über die Oberfläche wiederherstellbar.

Schlägt die Wiederherstellung fehl, lies die Fehlermeldung und prüfe, ob das zugehörige Projekt oder übergeordnete Objekt existiert und du noch Zugriff hast. Lösche Objekte nicht wiederholt endgültig und lege sie nicht neu an, um einen Wiederherstellungskonflikt zu lösen. Exportiere wichtige Daten vor dem Löschen des Kontos; eine Kontolöschung hat andere Folgen als das Verschieben eines einzelnen Objekts in den wiederherstellbaren Papierkorb.
