---
{
  "id": "triage-incoming-work",
  "locale": "de",
  "title": "Eingehende Arbeit in der Triage prüfen",
  "summary": "Kläre neue Anfragen, bevor du sie in die geplante Arbeit aufnimmst.",
  "topic": "Projekte und Probleme",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "W03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "create-an-issue",
    "feedback-to-issue"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/de/triage-incoming.png",
      "alt": "Eingegangenes Demoproblem DOC-11 mit Bericht, Eigenschaften und Funktionen für Duplikat, Ablehnen und Akzeptieren.",
      "caption": "Lies den eingegangenen Bericht, bevor du ihn akzeptierst, ablehnst oder mit einem Duplikat verknüpfst.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "triage-incoming-work-steps"
  ]
}
---

## Den Eingang prüfen {#triage-incoming-work}

Öffne den Triage-Bereich des Projekts. Lies das eingegangene Problem und seinen Ursprungskontext, bevor du es in die geplante Arbeit aufnimmst. Prüfe, ob ein bestehendes Problem die Anfrage bereits abbildet. Kläre bei Bedarf erwartetes Ergebnis, Projekt, zuständige Person, Priorität und Aufwand.

Wähle Akzeptieren und bestätige, um ein beibehaltenes Problem in den Rückstand zu verschieben. Wähle Ablehnen und bestätige, um es auf Abgebrochen zu setzen. Bei einem Duplikat wählst du mit der Duplikatauswahl das Problem aus, das beibehalten werden soll. Das eingegangene Problem erhält den Status Duplikat und verweist auf dieses Problem. Sobald ein Eintrag die Triage verlässt, wird der nächste ausgewählt. Prüfe den entstandenen Status oder den Duplikatlink direkt im Problem. Der Wechsel zwischen Karten ohne eine dieser Aktionen schließt kein Problem ab.

## Sortierung und Grenzen {#triage-order}

Smart Triage verwendet deterministische Sortierregeln.

Innerhalb jeder Statusspalte stehen zunächst offene Probleme, die andere offene Arbeit blockieren, vor Problemen ohne Blockade. Probleme, die durch offene Arbeit blockiert werden, stehen zuletzt, auch wenn sie selbst andere Probleme blockieren. Abgeschlossene Endpunkte erzeugen diese Priorität nicht mehr. Innerhalb einer Stufe bringen höhere Priorität, kleinerer Aufwand und überfällige oder nahe Fälligkeitstermine die Arbeit nach vorn. Innerhalb derselben Blockadestufe bleiben Probleme mit demselben Ziel zusammen; ihre Gruppe wird nach ihrem bestplatzierten Problem eingeordnet. Bei Gleichstand entscheiden Fälligkeitsdatum, älteres Erstellungsdatum, manuelle Position und schließlich die Kennung als stabiler letzter Vergleich. Eine verwandte Beziehung beeinflusst diese Sortierung nicht. Es handelt sich nicht um einen experimentellen KI-Triage-Modus. Die Reihenfolge hilft zu entscheiden, welche Einträge du zuerst prüfst; sie bestätigt weder den Wahrheitsgehalt einer Beschreibung, noch löst sie Duplikate automatisch auf oder gewährt Berechtigungen.

Fehlt der erwartete Eintrag, prüfe aktives Projekt, Status und Filter und suche dann seine Kennung. Importierte oder extern synchronisierte Arbeit kann in der Triage landen. Prüfe die ursprüngliche Quelle und die Zuordnung der Integration, bevor du gespiegelte Felder änderst. Eine aus Feedback verknüpfte Anfrage bleibt ein gesondertes Feedback-Objekt mit eigener öffentlicher Diskussion.


![Eingegangenes Demoproblem DOC-11 mit Bericht, Eigenschaften und Funktionen für Duplikat, Ablehnen und Akzeptieren.](/documentation/de/triage-incoming.png)
