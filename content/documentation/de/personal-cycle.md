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
      "content/knowledge/productivity.md",
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/cycle/cycle-empty-states.tsx",
      "components/global-board.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1314,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Deinen Zyklus einrichten und füllen {#personal-cycle}

Aktiviere Zyklen unter **Kontoeinstellungen** → **Zyklen** oder öffne Zyklus über die Befehlspalette und wähle dort **Zyklen aktivieren**. Sind sie aktiv, erscheint in der Ansichtsleiste von **Alle Tickets** ein Tab **Zyklus**, und der mit einem Pfeil markierte Tab **Zyklus** eines Projektboards führt zum selben persönlichen Zyklus; solange Zyklen deaktiviert sind, zeigen Boards keinen Tab **Zyklus**. Er gehört zu deinem Konto und kann Tickets enthalten, die dir in Projekten zugewiesen sind, in denen du Eigentümer oder Mitglied bist. Leser können keine Zuweisungen erhalten, daher trägt ein Projekt, das du nur liest, keine Arbeit bei. Er ist kein Projektsprint und gehört nicht zu einem Teamziel.

Wähle eine Dauer von einer oder zwei Wochen, den Startwochentag, ein bis vier kommende Zyklen und eine leichte, mittlere oder hohe Intensität. Diese Einstellungen bestimmen deinen persönlichen Zeitraum und die Zielkapazität. Die Schalter für automatische Übernahme steuern, ob dir zugewiesene Tickets beim Start oder Abschluss in den aktuellen Zyklus aufgenommen werden.

Der aktuelle Zyklus wird einmal automatisch aus geeigneter Arbeit gefüllt. Um ein Ticket manuell hinzuzufügen, verwende seine Zyklusaktion im Menü und wähle den aktuellen oder nächsten Zeitraum, sofern verfügbar. Das Hinzufügen weist das Ticket dem Zyklusinhaber zu, ohne seinen Status zu ändern. Tickets mit dem Status Triage, Erledigt, Abgebrochen oder Duplikat lassen sich mit dieser Aktion nicht hinzufügen. Prüfe danach die zuständige Person und Blocker. Das Entfernen aus dem Zyklus lässt das Ticket im Projekt bestehen.

![Demo-Ticket im Backlog des persönlichen Zyklus.](/documentation/de/reader-cycle.png)

## Den Zeitraum abschließen oder anpassen {#cycle-results}

Aktualisiere die Statuswerte während der Arbeit und prüfe abgeschlossene und verbleibende Arbeit. An der Zeitgrenze werden geeignete, nicht abgeschlossene Tickets aus vergangenen Zyklen automatisch in den aktuellen übernommen. Die Zuweisung bleibt erhalten; die Übernahme schließt die Tickets nicht ab. Sind alle Tickets des aktuellen Zyklus geschlossen, bietet ein Banner **Zyklus abgeschlossen** die Aktion **Zyklus auffüllen** an, um geeignete Arbeit hinzuzufügen; während des Zeitraums wird der Zyklus nicht automatisch nachgefüllt. Mit der Datumsauswahl kannst du vergangene und kommende Zyklen ansehen. Diese Ansichten sind schreibgeschützt; Änderungen sind im aktuellen Zyklus möglich.

Wird eine Voraussetzung in den aktuellen Zyklus aufgenommen, um Abhängigkeiten konsistent zu halten, prüfe den Grund, bevor du sie entfernst. Ein nach Abschluss verschwundenes Ticket kann weiterhin unter der abgeschlossenen Zyklusarbeit oder über seine Kennung auffindbar sein. Kontoeinstellungen für Zyklen ändern deine Planungsansicht, nicht den persönlichen Zyklus eines anderen Mitglieds.
