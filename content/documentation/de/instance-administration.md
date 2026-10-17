---
{
  "id": "instance-administration",
  "locale": "de",
  "title": "Instanzverwaltung",
  "summary": "Instanzadministration ist von Projekteigentum getrennt.",
  "topic": "Instanz betreiben",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate with the global decision model (MIN-694); MIN-717 Smart Fill relations",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "docs/plans/min-694-decision-model-selection.md",
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "content/documentation/reviews/min-717-smart-fill-relations.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-694 decision model selector, save validation and fallback source and test review; live decision probes recorded in docs/plans/min-694-decision-model-selection.md; existing figures unchanged); agent:/root (MIN-717 Smart Fill relations source review inherited from en revision 6; de translation of added passages; no browser walkthrough)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-694 six-locale decision model section meaning review; agent review, not human acceptance); agent:/root (de translation of MIN-717 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-17"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Die Administrationskonsole einer Instanz verwenden"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-overview.png",
      "alt": "Admin-Übersicht mit zusammengefassten Konto-, Einführungs- und Inhaltskennzahlen.",
      "caption": "Übersicht zeigt zusammengefasste Kennzahlen der Instanz. Finanzen fehlt in diesem Demoprofil, weil kein verwalteter OpenRouter-Schlüssel eingerichtet ist.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-models.png",
      "alt": "KI-Modell- und Reasoning-Einstellungen der Instanz.",
      "caption": "Modelle legt Standardwerte und besondere Verwendungszwecke fest. Die Aufnahme zeigt die vorhandene Konfiguration; keine Modell- oder Anbietereinstellung wurde geändert.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Die Administrationskonsole einer Instanz verwenden {#instance-administration}

Instanzadministration ist von Projekteigentum getrennt. `ADMIN_EMAILS` im Server enthält bestätigte autorisierte Kontoadressen. Serverseitig signiertes `app_metadata.role=admin` ist eine weitere zulässige Rollenzuweisung. Sitzungen verlangen zusätzlich `aal2`, verifizierte MFA und aktuelle Liveprüfungen von Konto und Sitzung. Schlagen diese fehl, bleibt Zugriff gesperrt. Melden Sie sich an, bestätigen Sie TOTP und öffnen Sie `/admin`. Ändern Sie keine Datenbankrollen zur Umgehung der MFA-Einrichtung. Konsole und private APIs bleiben `noindex`.


![Admin-Übersicht mit zusammengefassten Konto-, Einführungs- und Inhaltskennzahlen.](/documentation/de/instance-administration-overview.png)

![KI-Modell- und Reasoning-Einstellungen der Instanz.](/documentation/de/instance-administration-models.png)

## Vorhandene Funktionen verwenden {#panels}

Die Konsole enthält Übersicht, Benutzer, Modelle und bedingt Finanzen. Finanzen fehlt ohne konfigurierte verwaltete OpenRouter-Funktion; Planvergabe hängt von eingerichteter Abrechnung oder bestehendem Override ab. Selbsthosting ohne kommerzielle Anbieter erhält durch Öffnen der Konsole keine Cloud-Abrechnung. Prüfen Sie Modelle, Standardwerte und Nutzer-/Quotenkontrollen in der tatsächlich installierten Version vor Änderungen. Administration betrifft die Instanz, nicht ein einzelnes Projekt. Testen Sie mit Demokonten.

## KI-Entscheidungsmodell wählen {#decision-model}

Unter **Modelle**, Abschnitt **Automatisierungen**, legt **Entscheidungsmodell** das eine Entscheidungsmodell fest, das alle KI-Entscheidungen der Instanz beantwortet: Smart Fill, Smart Assign und die Prüfung von Feedback. Es gibt keine Auswahl pro Projekt, Benutzer oder Funktion. Die Auswahl zeigt nur OpenRouter-Modelle, die die Entscheidungsfähigkeit veröffentlichen; Chat-, Embedding- und Transkriptionsmodelle erscheinen nie. Beim Speichern wird der Kandidat mit einer repräsentativen Entscheidung testweise aufgerufen. Ein Modell, das kein Entscheidungsmodell ist, die Anfrage ablehnt, eine ungültige Antwort liefert oder länger als 5 Sekunden braucht, wird abgelehnt, und das aktuelle Modell bleibt in Gebrauch. Lässt sich der Katalog nicht laden, wird jede Änderung abgelehnt. Selbst gehostete Instanzen ohne verwaltete KI haben keinen Plattformkatalog und behalten den Standard, Jev.

Neue Entscheidungen verwenden das gespeicherte Modell nach etwa einer Minute auf jedem Serverprozess. Scheitert das Modell oder antwortet es unter der Konfidenzschwelle, fällt die Entscheidung wie bisher auf das eigene LLM-Modell der Funktion zurück. **KI-Entscheidungen** bleibt der Notschalter, der alle Entscheidungen an dieses LLM-Modell schickt. Die Schwelle wurde auf Jev kalibriert, und andere Entscheidungsmodelle verteilen ihre Konfidenz anders: Prüfen Sie nach einem Wechsel die Übereinstimmung pro Modell in der Datenbankansicht `ai_decision_evaluations_weekly`. Nutzungszeilen erfassen das Modell, das geantwortet hat.

## Smart-Fill-Beziehungen konfigurieren {#smart-fill-relations}

Nach dem Speichern eines Problems kann Smart Fill es indexieren und mit verwandten Problemen verknüpfen. Drei Felder unter **Modelle**, Abschnitt **Automatisierungen**, steuern diese Arbeit:

- **Smart-Fill-Beziehungen** ist der Schalter der Instanz. Ist er aus, stoppen Problemindexierung und Beziehungsableitung überall, einschließlich der Hintergrundindexierung bestehender Probleme; das Erstellen und Bearbeiten von Problemen bleibt unberührt. Die Beziehungsableitung stoppt auch, solange der Schalter **Smart-Fill** derselben Gruppe aus ist.
- **Problem-Embeddings** wählt das Modell, das Titel und Beschreibung von Problemen in Vektoren umwandelt. Standard ist `openai/text-embedding-3-small`. Ein Wechsel startet eine neue Indexversion: Alte und neue Vektoren werden nie verglichen. Der stündliche Job `/api/cron/issue-index` indexiert danach bestehende Probleme, 100 pro Lauf, und belastet den Eigentümer des jeweiligen Projekts; er legt nie Beziehungen an. Bis ein Problem neu indexiert ist, findet die Suche nach verwandten Problemen es nur über seine Wörter.
- **Modell für Beziehungsentscheidungen** ist das LLM-Ausweichmodell, das Beziehungsentscheidungen beantwortet, wenn das [Entscheidungsmodell](#decision-model) scheitert oder unsicher ist, wie das eigene LLM-Modell jeder Funktion. Standard ist `deepseek/deepseek-v4-flash`.

Embedding- und Transkriptionsfelder lehnen beim Speichern ein Modell der falschen Familie ab, etwa ein Chat-Modell in einem Embedding-Feld, und das aktuelle Modell bleibt in Gebrauch. Diese Prüfung braucht den Plattformkatalog: Lässt er sich nicht laden, etwa auf einer selbst gehosteten Instanz ohne verwaltete KI, kann die Auswahl nicht geprüft werden und wird angenommen. Für Mitglieder, die Automatisierungen mit ihrem eigenen Schlüssel ausführen, enthalten die Standardwerte pro Anbieter `issue_embedding_model`: `text-embedding-3-small` für OpenAI und `gemini-embedding-001` für Google.

## Betreiberpflichten erfüllen {#responsibilities}

Sie verantworten weiterhin minimale Administratorrechte, MFA-Wiederherstellung, Hostgeheimnisse, Sicherungen, Aufbewahrung, Vorfälle und Anbieterkosten. Die Konsole ersetzt weder Datenbank-/Storage-Restore noch SMTP-Test. Prüfen Sie bei verweigertem Zugang bestätigte Adresse, Allowlist, MFA und aktive Sitzung vor Änderungen. Widerrufene oder gesperrte Sitzungen behalten Rechte nicht wegen noch gültigem JWT. Screenshots dürfen keine privaten Daten anderer Nutzer, Sicherheitsfaktoren oder Finanzdetails enthalten.
