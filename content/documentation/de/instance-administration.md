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
  "revision": 11,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Admin-Übersicht mit zusammengefassten Konto-, Aktivitäts-, Einführungs- und Inhaltskennzahlen.",
      "caption": "Übersicht zeigt zusammengefasste Kennzahlen der Instanz; die Aufnahme stammt aus einer Demo-Instanz. Finanzen erscheint, weil dort ein verwalteter OpenRouter-Schlüssel eingerichtet ist.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-models.png",
      "alt": "KI-Modell- und Reasoning-Einstellungen der Instanz.",
      "caption": "Modelle legt Standardwerte und besondere Verwendungszwecke fest. Die Aufnahme zeigt die vorhandene Konfiguration; keine Modell- oder Anbietereinstellung wurde geändert.",
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Die Administrationskonsole einer Instanz verwenden {#instance-administration}

Instanzadministration ist von Projekteigentum getrennt. `ADMIN_EMAILS` im Server enthält bestätigte autorisierte Kontoadressen. Serverseitig signiertes `app_metadata.role=admin` ist eine weitere zulässige Rollenzuweisung. Sitzungen verlangen zusätzlich `aal2`, verifizierte MFA und aktuelle Liveprüfungen von Konto und Sitzung. Schlagen diese fehl, bleibt Zugriff gesperrt. Melde dich an, bestätige TOTP und öffne `/admin`. Ändere keine Datenbankrollen zur Umgehung der MFA-Einrichtung. Konsole und private APIs bleiben `noindex`.


![Admin-Übersicht mit zusammengefassten Konto-, Aktivitäts-, Einführungs- und Inhaltskennzahlen.](/documentation/de/instance-administration-overview.png)

![KI-Modell- und Reasoning-Einstellungen der Instanz.](/documentation/de/instance-administration-models.png)

## Vorhandene Funktionen verwenden {#panels}

Die Konsole enthält Übersicht, Benutzer, Modelle und bedingt Finanzen. Finanzen fehlt ohne konfigurierte verwaltete OpenRouter-Funktion; Planvergabe hängt von eingerichteter Abrechnung oder bestehendem Override ab. Selbsthosting ohne kommerzielle Anbieter erhält durch Öffnen der Konsole keine Cloud-Abrechnung. **Benutzer** findet ein Konto nur über seine exakte E-Mail-Adresse. Öffne es, um den Bestätigungsstatus seiner E-Mail zu sehen, sein KI-Nutzungsbudget zu prüfen oder zurückzusetzen, unter der oben genannten Bedingung einen Plan zu verschenken oder es als internes Konto zu markieren, das dann in keiner Statistik mehr zählt. Das Panel zeigt weder Kontoaktivität noch persönliche Inhalte; öffne ein Konto nur für eine Support- oder Abrechnungsaufgabe. Prüfe Modelle, Standardwerte und Nutzer-/Quotenkontrollen in der tatsächlich installierten Version vor Änderungen. Administration betrifft die Instanz, nicht ein einzelnes Projekt. Teste mit Demokonten.

## KI-Entscheidungsmodell wählen {#decision-model}

Unter **Modelle**, Abschnitt **Automatisierungen**, legt **Entscheidungsmodell** das eine Entscheidungsmodell fest, das alle KI-Entscheidungen der Instanz beantwortet: Smart Fill, Smart Assign und die Prüfung von Feedback. Es gibt keine Auswahl pro Projekt, Benutzer oder Funktion. Die Auswahl zeigt nur OpenRouter-Modelle, die die Entscheidungsfähigkeit veröffentlichen; Chat-, Embedding- und Transkriptionsmodelle erscheinen nie. Beim Speichern wird der Kandidat mit einer repräsentativen Entscheidung testweise aufgerufen. Ein Modell, das kein Entscheidungsmodell ist, die Anfrage ablehnt, eine ungültige Antwort liefert oder länger als 5 Sekunden braucht, wird abgelehnt, und das aktuelle Modell bleibt in Gebrauch. Lässt sich der Katalog nicht laden, wird jede Änderung abgelehnt. Selbst gehostete Instanzen ohne verwaltete KI haben keinen Plattformkatalog und behalten den Standard, Jev.

Neue Entscheidungen verwenden das gespeicherte Modell nach etwa einer Minute auf jedem Serverprozess. Scheitert das Modell oder antwortet es unter der Konfidenzschwelle, fällt die Entscheidung wie bisher auf das eigene LLM-Modell der Funktion zurück. Die Schwelle wurde auf Jev kalibriert, und andere Entscheidungsmodelle verteilen ihre Konfidenz anders: Prüfe nach einem Wechsel die Übereinstimmung pro Modell in der Datenbankansicht `ai_decision_evaluations_weekly`. Nutzungszeilen erfassen das Modell, das geantwortet hat.

## Smart-Fill-Beziehungen konfigurieren {#smart-fill-relations}

Nach dem Speichern eines Tickets kann Smart Fill es indexieren und mit verwandten Tickets verknüpfen. Zwei Felder unter **Modelle**, Abschnitt **Automatisierungen**, steuern diese Arbeit:

- **Ticket-Embeddings** wählt das Modell, das Titel und Beschreibung von Tickets in Vektoren umwandelt. Standard ist `openai/text-embedding-3-small`. Ein Wechsel startet eine neue Indexversion: Alte und neue Vektoren werden nie verglichen. Der stündliche Job `/api/cron/issue-index` indexiert danach bestehende Tickets, 100 pro Lauf, und belastet den Eigentümer des jeweiligen Projekts; er legt nie Beziehungen an. Dasselbe Modell wandelt jede Anfrage der inhaltlichen Suche mit den KI-Anbietereinstellungen des suchenden Mitglieds in einen Vektor um; Anfragen werden nur mit Vektoren der aktuellen Indexversion verglichen. Bis ein Ticket neu indexiert ist, finden die Suche nach verwandten Tickets und die inhaltliche Suche es nur über seine Wörter. Derselbe Job wandelt unverschlüsselt gespeicherte Vektoren in verschlüsselte um, sobald ihr Projekt verschlüsselt wird.
- **Modell für Beziehungsentscheidungen** ist das LLM-Ausweichmodell, das Beziehungsentscheidungen beantwortet, wenn das [Entscheidungsmodell](#decision-model) scheitert oder unsicher ist, wie das eigene LLM-Modell jeder Funktion. Standard ist `deepseek/deepseek-v4-flash`.

Embedding- und Transkriptionsfelder lehnen beim Speichern ein Modell der falschen Familie ab, etwa ein Chat-Modell in einem Embedding-Feld, und das aktuelle Modell bleibt in Gebrauch. Diese Prüfung braucht den Plattformkatalog: Lässt er sich nicht laden, etwa auf einer selbst gehosteten Instanz ohne verwaltete KI, kann die Auswahl nicht geprüft werden und wird angenommen. Für Mitglieder, die Automatisierungen mit ihrem eigenen Schlüssel ausführen, enthalten die Standardwerte pro Anbieter `issue_embedding_model`: `text-embedding-3-small` für OpenAI und `gemini-embedding-001` für Google.

## Betreiberpflichten erfüllen {#responsibilities}

Du verantwortest weiterhin minimale Administratorrechte, MFA-Wiederherstellung, Hostgeheimnisse, Sicherungen, Aufbewahrung, Vorfälle und Anbieterkosten. Die Konsole ersetzt weder Datenbank-/Storage-Restore noch SMTP-Test. Prüfe bei verweigertem Zugang bestätigte Adresse, Allowlist, MFA und aktive Sitzung vor Änderungen. Widerrufene oder gesperrte Sitzungen behalten Rechte nicht wegen noch gültigem JWT. Screenshots dürfen keine privaten Daten anderer Nutzer, Sicherheitsfaktoren oder Finanzdetails enthalten.
