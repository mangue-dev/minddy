---
{
  "id": "personal-statistics",
  "locale": "de",
  "title": "Persönliche Statistiken",
  "summary": "Vergleiche Abschlüsse und Zeitmessungen innerhalb ihres tatsächlichen Geltungsbereichs.",
  "topic": "Arbeit planen und finden",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
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
      "app/(app)/statistics/page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Deine persönliche Arbeitsstatistik lesen"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/de/reader-statistics.png",
      "alt": "Persönliche Statistik mit Jahresraster, Aufschlüsselungen, Arbeitsrhythmus und Gesamtzahlen.",
      "caption": "Das Demokonto zeigt ein abgeschlossenes und elf erstellte Tickets. Die angezeigten Statistiken sind echt; Projekt- und Zielnamen wurden für die Darstellung übersetzt.",
      "revision": 4,
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
    "personal-statistics-steps"
  ]
}
---

## Statistik öffnen und lesen {#personal-statistics}

Öffne die Statistik über die Navigation deines Kontos. Lies das jährliche Aktivitätsraster, die Aufschlüsselungen nach Projekt, Kategorie und Ziel, den Abschnitt zum Arbeitsrhythmus und die Gesamtwerte. Die Seite zeigt festgelegte Zeiträume. Sie bietet keinen Datumsfilter für einen anderen Zeitraum. Die Auswertung fasst deine Arbeit zusammen und ist keine Rangliste für die Leistung anderer Mitglieder.

Anhand erledigter Tickets, Arbeitsgeschwindigkeit, aktiver Tage, Serien und Zeitmessungen kannst du deine eigene Aktivität untersuchen. Das Aktivitätsraster zählt Abschlussereignisse von Problemen und Aufgaben im Aufgabenheft, zusammengefasst nach Kalendertagen in deiner Zeitzone. Ein aktiver Tag hat mindestens ein solches Ereignis. Die aktuelle Serie toleriert einen heute noch leeren Tag, endet aber am nächsten leeren Tag. Bei der Gesamtzahl abgeschlossener Probleme wird jede Problemkennung nur einmal gezählt. Ereigniszahl und Zahl unterschiedlicher Probleme beantworten daher verschiedene Fragen.

Die Zeit nach Aufwand ist der Median der verstrichenen Zeit zwischen dem ersten aufgezeichneten Wechsel eines Problems zu In Bearbeitung und seinem Abschluss. Berücksichtigt werden geeignete, dir zugewiesene Probleme im Status Fertig mit Aufwand und beiden Zeitstempeln. Wartezeit ist enthalten; es handelt sich nicht um eine Stoppuhr für geleistete Arbeitsstunden. Die Mengenansicht zeigt die zugrunde liegende Stichprobengröße. Ein fehlender Median kann bedeuten, dass es keine geeigneten Messungen gibt, nicht dass die Dauer null ist. Prüfe vor einem Vergleich, welche Einheit und welchen Zeitraum der jeweilige Abschnitt verwendet.

## Wenige oder veränderte Daten einordnen {#statistics-limits}

Ein leerer Zeitraum kann bedeuten, dass keine passenden abgeschlossenen Arbeiten oder zu wenige Aktivitäten vorliegen. Daraus folgt nicht, dass dein Konto keine Tickets hat. Änderungen der Aufwandsbezeichnungen, des Umfangs oder der Art der Arbeit können Vergleiche verändern, ohne zu belegen, dass du schneller oder langsamer geworden bist.

Numo kann deine Statistik mit seinen nur lesenden Statistikwerkzeugen abrufen und dieselben Zahlen erklären. Auch sein Zugriff auf Tarifverbrauch und letzte Ausführungen ist nur lesend. Eine Auskunft verändert dein Budget nicht. Öffne bei Fragen zu KI-Kosten die Verbrauchs- und Kontoeinstellungen, statt den Aufwand eines Tickets zu ändern, um eine Messung zu verbergen.


![Persönliche Statistik mit Jahresraster, Aufschlüsselungen, Arbeitsrhythmus und Gesamtzahlen.](/documentation/de/reader-statistics.png)
