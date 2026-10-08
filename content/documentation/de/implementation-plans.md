---
{
  "id": "implementation-plans",
  "locale": "de",
  "title": "Einen Umsetzungsplan pflegen",
  "summary": "Verfolge geordnete Schritte getrennt von der Problembeschreibung, ohne abgeschlossene Arbeit zu verlieren.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-discussion-and-resources",
    "delegate-code-work",
    "review-pull-requests"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-implementation-plan.png",
      "alt": "Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.",
      "caption": "Der gespeicherte Demo-Plan unterscheidet abgeschlossene, laufende und ausstehende Schritte. Der Fortschritt belegt nicht, dass die fiktive Codeaufgabe ausgeführt wurde.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1400
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "implementation-plans-steps"
  ]
}
---

## Den Plan schreiben {#implementation-plans}

Öffne den Plan-Tab des Problems. Seine Beschreibung sollte bereits das Problem und das erwartete Ergebnis benennen. Ergänze die Umsetzungsschritte selbst oder bitte Numo, das verknüpfte Repository zu lesen, bevor es einen Plan auf Code-Ebene vorschlägt. Ein von KI genannter Pfad oder eine Funktion sind ohne tatsächliches Lesen des Repositorys kein Beleg.

Rücke eine Aufgabenzeile je Verschachtelungsebene um zwei Leerzeichen ein; ein Tab zählt als vier Leerzeichen. Die Verschachtelung ordnet Schritte im Plan und erstellt keine Eltern-Kind-Beziehungen zwischen Problemen. Jede nicht abgebrochene Arbeitsaufgabe zählt weiterhin zum Fortschritt, auch verschachtelte Aufgaben.

Der Plan verwendet Markdown-Aufgabenzeilen: `- [ ]` für ausstehend, `- [~]` für in Bearbeitung, `- [x]` für abgeschlossen und `- [-]` für abgebrochen. Schreibe den Aufgabentext hinter die Markierung, etwa `- [ ] Den Kontaktlink auf Mobilgeräten prüfen`. Abgebrochene Aufgaben zählen nicht zur Abschlussquote. Aufgaben unter einer erkannten Questions-Überschrift werden als Fragen behandelt und ebenfalls nicht im Fortschritt berücksichtigt. Halte Arbeitsschritte deshalb in einem eigenen Abschnitt auf derselben Überschriftenebene. Die erkannte Überschrift heißt `Questions`; die Erkennung verwendet dieses englische Wort. Speichere ausdrückliche Änderungen mit der Speichern-Schaltfläche. Abbrechen verwirft den Entwurf. Das Ankreuzen einer dargestellten Aufgabe aktualisiert ihren Zustand. Nutze ausstehend, in Bearbeitung, abgeschlossen und abgebrochen, um den tatsächlichen Verlauf zu beschreiben, ohne ungeprüfte Verifikation anzudeuten.

![Demo-Plan mit zwei von sechs abgeschlossenen Arbeitsschritten.](/documentation/de/work-implementation-plan.png)

## Fortschritt und gleichzeitige Änderungen erhalten {#plan-progress}

Erweitere oder ändere den bestehenden Plan gezielt, statt ihn durch eine neue unabgehakte Kopie zu ersetzen. Bewahre abgeschlossene Schritte und Erklärungen für geänderten Umfang. Vergleiche einen größeren Umbau vor dem Speichern mit dem neuesten Plan, wenn ein anderes Mitglied oder ein Agent am Problem gearbeitet hat.

Ein geschriebener Plan lässt sich Numo zur Umsetzung übergeben, wenn Repository-Arbeit und die eingerichtete Sandbox verfügbar sind. Sobald abgeschlossene Arbeit vorliegt, bietet die Oberfläche außerdem eine Umsetzungsprüfung. Diese Aktionen starten Arbeit; ein abgehaktes Kontrollkästchen beweist nicht, dass der Code Tests besteht. Lies Ergebnis, Änderungen und Prüfungen, bevor du das Problem als fertig markierst.
