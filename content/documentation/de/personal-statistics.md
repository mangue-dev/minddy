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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-737 account settings reorganization; UI/UX refinements batch: account settings open on Preferences",
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (12-month headline deduplication: get_user_stats migration 20270109200067, lib/stats-derive.ts and a production read of one account (685 events, 603 distinct issues); no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: text revised from source review of components/settings/account-settings-page.tsx and components/stats/profile-statistics.tsx; figure personal-statistics-steps recaptured on 2026-10-19 in all six locales from the local candidate (now personal-statistics-workflow.png, demo history mirrored into the statistics ledger by captures/world/seed/018-statistiques.mjs) and inspected; the grid crops to the most recent weeks that fit; no other browser walkthrough); agent:/root (UI/UX refinements batch, account settings opening tab: source review of ACCOUNT_SETTINGS_DEFAULT_TAB in lib/settings-sections.ts, the profile entry in components/app-sidebar.tsx and the /statistics redirect to the Profile tab; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root (de headline deduplication sentence and retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de translation of the account settings opening tab changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "src": "/documentation/de/personal-statistics-workflow.png",
      "alt": "Profilstatistik mit Kennzahlenleiste, Aktivitätsraster über 12 Monate, Aufschlüsselung nach Projekt und Kategorie sowie Arbeitsrhythmus.",
      "caption": "Echter Verlauf des Demokontos: sechs abgeschlossene Vorgänge in zwei Projekten, dreißig erstellte Vorgänge, keine abgehakte Notizbuchaufgabe.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        999
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Statistik öffnen und lesen {#personal-statistics}

Deine Statistik steht im Tab **Profil** der Kontoeinstellungen. Wähle deinen Namen oben im Kontomenü, um ihn direkt zu öffnen. **Kontoeinstellungen** öffnet sich im Tab **Einstellungen**; wähle dort **Profil**, den ersten Tab. Die Statistik erscheint unter deinem Avatar, deinem Namen und deiner E-Mail-Adresse. Die frühere Adresse `/statistics` öffnet jetzt diesen Tab.

Zuerst kommt eine Leiste mit sechs Kennzahlen: **Abgeschlossen**, **Aufgaben abgehakt**, **Erstellt**, **Projekte**, **Längste Serie** und **Aktuelle Serie**. Sie ersetzt den früheren Abschnitt mit den Gesamtwerten. Darunter liest du die Kennzahl der 12 Monate und das Aktivitätsraster, dann **Wohin Ihre Arbeit ging** mit den Aufschlüsselungen nach Projekt, Kategorie und Ziel sowie **Arbeitsrhythmus** mit **Aktuelle Arbeitslast**, **Probleme pro Zyklus**, **Abstand zum Fälligkeitsdatum** und **Aufschlüsselung nach Aufwand**. **Probleme pro Zyklus**, **Abstand zum Fälligkeitsdatum** und **Aufschlüsselung nach Aufwand** erscheinen nur, wenn Daten vorliegen. Der Tab zeigt festgelegte Zeiträume. Sie bietet keinen Datumsfilter für einen anderen Zeitraum. Die Auswertung fasst deine Arbeit zusammen und ist keine Rangliste für die Leistung anderer Mitglieder.

Anhand erledigter Tickets, Arbeitsgeschwindigkeit, aktiver Tage, Serien und Zeitmessungen kannst du deine eigene Aktivität untersuchen. Das Aktivitätsraster zählt Abschlussereignisse von Problemen und Aufgaben im Aufgabenheft, zusammengefasst nach Kalendertagen in deiner Zeitzone. Das Raster scrollt nie: Es zeigt die jüngsten Wochen, die auf den Bildschirm passen, ein Telefon also weniger Monate als ein Computer. Ein aktiver Tag hat mindestens ein solches Ereignis. Die aktuelle Serie toleriert einen heute noch leeren Tag, endet aber am nächsten leeren Tag. Die Kennzahl **Abgeschlossen** zählt jede Problemkennung nur einmal: Wird dasselbe Problem zweimal auf Fertig gesetzt, zählt es trotzdem einmal. Ereigniszahl und Zahl unterschiedlicher Probleme beantworten daher verschiedene Fragen. Auch die Kennzahl über dem Raster zählt jedes Problem in ihren 12 Monaten nur einmal: Ein erneut abgeschlossenes Problem markiert jeden seiner Tage im Raster, erhöht die Kennzahl aber nur um ein Problem.

Die Zeit nach Aufwand ist der Median der verstrichenen Zeit zwischen dem ersten aufgezeichneten Wechsel eines Problems zu In Bearbeitung und seinem Abschluss. Berücksichtigt werden geeignete, dir zugewiesene Probleme im Status Fertig mit Aufwand und beiden Zeitstempeln. Wartezeit ist enthalten; es handelt sich nicht um eine Stoppuhr für geleistete Arbeitsstunden. Die Ansicht **Anzahl der Probleme** zeigt die zugrunde liegende Stichprobengröße. Ein fehlender Median kann bedeuten, dass es keine geeigneten Messungen gibt, nicht dass die Dauer null ist. Prüfe vor einem Vergleich, welche Einheit und welchen Zeitraum der jeweilige Abschnitt verwendet.

## Wenige oder veränderte Daten einordnen {#statistics-limits}

Ein leerer Zeitraum kann bedeuten, dass keine passenden abgeschlossenen Arbeiten oder zu wenige Aktivitäten vorliegen. Daraus folgt nicht, dass dein Konto keine Tickets hat. Änderungen der Aufwandsbezeichnungen, des Umfangs oder der Art der Arbeit können Vergleiche verändern, ohne zu belegen, dass du schneller oder langsamer geworden bist.

Numo kann deine Statistik mit seinen nur lesenden Statistikwerkzeugen abrufen und dieselben Zahlen erklären. Auch sein Zugriff auf Tarifverbrauch und letzte Ausführungen ist nur lesend. Eine Auskunft verändert dein Budget nicht. Öffne bei Fragen zu KI-Kosten die Verbrauchs- und Kontoeinstellungen, statt den Aufwand eines Tickets zu ändern, um eine Messung zu verbergen.


![Profilstatistik mit Kennzahlenleiste, Aktivitätsraster über 12 Monate, Aufschlüsselung nach Projekt und Kategorie sowie Arbeitsrhythmus.](/documentation/de/personal-statistics-workflow.png)
