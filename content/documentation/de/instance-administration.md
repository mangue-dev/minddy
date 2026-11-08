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
  "revision": 16,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-08",
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
      "components/agent/model-combobox.tsx"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured)",
    "language": "agent:claude-code (de changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-08"
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
      "revision": 16,
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
      "revision": 16,
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
      "revision": 16,
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

## Modelle nach Kategorie wählen {#models}

Jede Karte unter **Modelle** hat ein **Standardmodell** für ihre Kategorie: **Assistent** (Numo, Unterhaltungstitel, Websuche, Ereignisprüfung), **Automatisierungen** (Smart Fill und seine Titel, Smart Assign, Beziehungsentscheidungen, Zuordnung von CSV-Importen, Aufteilung von Briefings, Merge-Commit-Nachrichten), **Embeddings** (Embeddings von Tickets und Feedback) und **Feedback und öffentliche Website** (Feedback-Analyse, FAQ-Fragefeld). Eine Aufgabe folgt dem Standardmodell ihrer Kategorie, bis du ihr unter **Modelle pro Aufgabe** ein eigenes Modell gibst; damit sie wieder der Kategorie folgt, wähle in ihrer Auswahl das Modell der Kategorie, das unter seinem eigenen Namen steht und abgehakt ist, solange die Aufgabe ihm folgt. **Standardmodell** bleibt nur dann eine Option, wenn dieses Modell nicht im Katalog steht. Solange das Standardmodell einer Kategorie nicht gesetzt ist, behält jede Aufgabe ihren eigenen integrierten Standard. **Reasoning-Stufe**, **Entscheidungsmodell** und die beiden Einstellungen unter **Spracheingabe** haben eigene Zeilen. In der Karte **Assistent** begrenzt **Hintergrund-Turns pro Tag** die Turns, die [Numo im Hintergrund](/docs/numo#background) für ein Mitglied in 24 Stunden ausführt: 20, wenn das Feld leer ist, 0 schaltet Numo im Hintergrund für alle aus. Die Modelldatei enthält diesen Wert nicht und setzt ihn nicht zurück. Das Setzen eines Standardmodells gibt die Aufgaben frei, die noch ihren integrierten Standard tragen, etwa die, mit denen eine neue Instanz eingerichtet wird; eine Aufgabe mit einem anderen Modell behält es. **Empfohlene Modelle** legt die kurze Liste fest, mit der sich jede Modellauswahl öffnet. **Persönliche Schlüssel** ist unten eingeklappt: Es betrifft nur Mitglieder, die ihren eigenen Anbieterschlüssel nutzen.

## Die Modellkonfiguration exportieren und importieren {#models-file}

Oben rechts im Bereich **Modelle** lädt **Exportieren** die Modellkonfiguration als versionierte JSON-Datei herunter (Format `minddy.instance-models`): Standardmodelle der Kategorien, Modelle der Aufgaben, Routing-Kürzel, Reasoning-Stufe, empfohlene Modelle und Anbieter-Standards für persönliche Schlüssel. Sie enthält weder API-Schlüssel noch Konten. **Importieren** liest eine solche Datei und listet jede Änderung auf, bevor etwas geschrieben wird; **Übernehmen** schreibt alle oder keine, wenn ein Wert abgelehnt wird, zum Beispiel ein Modell, das kein Entscheidungsmodell ist. Ein Import ersetzt die Konfiguration: Einstellungen, die die Datei nicht enthält, kehren zu ihrem Standard zurück. Eine Datei aus einer früheren minddy-Version wird ins aktuelle Format gebracht; eine Datei aus einer neueren Version wird abgelehnt, bis die Instanz aktualisiert ist. Einträge, die diese Version nicht kennt, werden aufgelistet und übersprungen.

## Die Instanz mit Numo verwalten {#numo}

In einer Numo-Unterhaltung, die aus einer Administratorsitzung gestartet wurde, kann Numo die KI-Kosten der Instanz mit denselben Zahlen und Filtern wie unter **Kosten** lesen, die Modellkonfiguration lesen und ändern, einen Import prüfen und übernehmen, auch eine an die Unterhaltung angehängte Konfigurationsdatei, ein Konto über seine exakte E-Mail-Adresse finden, seinen Plan und sein KI-Nutzungsbudget lesen sowie einen Plan verschenken oder zurücknehmen. Die Administratorsitzung wird vor jeder dieser Aktionen erneut geprüft, und Numo lässt dich jede Änderung bestätigen, bevor es sie ausführt. Diese Werkzeuge liefern weder Aktivität noch Projekte oder Inhalte eines anderen Kontos. @Numo-Erwähnungen, Routinen und die öffentliche Dokumentationshilfe erhalten sie nie.

## Die Variablen der Instanz bearbeiten {#instance-variables}

Auf einer selbst gehosteten Instanz, deren Umgebungsdatei `MINDDY_CONFIG_OVERRIDES=1` setzt, ändert der Tab **Instanz** einige ihrer Variablen, ohne die Datei zu bearbeiten: den OpenRouter-Schlüssel, die Administratoradressen, den E-Mail-Anbieter und die Absender, deine eigenen GitHub- und GitLab-Apps, die Analysen, den Namen und die Kontaktadresse der Instanz sowie die Veröffentlichung der Modellkonfiguration. Die Installationsanleitung fragt, ob das erlaubt sein soll, und die Desktop-App schaltet es für die Instanz ein, die sie auf deinem Computer installiert. Nur die Datei schaltet es ein oder aus; minddy Cloud bietet es nie an.

![Tab Instanz mit der Quelle jeder Variablen, einem hier gesetzten, maskierten OpenRouter-Schlüssel und den Administratoradressen aus der Datei.](/documentation/de/instance-administration-instance.png)

Das Suchfeld über der Liste findet eine Variable über ihren Namen, ihre Bezeichnung oder ihre Beschreibung. Ein im Tab gespeicherter Wert ersetzt den der Datei, und **Entfernen** bringt den Wert der Datei zurück. Jede Variable zeigt, woher ihr Wert stammt; Geheimnisse zeigen nur ihre letzten Zeichen. Die meisten Änderungen gelten innerhalb einer Minute; der Tab nennt die, die erst nach einem Neustart der Instanz gelten, und die Desktop-App bietet dann **Jetzt neu starten** an. Datenbankzugang, Verschlüsselungsschlüssel, die App-Adresse und beim Build festgelegte Werte lassen sich nur in der Datei setzen, ein falscher Wert im Tab sperrt dich also nie aus: Entferne ihn oder setze `MINDDY_CONFIG_OVERRIDES=0` in der Datei, um zu ihren Werten zurückzukehren.

Beim Speichern eines Geheimnisses oder der Administratoradressen wirst du nach deinem Zwei-Faktor-Code gefragt, wenn du ihn in den letzten Minuten nicht eingegeben hast, und du kannst deine eigene Adresse nicht entfernen. Jede Änderung erscheint im Posteingang der anderen Administratoren, auch derjenigen mit Administratorrolle, und per E-Mail bei allen Administratoren, dich eingeschlossen, wenn die Instanz E-Mails versendet. Ein unveränderter Wert wird nicht erneut gespeichert. Jede Variable behält ihre letzten Versionen mit Autor und Zeitpunkt; **Wiederherstellen** setzt eine davon wieder ein. Die Werte liegen in der Datenbank, verschlüsselt, wenn die Verschlüsselung des Arbeitsbereichs aktiv ist.

## KI-Entscheidungsmodell wählen {#decision-model}

Unter **Modelle**, Abschnitt **Automatisierungen**, legt **Entscheidungsmodell** das eine Entscheidungsmodell fest, das alle KI-Entscheidungen der Instanz beantwortet: Smart Fill, Smart Assign und die Prüfung von Feedback. Es gibt keine Auswahl pro Projekt, Benutzer oder Funktion. Die Auswahl zeigt nur OpenRouter-Modelle, die die Entscheidungsfähigkeit veröffentlichen; Chat-, Embedding- und Transkriptionsmodelle erscheinen nie. Beim Speichern wird der Kandidat mit einer repräsentativen Entscheidung testweise aufgerufen. Ein Modell, das kein Entscheidungsmodell ist, die Anfrage ablehnt, eine ungültige Antwort liefert oder länger als 5 Sekunden braucht, wird abgelehnt, und das aktuelle Modell bleibt in Gebrauch. Lässt sich der Katalog nicht laden, wird jede Änderung abgelehnt. Selbst gehostete Instanzen ohne verwaltete KI haben keinen Plattformkatalog und behalten den Standard, Jev.

Neue Entscheidungen verwenden das gespeicherte Modell nach etwa einer Minute auf jedem Serverprozess. Scheitert das Modell oder antwortet es unter der Konfidenzschwelle, fällt die Entscheidung wie bisher auf das eigene LLM-Modell der Funktion zurück. Die Schwelle wurde auf Jev kalibriert, und andere Entscheidungsmodelle verteilen ihre Konfidenz anders: Prüfe nach einem Wechsel die Übereinstimmung pro Modell in der Datenbankansicht `ai_decision_evaluations_weekly`. Nutzungszeilen erfassen das Modell, das geantwortet hat.

**Titel von Smart Fill** unter **Modelle**, Abschnitt **Automatisierungen**, **Modelle pro Aufgabe**, wählt das Modell, das den Titel eines ohne Titel erstellten Tickets schreibt und ihn bei einer Neubewertung neu schreibt. Das ist eine Schreibaufgabe, keine Entscheidung: Das Entscheidungsmodell beantwortet sie nie. Standard ist `deepseek/deepseek-v4-flash`; jemand wartet auf das Ticket, wähle also ein schnelles Modell.

## Beziehungen von Smart Fill konfigurieren {#smart-fill-relations}

Nach dem Speichern eines Tickets kann Smart Fill es indexieren und mit verwandten Tickets verknüpfen. Zwei Felder unter **Modelle** steuern diese Arbeit:

- **Ticket-Embeddings**, im Abschnitt **Embeddings** unter **Modelle pro Aufgabe**, wählt das Modell, das Titel und Beschreibung von Tickets in Vektoren umwandelt. Standard ist `openai/text-embedding-3-small`. Ein Wechsel startet eine neue Indexversion: Alte und neue Vektoren werden nie verglichen. Der stündliche Job `/api/cron/issue-index` indexiert danach bestehende Tickets, 100 pro Lauf, und belastet den Eigentümer des jeweiligen Projekts; er legt nie Beziehungen an. Dasselbe Modell wandelt jede Anfrage der inhaltlichen Suche mit den KI-Anbietereinstellungen des suchenden Mitglieds in einen Vektor um; Anfragen werden nur mit Vektoren der aktuellen Indexversion verglichen. Bis ein Ticket neu indexiert ist, finden die Suche nach verwandten Tickets und die inhaltliche Suche es nur über seine Wörter. Derselbe Job wandelt unverschlüsselt gespeicherte Vektoren in verschlüsselte um, sobald ihr Projekt verschlüsselt wird.
- **Modell für Beziehungsentscheidungen**, im Abschnitt **Automatisierungen** unter **Modelle pro Aufgabe**, ist das LLM-Ausweichmodell, das Beziehungsentscheidungen beantwortet, wenn das [Entscheidungsmodell](#decision-model) scheitert oder unsicher ist, wie das eigene LLM-Modell jeder Funktion. Standard ist `deepseek/deepseek-v4-flash`.

Embedding- und Transkriptionsfelder lehnen beim Speichern ein Modell der falschen Familie ab, etwa ein Chat-Modell in einem Embedding-Feld, und das aktuelle Modell bleibt in Gebrauch. Diese Prüfung braucht den Plattformkatalog: Lässt er sich nicht laden, etwa auf einer selbst gehosteten Instanz ohne verwaltete KI, kann die Auswahl nicht geprüft werden und wird angenommen. Für Mitglieder, die Automatisierungen mit ihrem eigenen Schlüssel ausführen, enthalten die Standardwerte pro Anbieter `issue_embedding_model`: `text-embedding-3-small` für OpenAI und `gemini-embedding-001` für Google.

## Betreiberpflichten erfüllen {#responsibilities}

Du verantwortest weiterhin minimale Administratorrechte, MFA-Wiederherstellung, Hostgeheimnisse, Sicherungen, Aufbewahrung, Vorfälle und Anbieterkosten. Die Konsole ersetzt weder Datenbank-/Storage-Restore noch SMTP-Test. Prüfe bei verweigertem Zugang bestätigte Adresse, Allowlist, MFA und aktive Sitzung vor Änderungen. Widerrufene oder gesperrte Sitzungen behalten Rechte nicht wegen noch gültigem JWT. Screenshots dürfen keine privaten Daten anderer Nutzer, Sicherheitsfaktoren oder Finanzdetails enthalten.
