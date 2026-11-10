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
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/issue-semantic-search.ts",
      "components/admin/admin-accounts-dashboard.tsx",
      "components/admin/admin-costs-dashboard.tsx",
      "components/admin/admin-models-dashboard.tsx",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "lib/server/model-config.ts",
      "lib/server/assistant/admin-tools.ts",
      "lib/instance-variables.ts",
      "lib/server/instance-variables.ts",
      "app/api/admin/instance-variables/route.ts",
      "components/admin/admin-instance-dashboard.tsx",
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/conversation-config.ts"
    ]
  },
  "review": {
    "revision": 18,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-930: home summary added to the Assistant category of Models, checked against lib/ai-model-config.ts); agent:claude-code (MIN-954: sentence on Numo's model on minddy Cloud in #models, source audit against lib/server/assistant/conversation-config.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954 model roles: #models, #models-file, #decision-model and #smart-fill-relations rewritten for one model per role, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot still shows the former category cards and needs a recapture); agent:claude-code (MIN-954: recommended models and routing shortcuts removed from #models and #models-file, checked against components/admin/admin-models-dashboard.tsx and lib/ai-model-config-file.ts)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration",
    "recommended-models"
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
      "alt": "Tab Konten mit der Anzahl der Konten und der Kontosuche über die exakte E-Mail-Adresse.",
      "caption": "Konten zeigt die Anzahl der Konten und die Support-Suche; die Aufnahme stammt von einer Demo-Instanz.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "alt": "Tab Modelle mit einem Standardmodell pro Kategorie und eingeklappten Modellen pro Aufgabe.",
      "caption": "Modelle zeigt ein Standardmodell pro Kategorie; die Modelle pro Aufgabe bleiben eingeklappt. Für diese Aufnahme wurde keine Modell- oder Anbietereinstellung geändert.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-instance",
      "kind": "screenshot",
      "src": "/documentation/de/instance-administration-instance.png",
      "alt": "Tab Instanz mit der Quelle jeder Variablen, einem hier gesetzten, maskierten OpenRouter-Schlüssel und den Administratoradressen aus der Datei.",
      "caption": "Instanz zeigt, woher jeder Wert stammt; Geheimnisse zeigen nur ihre letzten Zeichen. Diese Aufnahme stammt von einer lokalen selbst gehosteten Wegwerf-Instanz.",
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-10-29",
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


![Tab Konten mit der Anzahl der Konten und der Kontosuche über die exakte E-Mail-Adresse.](/documentation/de/instance-administration-overview.png)

![Tab Modelle mit einem Standardmodell pro Kategorie und eingeklappten Modellen pro Aufgabe.](/documentation/de/instance-administration-models.png)

## Vorhandene Funktionen verwenden {#panels}

Die Konsole hat drei Tabs: **Konten**, **Kosten**, **Modelle** und, wo erlaubt, **Instanz**. **Kosten** bleibt ohne verknüpfte verwaltete OpenRouter-Funktion ausgeblendet. Links auf die früheren Tabs Übersicht, Nutzer und Finanzen öffnen **Konten** oder **Kosten**. Das Verschenken eines Plans setzt eine konfigurierte Abrechnung oder eine bestehende Überschreibung voraus. Eine selbst gehostete Instanz ohne kommerzielle Anbieter erhält durch das Öffnen der Konsole keine Cloud-Abrechnung. Administrative Änderungen betreffen die ganze Instanz, nicht ein Projekt; prüfe sie mit Demo-Konten.

## Ein Konto betreuen {#accounts}

**Konten** zeigt, wie viele Konten die Instanz hat. Darunter findest du ein Konto nur über seine exakte E-Mail-Adresse mit **Konto suchen**. Öffne es, um den Bestätigungsstatus seiner E-Mail zu sehen, sein KI-Nutzungsbudget zu prüfen oder **Zurücksetzen**, oder unter der obigen Bedingung **Einen Plan verschenken**. Der Tab zeigt weder Aktivität noch Registrierungen, Onboarding, Projektanzahl oder persönliche Inhalte; öffne ein Konto nur für eine Support- oder Abrechnungsaufgabe.

## Die Kosten der Instanz verfolgen {#costs}

**Kosten** zeigt, was die KI-Anbieter die Instanz kosten, in Dollar, wie sie abrechnen, und aktualisiert sich selbst, solange der Tab offen bleibt. Wähle den Zeitraum im Menü oben rechts im Bereich und grenze alles mit der Schaltfläche **Filter** daneben nach Funktion oder Modell ein. Aufrufe mit persönlichen Schlüsseln der Mitglieder werden nie erfasst und erscheinen daher hier nicht. Es folgen vier Kennzahlen, jede mit ihrem Verlauf und ihrer Veränderung gegenüber dem vorherigen Zeitraum: Gesamtausgaben, Anfragen, Tokens und Kosten pro Million Tokens. Darunter stehen die teuersten Funktionen und Modelle, dann die Ausgaben pro Tag nach Modell und nach Funktionsfamilie, die Anfragen pro Tag nach Modell und die letzten Ausführungen, die sich zu ihren Aufrufen öffnen. Einnahmen, Abonnements und Margen werden nicht angezeigt: Die Stripe-Abrechnung wird in Stripe verwaltet. OpenRouter-Schlüssel pro Konto, die kein Konto mehr nutzt, werden jede Nacht gelöscht.

## Die Modelle wählen {#models}

**Modelle** hat eine Karte je Modellart, und jede Art nutzt ein einziges Modell für die ganze Instanz. **Sprachmodell** legt das Modell fest, das Numo und jede Textaufgabe nutzen: Unterhaltungstitel, Websuche, Ereignisprüfung, Zusammenfassung der Startseite, Smart Fill und seine Titel, Smart Assign, Beziehungsentscheidungen, Zuordnung von CSV-Importen, Aufteilung von Briefings, Merge-Commit-Nachrichten, Bereinigung von Diktaten, Prüfung von Feedback und das FAQ-Fragefeld. Dieselbe Karte enthält Numos **Reasoning-Stufe** und **Hintergrund-Turns pro Tag**, das die Durchläufe begrenzt, die [Numo im Hintergrund](/docs/numo#background) für ein Mitglied in 24 Stunden macht: 20 bei leerem Feld, 0 schaltet Numo im Hintergrund für alle aus; die Modelldatei enthält den Wert nicht und setzt ihn nicht zurück. **Embeddings** legt das eine Embedding-Modell für Tickets und Feedback fest, **Spracheingabe** das Speech-to-Text-Modell und **Entscheidungen** das [Entscheidungsmodell](#decision-model). Keine Aufgabe hat ein eigenes Modell. Eine Instanz, die in einer früheren Version einen Kategorie-Standard gesetzt hatte, nutzt ihn weiter: Die Karte zeigt ihn, und Speichern der Karte ersetzt ihn. **Persönliche Schlüssel** ist unten eingeklappt: Für jeden Anbieter enthält es das Modell, das der eigene Schlüssel eines Mitglieds für jede Art nutzt, wenn das Mitglied keines gewählt hat.

Auf minddy Cloud nutzt Numo bei jedem Mitglied das Modell und die **Reasoning-Stufe** der Karte **Sprachmodell**; Mitglieder können sie nicht ändern. Nur ein persönlicher Schlüssel gibt einem Mitglied die Wahl des Sprachmodells, das dann Numo und jede Textaufgabe dieses Mitglieds bedient.

## Die Modellkonfiguration exportieren und importieren {#models-file}

Oben rechts im Bereich **Modelle** lädt **Exportieren** die Modellkonfiguration als versionierte JSON-Datei herunter (Format `minddy.instance-models`): das Modell jeder Art, die Reasoning-Stufe und Standardmodelle persönlicher Schlüssel je Anbieter. Sie enthält keinen API-Schlüssel und kein Konto. **Importieren** liest eine solche Datei und listet jede Änderung, bevor etwas geschrieben wird; **Anwenden** schreibt alle, oder keine, wenn ein Wert abgelehnt wird, etwa ein Modell, das kein Entscheidungsmodell ist. Ein Import ersetzt die Konfiguration: Einstellungen, die die Datei auslässt, kehren zu ihrem Standard zurück. Eine Datei einer früheren minddy-Version wird ins aktuelle Format überführt: Ihre Standards der Kategorien Assistent und Embeddings füllen Sprachmodell und Embedding-Modell, und ihre Modelle je Aufgabe, Routing-Kürzel und empfohlenen Modelle werden aufgelistet und übersprungen. Eine Datei einer neueren Version wird abgelehnt, bis die Instanz aktualisiert ist.

## Die Instanz mit Numo verwalten {#numo}

In einer Numo-Unterhaltung, die aus einer Administratorsitzung gestartet wurde, kann Numo die KI-Kosten der Instanz mit denselben Zahlen und Filtern wie unter **Kosten** lesen, die Modellkonfiguration lesen und ändern, einen Import prüfen und übernehmen, auch eine an die Unterhaltung angehängte Konfigurationsdatei, ein Konto über seine exakte E-Mail-Adresse finden, seinen Plan und sein KI-Nutzungsbudget lesen sowie einen Plan verschenken oder zurücknehmen. Die Administratorsitzung wird vor jeder dieser Aktionen erneut geprüft, und Numo lässt dich jede Änderung bestätigen, bevor es sie ausführt. Diese Werkzeuge liefern weder Aktivität noch Projekte oder Inhalte eines anderen Kontos. [Numo im Hintergrund](/docs/numo#background) erhält sie ebenfalls, solange dein Konto Administrator ist und die Zwei-Faktor-Authentifizierung eingeschaltet hat: Es liest die Modellkonfiguration und die Kosten von sich aus, und jede andere Aktion braucht eine deiner Erinnerungen, die deine Bestätigung ersetzt. @Numo-Erwähnungen, Routinen und die öffentliche Dokumentationshilfe erhalten sie nie.

## Die Variablen der Instanz bearbeiten {#instance-variables}

Auf einer selbst gehosteten Instanz, deren Umgebungsdatei `MINDDY_CONFIG_OVERRIDES=1` setzt, ändert der Tab **Instanz** einige ihrer Variablen, ohne die Datei zu bearbeiten: den OpenRouter-Schlüssel, die Administratoradressen, den E-Mail-Anbieter und die Absender, deine eigenen GitHub- und GitLab-Apps, die Analysen, den Namen und die Kontaktadresse der Instanz sowie die Veröffentlichung der Modellkonfiguration. Die Installationsanleitung fragt, ob das erlaubt sein soll, und die Desktop-App schaltet es für die Instanz ein, die sie auf deinem Computer installiert. Nur die Datei schaltet es ein oder aus; minddy Cloud bietet es nie an.

![Tab Instanz mit der Quelle jeder Variablen, einem hier gesetzten, maskierten OpenRouter-Schlüssel und den Administratoradressen aus der Datei.](/documentation/de/instance-administration-instance.png)

Das Suchfeld über der Liste findet eine Variable über ihren Namen, ihre Bezeichnung oder ihre Beschreibung. Ein im Tab gespeicherter Wert ersetzt den der Datei, und **Entfernen** bringt den Wert der Datei zurück. Jede Variable zeigt, woher ihr Wert stammt; Geheimnisse zeigen nur ihre letzten Zeichen. Die meisten Änderungen gelten innerhalb einer Minute; der Tab nennt die, die erst nach einem Neustart der Instanz gelten, und die Desktop-App bietet dann **Jetzt neu starten** an. Datenbankzugang, Verschlüsselungsschlüssel, die App-Adresse und beim Build festgelegte Werte lassen sich nur in der Datei setzen, ein falscher Wert im Tab sperrt dich also nie aus: Entferne ihn oder setze `MINDDY_CONFIG_OVERRIDES=0` in der Datei, um zu ihren Werten zurückzukehren.

Beim Speichern eines Geheimnisses oder der Administratoradressen wirst du nach deinem Zwei-Faktor-Code gefragt, wenn du ihn in den letzten Minuten nicht eingegeben hast, und du kannst deine eigene Adresse nicht entfernen. Jede Änderung erscheint im Posteingang der anderen Administratoren, auch derjenigen mit Administratorrolle, und per E-Mail bei allen Administratoren, dich eingeschlossen, wenn die Instanz E-Mails versendet. Ein unveränderter Wert wird nicht erneut gespeichert. Jede Variable behält ihre letzten Versionen mit Autor und Zeitpunkt; **Wiederherstellen** setzt eine davon wieder ein. Die Werte liegen in der Datenbank, verschlüsselt, wenn die Verschlüsselung des Arbeitsbereichs aktiv ist.

## KI-Entscheidungsmodell wählen {#decision-model}

Unter **Modelle**, **Entscheidungen** legt **Entscheidungsmodell** das eine Entscheidungsmodell fest, das jede KI-Entscheidung der Instanz beantwortet: Smart Fill, Smart Assign, Beziehungsentscheidungen, Ereignisprüfung und die Prüfung von Feedback. Es gibt keine Wahl je Projekt, Nutzer oder Funktion. Die Auswahl listet nur OpenRouter-Modelle, die die Entscheidungsfähigkeit veröffentlichen; Chat-, Embedding- und Transkriptionsmodelle erscheinen nie. Beim Speichern wird der Kandidat mit einer typischen Entscheidung testweise aufgerufen. Ein Modell, das kein Entscheidungsmodell ist, die Anfrage ablehnt, eine ungültige Antwort liefert oder länger als 5 Sekunden braucht, wird abgelehnt, und das aktuelle Modell bleibt in Betrieb. Lässt sich der Katalog nicht laden, wird jede Änderung abgelehnt. Selbst gehostete Instanzen ohne verwaltete KI haben keinen Plattformkatalog und behalten den Standard, Jev.

Neue Entscheidungen nutzen das gespeicherte Modell nach etwa einer Minute auf jedem Serverprozess. Scheitert das Modell oder antwortet es unter der Konfidenzschwelle, fällt die Entscheidung auf das Sprachmodell zurück. Die Schwelle wurde auf Jev kalibriert, und andere Entscheidungsmodelle verteilen ihre Konfidenz anders: Prüfe nach einem Wechsel die Übereinstimmung je Modell in der Datenbankansicht `ai_decision_evaluations_weekly`. Nutzungszeilen vermerken das Modell, das geantwortet hat.

## Beziehungen von Smart Fill konfigurieren {#smart-fill-relations}

Nachdem ein Ticket gespeichert ist, kann Smart Fill es indexieren und mit verwandten Tickets verknüpfen. **Embedding-Modell** unter **Modelle**, **Embeddings** wandelt Titel und Beschreibung von Tickets sowie Feedback in Vektoren um. Standard ist `openai/text-embedding-3-small`. Ein Wechsel startet eine neue Indexversion: Alte und neue Vektoren werden nie verglichen. Der stündliche Job `/api/cron/issue-index` indexiert dann vorhandene Tickets, 100 pro Lauf, und rechnet sie beim Eigentümer jedes Projekts ab; er erstellt nie Beziehungen. Dasselbe Modell wandelt jede Anfrage der Suche nach Bedeutung in einen Vektor um, mit den KI-Anbietereinstellungen des suchenden Mitglieds, und Anfragen werden nur mit Vektoren der aktuellen Indexversion verglichen. Bis ein Ticket neu indexiert ist, finden die Suche nach verwandten Tickets und die Suche nach Bedeutung es nur über seine Wörter. Derselbe Job verschlüsselt im Klartext gespeicherte Vektoren, sobald ihr Projekt verschlüsselt. Beziehungsentscheidungen nutzen das [Entscheidungsmodell](#decision-model) und fallen auf das Sprachmodell zurück, wenn es scheitert oder unsicher ist.

Embedding- und Transkriptionsfelder lehnen beim Speichern ein Modell der falschen Familie ab, etwa ein Chat-Modell in einem Embedding-Feld, und das aktuelle Modell bleibt in Gebrauch. Diese Prüfung braucht den Plattformkatalog: Lässt er sich nicht laden, etwa auf einer selbst gehosteten Instanz ohne verwaltete KI, kann die Auswahl nicht geprüft werden und wird angenommen. Für Mitglieder, die Automatisierungen mit ihrem eigenen Schlüssel ausführen, enthalten die Standardwerte pro Anbieter `issue_embedding_model`: `text-embedding-3-small` für OpenAI und `gemini-embedding-001` für Google.

## Betreiberpflichten erfüllen {#responsibilities}

Du verantwortest weiterhin minimale Administratorrechte, MFA-Wiederherstellung, Hostgeheimnisse, Sicherungen, Aufbewahrung, Vorfälle und Anbieterkosten. Die Konsole ersetzt weder Datenbank-/Storage-Restore noch SMTP-Test. Prüfe bei verweigertem Zugang bestätigte Adresse, Allowlist, MFA und aktive Sitzung vor Änderungen. Widerrufene oder gesperrte Sitzungen behalten Rechte nicht wegen noch gültigem JWT. Screenshots dürfen keine privaten Daten anderer Nutzer, Sicherheitsfaktoren oder Finanzdetails enthalten.
