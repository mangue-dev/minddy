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
  "revision": 12,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-04",
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
      "app/(app)/statistics/page.tsx",
      "components/stats/stats-hero.tsx"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review MIN-794: source audit against v0.20.0..HEAD; corrected the activity grid description to state that its rows follow the First day of the week preference, and added a pointer to project statistics in project settings; no browser walkthrough; figures not reviewed in this pass)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de corrected passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-04"
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
      "caption": "Echter Verlauf des Demokontos: sechs abgeschlossene Tickets in zwei Projekten, dreißig erstellte Tickets, keine abgehakte Notizbuchaufgabe.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Zuerst kommt eine Leiste mit sechs Kennzahlen: **Abgeschlossen**, **Aufgaben abgehakt**, **Erstellt**, **Projekte**, **Längste Serie** und **Aktuelle Serie**. Sie ersetzt den früheren Abschnitt mit den Gesamtwerten. Darunter liest du die Kennzahl der 12 Monate und das Aktivitätsraster, dann **Wohin deine Arbeit ging** mit den Aufschlüsselungen nach Projekt, Kategorie und Ziel sowie **Arbeitsrhythmus** mit **Aktuelle Arbeitslast**, **Tickets pro Zyklus**, **Abstand zum Fälligkeitsdatum** und **Aufschlüsselung nach Aufwand**. **Tickets pro Zyklus**, **Abstand zum Fälligkeitsdatum** und **Aufschlüsselung nach Aufwand** erscheinen nur, wenn Daten vorliegen. Der Tab zeigt festgelegte Zeiträume. Er bietet keinen Datumsfilter für einen anderen Zeitraum. Die Auswertung fasst deine Arbeit zusammen und ist keine Rangliste für die Leistung anderer Mitglieder. Die Statistik eines ganzen Projekts, sichtbar für seine Mitglieder, steht in seinen Einstellungen: siehe [Ein Projekt einrichten](/docs/projects#project-settings).

Anhand erledigter Tickets, Arbeitsgeschwindigkeit, aktiver Tage, Serien und Zeitmessungen kannst du deine eigene Aktivität untersuchen. Das Aktivitätsraster zählt Abschlussereignisse von Tickets und Aufgaben im Aufgabenheft, zusammengefasst nach Kalendertagen in deiner Zeitzone. Seine Zeilen beginnen mit dem Tag, den du unter **Erster Tag der Woche** im Tab **Einstellungen** gewählt hast. Das Raster scrollt nie: Es zeigt die jüngsten Wochen, die auf den Bildschirm passen, ein Telefon also weniger Monate als ein Computer. Ein aktiver Tag hat mindestens ein solches Ereignis. Die aktuelle Serie toleriert einen heute noch leeren Tag, endet aber am nächsten leeren Tag. Die Kennzahl **Abgeschlossen** zählt jede Ticketkennung nur einmal: Wird dasselbe Ticket zweimal auf Erledigt gesetzt, zählt es trotzdem einmal. Ereigniszahl und Zahl unterschiedlicher Tickets beantworten daher verschiedene Fragen. Die Kennzahl über dem Raster addiert die Tickets und Aufgaben im Aufgabenheft, die du in den letzten 12 Monaten abgeschlossen hast; zeige auf die Zahl, um ihre Aufteilung in Tickets, Aufgaben und aktive Tage zu sehen. Auch sie zählt jedes Ticket in diesen 12 Monaten nur einmal: Ein erneut abgeschlossenes Ticket markiert jeden seiner Tage im Raster, erhöht die Kennzahl aber nur um ein Ticket.

Die Zeit nach Aufwand ist der Median der verstrichenen Zeit zwischen dem ersten aufgezeichneten Wechsel eines Tickets zu In Bearbeitung und seinem Abschluss. Berücksichtigt werden geeignete, dir zugewiesene Tickets im Status Erledigt mit Aufwand und beiden Zeitstempeln. Wartezeit ist enthalten; es handelt sich nicht um eine Stoppuhr für geleistete Arbeitsstunden. Die Ansicht **Anzahl der Tickets** zeigt die zugrunde liegende Stichprobengröße. Ein fehlender Median kann bedeuten, dass es keine geeigneten Messungen gibt, nicht dass die Dauer null ist. Prüfe vor einem Vergleich, welche Einheit und welchen Zeitraum der jeweilige Abschnitt verwendet.

## Wenige oder veränderte Daten einordnen {#statistics-limits}

Ein Konto, das noch kein Ticket erstellt oder abgeschlossen und keine Aufgabe im Aufgabenheft abgehakt hat, sieht statt der Kennzahlen **Noch nichts zu messen** mit der Schaltfläche **Neues Ticket**, oder **Das erste Projekt erstellen**, wenn es kein Projekt gibt, in dem ein Ticket erstellt werden kann. Ein leerer Zeitraum kann bedeuten, dass keine passenden abgeschlossenen Arbeiten oder zu wenige Aktivitäten vorliegen. Daraus folgt nicht, dass dein Konto keine Tickets hat. Änderungen der Aufwandsbezeichnungen, des Umfangs oder der Art der Arbeit können Vergleiche verändern, ohne zu belegen, dass du schneller oder langsamer geworden bist.

Numo kann deine Statistik mit seinen nur lesenden Statistikwerkzeugen abrufen und dieselben Zahlen erklären. Auch sein Zugriff auf Planverbrauch und letzte Ausführungen ist nur lesend. Eine Auskunft verändert dein Budget nicht. Öffne bei Fragen zu KI-Kosten die Verbrauchs- und Kontoeinstellungen, statt den Aufwand eines Tickets zu ändern, um eine Messung zu verbergen.


![Profilstatistik mit Kennzahlenleiste, Aktivitätsraster über 12 Monate, Aufschlüsselung nach Projekt und Kategorie sowie Arbeitsrhythmus.](/documentation/de/personal-statistics-workflow.png)
