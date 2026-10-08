---
{
  "id": "personal-cycle",
  "locale": "de",
  "title": "Persönliche Zyklen",
  "summary": "Wähle projektübergreifende Arbeit für einen ein- oder zweiwöchigen Planungszeitraum.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W12"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
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
      "content/knowledge/productivity.md",
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "views",
    "issues"
  ],
  "aliases": [],
  "tags": [
    "Einen persönlichen Zyklus planen"
  ],
  "figures": [
    {
      "id": "personal-cycle-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-cycle.png",
      "alt": "Demo-Ticket im Backlog des persönlichen Zyklus.",
      "caption": "Das Hinzufügen hat das Ticket dem Zyklusinhaber zugewiesen und seinen Backlog-Status beibehalten.",
      "revision": 4,
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
    "personal-cycle-steps"
  ]
}
---

## Deinen Zyklus einrichten und füllen {#personal-cycle}

Aktiviere Zyklen unter Kontoeinstellungen → Zyklen und öffne anschließend Zyklus in der persönlichen Navigation. Er gehört zu deinem Konto und kann Probleme aus mehreren Projekten enthalten, auf die du Zugriff hast. Er ist kein Projektsprint und gehört nicht zu einem Teamziel.

Wähle eine Dauer von einer oder zwei Wochen, den Startwochentag, ein bis vier kommende Zyklen und eine leichte, mittlere oder hohe Intensität. Diese Einstellungen bestimmen deinen persönlichen Zeitraum und die Zielkapazität. Die Schalter für automatische Übernahme steuern, ob dir zugewiesene Probleme beim Start oder Abschluss in den aktuellen Zyklus aufgenommen werden.

Der aktuelle Zyklus wird einmal automatisch aus geeigneter Arbeit gefüllt. Um ein Problem manuell hinzuzufügen, verwende seine Zyklusaktion im Menü und wähle den aktuellen oder nächsten Zeitraum, sofern verfügbar. Das Hinzufügen weist das Problem dem Zyklusinhaber zu, ohne seinen Status zu ändern. Probleme mit dem Status Triage, Fertig, Abgebrochen oder Duplikat lassen sich mit dieser Aktion nicht hinzufügen. Prüfe danach die zuständige Person und Blocker. Das Entfernen aus dem Zyklus lässt das Problem im Projekt bestehen.

![Demo-Ticket im Backlog des persönlichen Zyklus.](/documentation/de/reader-cycle.png)

## Den Zeitraum abschließen oder anpassen {#cycle-results}

Aktualisiere die Statuswerte während der Arbeit und prüfe abgeschlossene und verbleibende Aufgaben. An der Zeitgrenze werden geeignete, nicht abgeschlossene Probleme aus vergangenen Zyklen automatisch in den aktuellen übernommen. Die Zuweisung bleibt erhalten; die Übernahme schließt die Probleme nicht ab. Mit der Datumsauswahl kannst du vergangene und kommende Zyklen ansehen. Diese Ansichten sind schreibgeschützt; Änderungen sind im aktuellen Zyklus möglich.

Wird eine Voraussetzung in den aktuellen Zyklus aufgenommen, um Abhängigkeiten konsistent zu halten, prüfe den Grund, bevor du sie entfernst. Ein nach Abschluss verschwundenes Problem kann weiterhin unter der abgeschlossenen Zyklusarbeit oder über seine Kennung auffindbar sein. Kontoeinstellungen für Zyklen ändern deine Planungsansicht, nicht den persönlichen Zyklus eines anderen Mitglieds.
