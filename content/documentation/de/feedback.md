---
{
  "id": "feedback",
  "locale": "de",
  "title": "Feedback",
  "summary": "Veröffentliche ein Feedback-Board, verfolge und moderiere Anfragen und verknüpfe angenommenes Feedback mit Projektarbeit.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor",
    "member"
  ],
  "workflows": [
    "F01",
    "F02",
    "F03",
    "F04",
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 16,
  "sourceRevision": 15,
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "components/feedback/feedback-settings-shared.tsx",
      "lib/server/feedback/public-nav.ts",
      "app/f/[token]/voice/route.ts",
      "app/f/[token]/feedback-board-client.tsx",
      "lib/server/feedback/voice.ts",
      "lib/server/feedback/voice-limits.ts",
      "supabase/migrations/20270106320000_atomic_public_feedback_and_share_limits.sql",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/project-integrations.tsx",
      "app/f/[token]/public-comments.tsx"
    ]
  },
  "review": {
    "revision": 16,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of publish-a-feedback-board-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "publish-a-feedback-board",
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views"
  ],
  "tags": [
    "Ein Feedback-Board veröffentlichen",
    "Feedback einreichen, abstimmen und verfolgen",
    "Feedback privat prüfen und öffentlich antworten",
    "Feedback zusammenführen und mit Umsetzung verbinden",
    "Öffentliche Seiten und Ansichten zum Board hinzufügen"
  ],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/publish-a-feedback-board-workflow.png",
      "alt": "Aktiviertes öffentliches Feedback-Board mit Besucheridentität per E-Mail-Code, der Aktion SSO aktivieren und ausgeblendeter URL.",
      "caption": "Der Eigentümer aktiviert das Board und wählt die Besucheridentität. Dieses Demo-Board nutzt die E-Mail-Bestätigung; seine URL ist ausgeblendet.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        596
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/submit-and-follow-feedback-workflow.png",
      "alt": "Feedback-Formular für Besucher mit Titel, Beschreibung und aktivierter öffentlicher Sichtbarkeit.",
      "caption": "Ein angemeldeter Besucher reicht einen Bedarf ein und bestimmt die Sichtbarkeit. Das Beispiel wurde tatsächlich bei deaktivierter automatischer Prüfung eingereicht.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        624,
        369
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "feedback-objective-selection",
      "kind": "screenshot",
      "src": "/documentation/de/feedback-objective-selection.png",
      "alt": "Komponentenvorschau der Zielauswahl für Feedback und einer Feedback-Integration, beide auf Docs eingestellt.",
      "caption": "Zielauswahl mit Demonstrationsdaten. Neues Feedback übernimmt die Integrationsvorgabe.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        680,
        301
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/feedback-pages-and-views-workflow.png",
      "alt": "Veröffentlichter Feedback-Leitfaden als ausgewählter Board-Tab, ohne Anmeldung lesbar.",
      "caption": "Veröffentliche eine Seite, aktiviere Seitentabs und wähle die Seite für das Board aus. Die Demoseite wurde anonym geöffnet; ihre undurchsichtige URL behält `noindex`.",
      "revision": 16,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1328,
        668
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "feedback-objective-selection",
    "feedback-pages-and-views-workflow"
  ]
}
---

Feedback verbindet Besucheranfragen mit der Prüfung und Umsetzung durch das Projektteam. Eigentümer konfigurieren das öffentliche Board, Besucher reichen Anfragen ein und verfolgen sie, Mitglieder moderieren oder verknüpfen sie mit Tickets. Unterscheide bei der Zugriffsverwaltung öffentliche Antworten, interne Notizen und separat veröffentlichte Seiten oder Ansichten.

## Ein Feedback-Board veröffentlichen {#publish-a-feedback-board}

Öffne als Projektinhaber Feedback in den Projekteinstellungen. Schließe die Einrichtung ab, falls noch kein Board existiert, und aktiviere dann den öffentlichen Board-Kanal. Kopiere die öffentliche URL und öffne sie in einem abgemeldeten Browser, um die Besucheransicht zu prüfen. Mitglieder können die Einstellungen einsehen, aber weder die Veröffentlichung ändern noch Tokens erneuern oder das SSO-Geheimnis verwalten.

Wähle, ob Besucher sich mit einem E-Mail-Code oder über das konfigurierte SSO identifizieren. Konfiguriere öffentliche Kommentare, die Kategorienanzeige und ausgewählte öffentliche Seiten- oder Ansichtstabs. Prüfe die sichtbaren Daten, bevor du die URL weitergibst. Besucher können ohne Identifikation lesen; Beiträge, Stimmen und Kommentare erfordern eine Board-Identität. Öffentliche Darstellungen zeigen weder E-Mail-Adresse noch echten Namen der Besucher. Das Team kann identifizierte Rückmeldungen dennoch intern bearbeiten.

### Veröffentlichung und Eingang trennen {#channels}

Wenn du das Board deaktivierst, sind seine Besucherseiten nicht mehr erreichbar. Die Server-zu-Server-Erfassung verwendet einen separaten Feedback-Integrationsschlüssel und kann ohne öffentliches Board weiterlaufen. Auch die gewählte Sichtbarkeit eines Beitrags, sein Prüfstatus und sein Spamstatus bestimmen, ob er sichtbar ist. Ein aktiviertes Board veröffentlicht allein noch nicht jeden Beitrag.

Der Eigentümer schaltet die **Numo-Überprüfung** in den Feedback-Einstellungen des Projekts ein oder aus; einen eigenen Schalter auf Instanzebene gibt es nicht. Bei aktiver Überprüfung warten Einreichungen über das öffentliche Board und über Integrationen vor der Veröffentlichung auf die Prüfung, während vom Team erstelltes Feedback nicht zurückgehalten wird. Als sensibel Erkanntes, etwa eine Sicherheitslücke oder personenbezogene Daten, wird privat und wartet unter **Zu prüfen**. Die Überprüfung nutzt den KI-Anbieter der Instanz und das KI-Budget des Projektinhabers: Ist das Budget aufgebraucht, wartet Feedback, nur für das Team sichtbar, sofern der Eigentümer nicht **Ohne Überprüfung veröffentlichen, wenn das KI-Budget aufgebraucht ist** aktiviert. Ohne Überprüfung wird Feedback so veröffentlicht, wie es eingereicht wurde, ohne automatische Kategorien, Scherzfilter oder Datenschutzprüfung. Prüfe die Warteschlange nach einer Demoeinreichung. Numo sendet öffentliche Antworten nur nach ausdrücklicher Aufforderung.

![Aktiviertes öffentliches Feedback-Board mit Besucheridentität per E-Mail-Code, der Aktion SSO aktivieren und ausgeblendeter URL.](/documentation/de/publish-a-feedback-board-workflow.png)

## Feedback einreichen, abstimmen und verfolgen {#submit-and-follow-feedback}

Öffne die öffentliche Board-URL. Öffentliche Beiträge kannst du ohne minddy-Konto lesen. Zum Einreichen, Abstimmen oder Kommentieren identifizierst du dich über den E-Mail-Code des Boards oder den SSO-Link des Produkts. Die Zustellung des Codes hängt vom E-Mail-Dienst der Instanz ab. Ein Code gilt zehn Minuten und erlaubt fünf Versuche; warte mindestens sechzig Sekunden, bevor du einen neuen anforderst. Gib den Code niemals weiter.

Suche vor einer Einreichung nach vorhandenen Anfragen. Schreibe einen konkreten Titel und beschreibe den Bedarf und seinen Kontext. Titel erlauben 200 Zeichen, der Text 10.000. Die öffentliche Option ist standardmäßig ausgewählt; deaktiviere sie, um die Anfrage privat an das Team zu senden. Prüfe den Text vor dem Absenden auf Geheimnisse. Eine optionale Moderation kann die Anfrage zunächst zurückhalten, bevor sie öffentlich erscheint.

Verwende das Mikrofon im Einreichungsformular, um Titel und Beschreibung zu diktieren. Identifiziere dich zuerst über das Board, erlaube den Mikrofonzugriff und beende dann die Aufnahme. Prüfe den Text, bevor du Senden wählst. Das Diktat füllt den Entwurf aus; es sendet die Anfrage nicht ab. Die Verfügbarkeit hängt von funktionierenden Transkriptions- und KI-Anbietern der Instanz und dem KI-Budget des Projektinhabers ab; einen eigenen Instanzschalter für die Spracheingabe gibt es nicht. Der Verbrauch wird diesem Inhaber gemäß seinen Anbietereinstellungen berechnet, nicht dem Konto des Besuchers.

Aufnahmen auf dem öffentlichen Board sind auf 10 MiB begrenzt. Die Transkription erlaubt pro Board und Stunde 20 Anfragen je identifiziertem Besucher und 40 je IP-Adresse; für die Interpretation des Entwurfs gilt eine separate Grenze von 40 Anfragen je Besucher und Stunde. Diese Grenzen sind von den Diktatgrenzen des Kontos getrennt. Warte bei einer Meldung zum Anfragelimit, bevor du es erneut versuchst. Ist Spracheingabe nicht verfügbar, tippe die Anfrage stattdessen.

### Abstimmen, kommentieren und verfolgen {#follow}

Stimme für eine vorhandene Anfrage, statt sie zu duplizieren. Deine Identität hat eine Stimme pro Beitrag, für eine Anfrage, die du noch lesen kannst: eine öffentliche oder deine eigene. Kommentare erfordern eine Identifikation und aktivierte öffentliche Kommentare; ein öffentlicher Kommentar darf 5.000 Zeichen enthalten. Ein langer Verlauf öffnet sich mit den neuesten Kommentaren; wähle **Frühere Kommentare anzeigen**, um den Rest zu lesen. Du kannst deinen eigenen Kommentar nach einer Bestätigung endgültig entfernen; das Team kann öffentliche Kommentare moderieren.

Öffne Mein Feedback, um deine Einreichungen und Stimmen im Rahmen deiner aktuellen Identität zu finden. Lies dort oder in der Anfrage den öffentlichen Status und die Teamantworten. Interne Teamnotizen sind keine öffentlichen Antworten. Ist das SSO abgelaufen, kehrst du über einen neuen Produktlink zurück. Ein anderer Browser oder eine andere Identität kann deine persönliche Liste verändern.

![Feedback-Formular für Besucher mit Titel, Beschreibung und aktivierter öffentlicher Sichtbarkeit.](/documentation/de/submit-and-follow-feedback-workflow.png)

## Feedback privat prüfen und öffentlich antworten {#moderate-feedback}

Die Listenfilter kombinieren Status, Ziel, Kategorien, Autor, Quelle und Prüfstatus; die Sichtbarkeit ist bei aktiviertem öffentlichem Board verfügbar. Mehrere Werte derselben Eigenschaft gelten als Alternativen, verschiedene Eigenschaften gemeinsam. Setze die Filter zurück, um zur ursprünglichen Liste zurückzukehren. Die Liste zeigt jeweils bis zu 500 Anfragen, die diesen Filtern entsprechen. Öffne das Untermenü einer Eigenschaft und wähle Werte aus; die Zahl zeigt die Anzahl ausgewählter Werte. Auf Mobilgeräten klappst du den Eigenschaftsbereich auf.

Der Projekteigentümer und Mitglieder öffnen den Feedback-Bereich des Projekts und wählen eine Anfrage aus der Prüfliste oder Übersicht. Leser können Anfragen lesen, aber nicht moderieren. Lies den ursprünglichen Beitrag, seine öffentliche oder private Sichtbarkeit, den Prüfstatus und mögliche Moderations- oder Duplikatvorschläge. Du kannst den kanonischen Titel und Text präzisieren; die ursprünglich eingereichten Texte bleiben erhalten. Weise Kategorien und einen geeigneten öffentlichen Status zu. Spam erscheint niemals auf dem öffentlichen Board. Eine private Anfrage bleibt etwas anderes als eine öffentliche Anfrage, die nur auf Prüfung wartet.

Eine optionale Übersetzung steht für das Team neben dem Ausgangstext; das öffentliche Board behält das Feedback in seiner ursprünglichen Sprache. Prüfe KI-Klassifizierungen, bevor du dich darauf verlässt. Ist ein Beitrag mit einem Ticket verknüpft, bestimmt dieses Ticket seinen Status; der Status lässt sich dann nicht unabhängig ändern.

Um mehrere Feedbacks auf einmal zu bearbeiten, halte die Umschalttaste gedrückt und klicke auf jedes Feedback in der Liste; ausgewählte Feedbacks erhalten einen getönten Hintergrund, und ein Klick auf eine leere Stelle der Liste hebt die Auswahl auf. Wähle in der schwebenden Leiste **Aktionen** oder drücke Command+K unter macOS bzw. Strg+K auf anderen Systemen, um **Status ändern**, **Ziel ändern**, **Kategorie hinzufügen** oder **Kategorie entfernen**, bei veröffentlichtem Board **Sichtbarkeit ändern**, ausstehende KI-Analysen zu veröffentlichen oder nach einer Bestätigung **In den Papierkorb verschieben** zu wählen. **Abgelehnt** und **Spam** verlangen dieselbe Bestätigung wie bei einem einzelnen Feedback, und ein Feedback, dessen Status einem verknüpften Ticket folgt, behält ihn. **Numo fragen** in der Leiste oder @ öffnet Numo mit allen ausgewählten Feedbacks im Kontext.

### Notizen und öffentliche Antworten {#responses}

Wähle für Teamnotizen die interne Diskussion. Öffentliche Antworten sind für Besucher sichtbar; prüfe die Sichtbarkeit vor dem Absenden. Ein Leser mit **Darf kommentieren** kann sich an internen Diskussions-Threads beteiligen, aber nicht öffentlich auf dem Board antworten. Antworten übernehmen die Sichtbarkeit ihres Threads. Eine interne Auswahl im Eingabefeld macht eine Antwort in einem öffentlichen Thread daher nicht privat. Öffentliche Numo-Antworten brauchen eine ausdrückliche Aufforderung; eine Numo-Erwähnung in einem öffentlichen Kommentar löst keine automatische Antwort aus.

Teammitglieder können öffentliche Kommentare zur Moderation löschen. Bearbeiten darf einen Kommentar nur sein Autor; das Team schreibt Besuchertexte niemals um. Bei internen Kommentaren gelten weiterhin die dem Autor vorbehaltenen Regeln. Öffne das Board nach einer öffentlichen Antwort oder Moderationsaktion abgemeldet, um die gewünschte Sichtbarkeit zu bestätigen.

### Ein Ziel für Feedback wählen {#feedback-objective}

Die Liste zeigt das verknüpfte Ziel unter Autor und Kategorien. In den Zieleigenschaften zählt die Feedbackzahl vorhandene, nicht zusammengeführte Anfragen, einschließlich privater Anfragen für das Team. Wähle die Zahl, um Feedback für dieses Ziel mit allen Statuswerten zu öffnen.

Als Eigentümer oder Mitglied wählst du **Ziel** in den Feedback-Eigenschaften oder beim internen Erfassen einer Rückmeldung. **Keine** entfernt die Verknüpfung. Das Ziel muss zum selben Projekt gehören. Diese interne Zuordnung veröffentlicht keine privaten Ziele auf dem öffentlichen Board und zählt nicht zum Ticketfortschritt.

Der Projekteigentümer kann beim Erstellen einer Feedback-Integration unter **Projekteinstellungen** → **Integrationen** ein optionales Ziel wählen oder die Vorgabe später in der Zeile **Ziel für neues Feedback** unter einer bestehenden Feedback-Integration ändern. Diese Auswahl kann auch ein neues Ziel anlegen. Neue API-Rückmeldungen übernehmen das Ziel, auch bei `analyze: false`. Eine Änderung verschiebt kein bestehendes Feedback. Liegt das Ziel im Papierkorb, wähle ein aktives Ziel oder entferne die Vorgabe vor der nächsten Übermittlung. Numo wählt bei der Feedback-Prüfung niemals ein Ziel. Bitte Numo ausdrücklich, eine Rückmeldung mit einem Ziel zu verknüpfen oder die Zuordnung zu entfernen.

Bei der Umwandlung übernimmt das neue Ticket Ziel und Kategorien der Rückmeldung. Du kannst diese im Erstellungsformular ändern. Ohne gewähltes Ziel bleibt das Feld leer, auch mit aktiviertem Smart Fill. Eine spätere Änderung des Feedback-Ziels verschiebt kein bereits verknüpftes Ticket. Rückmeldungen lassen sich nur mit demselben Ziel zusammenführen, auch wenn beide keines haben. Gleiche die Ziele zuerst ab, wenn das Team denselben Bedarf erkennt.

Eine zusammengeführte Gruppe teilt ein Ziel. Wenn du das Ziel der Hauptanfrage änderst, werden auch die aufgenommenen Anfragen aktualisiert, damit die Gruppe später erneut zusammengeführt werden kann.

![Komponentenvorschau der Zielauswahl für Feedback und einer Feedback-Integration, beide auf Docs eingestellt.](/documentation/de/feedback-objective-selection.png)

## Feedback zusammenführen und mit Umsetzung verbinden {#feedback-to-issue}

Öffne als Eigentümer oder Mitglied die Feedback-Anfrage, wähle **Zusammenführen in…** und dann in der Befehlspalette die kanonische Anfrage desselben Projekts. Der Eintrag erscheint nur, wenn eine andere Anfrage sie aufnehmen kann. Lies zunächst beide Anliegen: Ähnliche Formulierungen beweisen noch kein gleiches Ziel. Die aktuelle Anfrage wird zum Duplikat, Stimmen werden nach Identität zusammengeführt und das Duplikat leitet zur kanonischen Anfrage weiter. Ist die kanonische Anfrage nicht öffentlich, öffnet der Autor des Duplikats es weiterhin schreibgeschützt; andere Besucher erhalten keine Seite. Prüfe das Zusammenführungsereignis in der Aktivität; die Rückgängig-Aktion verwendet dieses Ereignis. Lehne einen falschen KI-Vorschlag ab, statt ihn nur zum Leeren der Warteschlange anzunehmen.

### Arbeit erstellen oder verknüpfen {#work}

Erstelle aus einer Anfrage ein neues Ticket, wenn die Arbeit noch nicht erfasst ist. Prüfe die Erstellungsfelder vor der Bestätigung. Ohne mitgelieferte Felder erstellt die Umwandlung standardmäßig ein Ticket im Backlog. Existiert bereits ein Ticket, verwende stattdessen die Verknüpfung. **Mit bestehendem Ticket verknüpfen** öffnet die Befehlspalette mit den Tickets des Projekts außer abgebrochenen und doppelten. Wenn du den Bedarf beschreibst, erscheinen nach den Textübereinstimmungen auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets unter **Inhaltlich verwandt**. Das hilft, wenn die Anfrage andere Wörter als das Ticket verwendet. Ein bereits verknüpfter Beitrag kann nicht erneut umgewandelt werden. Das Entfernen der Verknüpfung fragt zuerst nach; danach bleibt der letzte öffentliche Status erhalten, und die Beziehung zum Ticket endet.

Der verknüpfte Status folgt dem Ticket: `triage`/`backlog`/`duplicate` → `open`; `todo` → `planned`; `in_progress`/`in_review` → `in_progress`; `done` → `shipped`; `canceled` → `declined`. Wird die Arbeit zurück ins Backlog verschoben, wird auch der Feedback-Status wieder geöffnet. Prüfe nach einer Statusänderung das verknüpfte Ticket und die Anfrage im abgemeldeten Browser.

Teambenachrichtigungen bei neuem Feedback hängen von dessen Quelle und Prüfstatuswechsel ab. Versprich einem Abstimmenden keine automatische E-Mail zu jeder Zusammenführung oder Ticketaktualisierung. Öffentlicher Status und Antworten stehen in Mein Feedback. Eine Verknüpfung macht den Fortschritt sichtbar, ohne das private Ticket selbst offenzulegen.


## Öffentliche Seiten und Ansichten zum Board hinzufügen {#feedback-pages-and-views}

Veröffentliche als Projektinhaber zunächst die gewünschte Projektseite oder teile die gewünschte Ansicht mit öffentlicher Sichtbarkeit. Prüfe den Inhalt auf private Informationen. Öffne die Feedback-Einstellungen, aktiviere die Seiten- oder Ansichtsfamilie und wähle jedes anzuzeigende Element aus. Sowohl der Familienschalter als auch die Auswahl jedes Elements sind erforderlich.

Die Einstellungsliste kann geschützte Freigaben enthalten; die öffentliche Navigation zeigt jedoch nur Freigaben auf öffentlicher Ebene. Die Auswahl einer geschützten Seite umgeht weder deren Schutz noch zeigt sie deren Namen in einem Board-Tab. Ein veröffentlichtes Element aus einem anderen Projekt gehört nicht zur Tabliste dieses Projekts.

### Prüfen und Zugriff entfernen {#visibility}

Öffne das Board abgemeldet. Folge den Tabs zu den ausgewählten Ansichten und Seiten und prüfe Titel und Inhalte. Wenn sie konfiguriert ist, wird die Navigation gemeinsam für Board, öffentliche Ansichten und öffentliche Seiten verwendet. Ein einzelner Tab erscheint nicht als Navigation.

Entferne einen Tab, indem du das Element abwählst oder seine Familie deaktivierst. Dadurch verschwindet die Navigation, nicht die eigentliche Freigabe. Widerrufe oder ändere die Freigabe selbst, um den Zugriff über den direkten Link zu beenden. Die Deaktivierung des Boards deaktiviert auch seine gekoppelte Navigation, widerruft aber nicht jede Seiten- oder Ansichtsfreigabe einzeln. Prüfe nach einer Veröffentlichungsänderung sowohl den Board-Tab als auch die ursprüngliche Freigabe-URL.

![Veröffentlichter Feedback-Leitfaden als ausgewählter Board-Tab, ohne Anmeldung lesbar.](/documentation/de/feedback-pages-and-views-workflow.png)
