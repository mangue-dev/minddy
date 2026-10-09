---
{
  "id": "choose-an-instance",
  "locale": "de",
  "title": "Cloud und selbst gehostete Instanzen",
  "summary": "Vergleiche den Betriebsaufwand, die Datenziele und die optionalen Anbieter, die du selbst einrichtest.",
  "topic": "Erste Schritte",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "S07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "v0.11.0",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "Cloud",
      "self-hosted"
    ],
    "evidence": [
      "docs/editions.md",
      "content/knowledge/open-source.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [
    "Cloud oder eine eigene Instanz wählen"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Ein Betriebsmodell wählen {#choose-an-instance}

minddy Cloud und selbst gehostetes minddy nutzen denselben öffentlichen Kern. Wähle Cloud, wenn minddy die Anwendung, Datenbank, Storage und den Scheduler betreiben soll. Wähle Selbsthosting, wenn du den Hostingstandort, Anbieter oder Updatezeitpunkt bestimmen musst und diese Dienste selbst betreiben kannst.

Ein Cloud-Konto gehört zur Cloud. Erstelle für eine selbst gehostete Instanz ein Konto auf dieser Instanz; ein minddy-Cloud-Konto ist dafür nicht erforderlich. Prüfe die Adresse vor der Anmeldung oder einer Einladung. Zwei minddy-Instanzen teilen Konten und Zugangsdaten nicht automatisch.


## Verantwortung und Kosten {#responsibilities}

| Verantwortung | Cloud | Selbsthosting |
| --- | --- | --- |
| Infrastruktur, Updates und Störungen | minddy betreibt den Dienst. | Du wartest Hosts, TLS, Überwachung und Release-Updates. |
| Sicherungen und Wiederherstellung | minddy betreibt den Cloud-Dienst. | Du sicherst Datenbankdaten, Storage-Dateien, Konfiguration und Verschlüsselungsschlüssel und testest Wiederherstellungen. |
| Anbieterkonten | minddy besitzt die Konten für die von minddy betriebenen Dienste. | Du wählst und bezahlst Infrastruktur und optionale Anbieter. |
| Support | Es gelten die Cloud-Supportbedingungen. | Release-Werkzeuge und Community-Hilfe nach Möglichkeit unterstützen bei reproduzierbaren Fehlern im Kern; ein SLA für deinen Infrastrukturbetrieb ist nicht enthalten. |

Ein Team ohne Kapazität für den Datenbankbetrieb kann beispielsweise Cloud nutzen. Ein Betreiber mit Vorgaben zum Speicherort kann Selbsthosting wählen und die Datenziele jedes aktivierten Anbieters prüfen. Selbsthosting der Anwendung macht einen externen KI-, E-Mail- oder Git-Anbieter nicht lokal.

## Erforderliche und optionale Dienste {#services}

Eine unterstützte Installation benötigt die Anwendung sowie Supabase mit PostgreSQL, Auth, Storage und Realtime. PostgreSQL allein reicht nicht aus. Verwende ein Release-Tag und dessen Kompatibilitätsmatrix. Nicht fest versionierte Supabase-Abwandlungen sowie selbst verwaltete GitHub-Enterprise- oder GitLab-Adapter liegen außerhalb des unterstützten Vertrags.

KI, E-Mail, Git, Push-Benachrichtigungen und Nutzungsanalyse hängen von der Konfiguration ab. Selbsthosting erfordert weder Stripe noch PostHog, einen von minddy verwalteten KI-Schlüssel oder ein Cloud-Konto. Fehlende optionale Konfiguration wird gemeldet und nicht stillschweigend durch einen Anbieter ersetzt. Eigene KI-Schlüssel und lokale KI-Endpunkte sind mögliche Optionen; Verfügbarkeit und Kosten hängen von der eingerichteten Funktion ab.

Prüfe vor dem Aktivieren einer Integration die Berechtigungen und Datenbedingungen des Anbieters. Git-Verbindungen können den verwalteten Forge-Relay nutzen, wenn du die Integration ausdrücklich startest; eigene Anbieteranwendungen und das Abschalten des Relays sind ebenfalls möglich. Selbsthosting ist keine abgespeckte Stufe für Kernfunktionen.

## Quelle und nächster Schritt {#next-step}

Der maßgebliche Quellcode liegt in [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy) und steht ausschließlich unter GNU AGPL v3.0. Beachte Lizenz und Namensregeln bei veränderten oder gehosteten Bereitstellungen. Öffne für die Installation die öffentliche Selbsthosting-Anleitung und ihren Assistenten. Prüfe vor dem Übertragen vorhandener Arbeit die Anleitung zum Instanzwechsel: Zugangsdaten und Abonnements werden nicht mit den Kontodaten übertragen.
