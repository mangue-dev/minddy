---
{
  "id": "feedback",
  "locale": "de",
  "title": "Feedback",
  "summary": "Veröffentlichen Sie ein Feedback-Board, verfolgen und moderieren Sie Anfragen und verknüpfen Sie angenommenes Feedback mit Projektarbeit.",
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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/documentation/reviews/feedback-local-capture-candidates.json",
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
      "lib/server/feedback/public-nav.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
      "alt": "Aktiviertes öffentliches Feedback-Board mit lokaler SSO-Identität und ausgeblendeter URL.",
      "caption": "Der Eigentümer aktiviert das Board und wählt die Besucheridentität. Dieses Beispiel verwendet einen lokalen SSO-Signierer; URL und Signaturgeheimnis sind ausgeblendet.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        378
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/submit-and-follow-feedback-workflow.png",
      "alt": "Feedback-Formular für Besucher mit Titel, Beschreibung und aktivierter öffentlicher Sichtbarkeit.",
      "caption": "Ein angemeldeter Besucher reicht einen Bedarf ein und bestimmt die Sichtbarkeit. Das Beispiel wurde tatsächlich bei deaktivierter automatischer Prüfung eingereicht.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        625,
        369
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/moderate-feedback-workflow.png",
      "alt": "Feedback-Detail mit öffentlicher Teamantwort und interner Notiz.",
      "caption": "Das Kennzeichen Öffentlich markiert die für Besucher sichtbare Antwort; die interne Notiz bleibt beim Team. Kein Ergebnis einer KI-Moderation wird gezeigt.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        874
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/feedback-to-issue-workflow.png",
      "alt": "Feedback mit einem neu erstellten verknüpften Issue und dem Status Geplant.",
      "caption": "Die Umwandlung dieses Beispiels erstellte ein verknüpftes Issue im Status Todo. Der öffentliche Feedback-Status wechselte automatisch zu Geplant.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        874
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/feedback-pages-and-views-workflow.png",
      "alt": "Veröffentlichter Feedback-Leitfaden als ausgewählter Board-Tab, ohne Anmeldung lesbar.",
      "caption": "Veröffentlichen Sie eine Seite, aktivieren Sie Seitentabs und wählen Sie die Seite für das Board aus. Die Demoseite wurde anonym geöffnet; ihre undurchsichtige URL behält noindex.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1148,
        388
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "moderate-feedback-workflow",
    "feedback-to-issue-workflow",
    "feedback-pages-and-views-workflow"
  ]
}
---

Ein Feedback-Board verbindet öffentliche Besucheranfragen mit der internen Bearbeitung im Projekt. Die folgenden Abschnitte behandeln Veröffentlichung durch den Eigentümer, Einreichen und Verfolgen durch Besucher, Moderation und Verknüpfung mit Projektarbeit durch Mitglieder sowie ausgewählte öffentliche Seiten und Ansichten.

## Ein Feedback-Board veröffentlichen {#publish-a-feedback-board}

Öffnen Sie als Projektinhaber Feedback in den Projekteinstellungen. Schließen Sie die Einrichtung ab, falls noch kein Board existiert, und aktivieren Sie dann den öffentlichen Board-Kanal. Kopieren Sie die öffentliche URL und öffnen Sie sie in einem abgemeldeten Browser, um die Besucheransicht zu prüfen. Mitglieder können die Einstellungen einsehen, aber weder die Veröffentlichung ändern noch Tokens erneuern oder das SSO-Geheimnis verwalten.

Wählen Sie, ob Besucher sich mit einem E-Mail-Code oder über das konfigurierte SSO identifizieren. Konfigurieren Sie öffentliche Kommentare, die Kategorienanzeige und ausgewählte öffentliche Seiten- oder Ansichtstabs. Prüfen Sie die sichtbaren Daten, bevor Sie die URL weitergeben. Besucher können ohne Identifikation lesen; Beiträge, Stimmen und Kommentare erfordern eine Board-Identität. Öffentliche Darstellungen zeigen weder E-Mail-Adresse noch echten Namen der Besucher. Das Team kann identifizierte Rückmeldungen dennoch intern bearbeiten.

### Veröffentlichung und Eingang trennen {#channels}

Wenn Sie das Board deaktivieren, sind seine Besucherseiten nicht mehr erreichbar. Die Server-zu-Server-Erfassung verwendet einen separaten Feedback-Integrationsschlüssel und kann ohne öffentliches Board weiterlaufen. Auch die gewählte Sichtbarkeit eines Beitrags, sein Prüfstatus und sein Spamstatus bestimmen, ob er sichtbar ist. Ein aktiviertes Board veröffentlicht allein noch nicht jeden Beitrag.

Die optionale Numo-Prüfung betrifft eingereichtes Feedback und hängt von Projekt- und Instanzeinstellungen, Anbietern und dem Budget des Inhabers ab. Ist sie aktiviert, warten Einreichungen vor der Veröffentlichung auf die Prüfung; andernfalls warten sie nicht auf eine Prüfung, die gar nicht stattfindet. Prüfen Sie die Warteschlange nach einer Demoeinreichung. Numo sendet öffentliche Antworten nur nach ausdrücklicher Aufforderung.

![Aktiviertes öffentliches Feedback-Board mit lokaler SSO-Identität und ausgeblendeter URL.](/documentation/de/publish-a-feedback-board-workflow.png)

## Feedback einreichen, abstimmen und verfolgen {#submit-and-follow-feedback}

Öffnen Sie die öffentliche Board-URL. Öffentliche Beiträge können Sie ohne minddy-Konto lesen. Zum Einreichen, Abstimmen oder Kommentieren identifizieren Sie sich über den E-Mail-Code des Boards oder den SSO-Link des Produkts. Die Zustellung des Codes hängt vom E-Mail-Dienst der Instanz ab. Ein Code gilt zehn Minuten und erlaubt fünf Versuche; warten Sie mindestens sechzig Sekunden, bevor Sie einen neuen anfordern. Geben Sie den Code niemals weiter.

Suchen Sie vor einer Einreichung nach vorhandenen Anfragen. Schreiben Sie einen konkreten Titel und beschreiben Sie den Bedarf und seinen Kontext. Titel erlauben 200 Zeichen, der Text 10.000. Die öffentliche Option ist standardmäßig ausgewählt; deaktivieren Sie sie, um die Anfrage privat an das Team zu senden. Prüfen Sie den Text vor dem Absenden auf Geheimnisse. Eine optionale Moderation kann die Anfrage zunächst zurückhalten, bevor sie öffentlich erscheint.

### Abstimmen, kommentieren und verfolgen {#follow}

Stimmen Sie für eine vorhandene Anfrage, statt sie zu duplizieren. Ihre Identität hat eine Stimme pro Beitrag. Kommentare erfordern eine Identifikation und aktivierte öffentliche Kommentare; ein öffentlicher Kommentar darf 5.000 Zeichen enthalten. Sie können Ihren eigenen Kommentar entfernen; das Team kann öffentliche Kommentare moderieren.

Öffnen Sie Mein Feedback, um Ihre Einreichungen und Stimmen im Rahmen Ihrer aktuellen Identität zu finden. Lesen Sie dort oder in der Anfrage den öffentlichen Status und die Teamantworten. Interne Teamnotizen sind keine öffentlichen Antworten. Ist das SSO abgelaufen, kehren Sie über einen neuen Produktlink zurück. Ein anderer Browser oder eine andere Identität kann Ihre persönliche Liste verändern.

![Feedback-Formular für Besucher mit Titel, Beschreibung und aktivierter öffentlicher Sichtbarkeit.](/documentation/de/submit-and-follow-feedback-workflow.png)

## Feedback privat prüfen und öffentlich antworten {#moderate-feedback}

Projektmitglieder öffnen den Feedback-Bereich des Projekts und wählen eine Anfrage aus der Prüfliste oder Übersicht. Lesen Sie den ursprünglichen Beitrag, seine öffentliche oder private Sichtbarkeit, den Prüfstatus und mögliche Moderations- oder Duplikatvorschläge. Sie können den kanonischen Titel und Text präzisieren; die ursprünglich eingereichten Texte bleiben erhalten. Weisen Sie Kategorien und einen geeigneten öffentlichen Status zu. Spam erscheint niemals auf dem öffentlichen Board. Eine private Anfrage bleibt etwas anderes als eine öffentliche Anfrage, die nur auf Prüfung wartet.

Eine optionale Übersetzung steht für das Team neben dem Ausgangstext; das öffentliche Board behält das Feedback in seiner ursprünglichen Sprache. Prüfen Sie KI-Klassifizierungen, bevor Sie sich darauf verlassen. Ist ein Beitrag mit einem Issue verknüpft, bestimmt dieses Issue seinen Status; der Status lässt sich dann nicht unabhängig ändern.

### Notizen und öffentliche Antworten {#responses}

Wählen Sie für Teamnotizen die interne Diskussion. Öffentliche Antworten sind für Besucher sichtbar; prüfen Sie die Sichtbarkeit vor dem Absenden. Antworten übernehmen die Sichtbarkeit ihres Threads. Eine interne Auswahl im Eingabefeld macht eine Antwort in einem öffentlichen Thread daher nicht privat. Öffentliche Numo-Antworten brauchen eine ausdrückliche Aufforderung; eine Numo-Erwähnung in einem öffentlichen Kommentar löst keine automatische Antwort aus.

Teammitglieder können öffentliche Kommentare zur Moderation löschen. Bearbeiten darf einen Kommentar nur sein Autor; das Team schreibt Besuchertexte niemals um. Bei internen Kommentaren gelten weiterhin die dem Autor vorbehaltenen Regeln. Öffnen Sie das Board nach einer öffentlichen Antwort oder Moderationsaktion abgemeldet, um die gewünschte Sichtbarkeit zu bestätigen.

![Feedback-Detail mit öffentlicher Teamantwort und interner Notiz.](/documentation/de/moderate-feedback-workflow.png)

## Feedback zusammenführen und mit Umsetzung verbinden {#feedback-to-issue}

Öffnen Sie als Projektmitglied die Feedback-Anfrage und wählen Sie die Zusammenführung mit einer bestehenden kanonischen Anfrage desselben Projekts. Lesen Sie zunächst beide Anliegen: Ähnliche Formulierungen beweisen noch kein gleiches Ziel. Die aktuelle Anfrage wird zum Duplikat, Stimmen werden nach Identität zusammengeführt und das Duplikat leitet zur kanonischen Anfrage weiter. Prüfen Sie das Zusammenführungsereignis in der Aktivität; die Rückgängig-Aktion verwendet dieses Ereignis. Lehnen Sie einen falschen KI-Vorschlag ab, statt ihn nur zum Leeren der Warteschlange anzunehmen.

### Arbeit erstellen oder verknüpfen {#work}

Erstellen Sie aus einer Anfrage ein neues Issue, wenn die Arbeit noch nicht erfasst ist. Prüfen Sie die Erstellungsfelder vor der Bestätigung. Ohne mitgelieferte Felder erstellt die Umwandlung standardmäßig ein Issue im Backlog. Existiert bereits ein Issue, verwenden Sie stattdessen die Verknüpfung. Ein bereits verknüpfter Beitrag kann nicht erneut umgewandelt werden. Wenn Sie die Verknüpfung entfernen, bleibt der letzte öffentliche Status erhalten, und die Beziehung zum Issue endet.

Der verknüpfte Status folgt dem Issue: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Wird die Arbeit zurück ins Backlog verschoben, wird auch der Feedback-Status wieder geöffnet. Prüfen Sie nach einer Statusänderung das verknüpfte Issue und die Anfrage im abgemeldeten Browser.

Teambenachrichtigungen bei neuem Feedback hängen von dessen Quelle und Prüfstatuswechsel ab. Versprechen Sie einem Abstimmenden keine automatische E-Mail zu jeder Zusammenführung oder Issue-Aktualisierung. Öffentlicher Status und Antworten stehen in Mein Feedback. Eine Verknüpfung macht den Fortschritt sichtbar, ohne das private Issue selbst offenzulegen.

![Feedback mit einem neu erstellten verknüpften Issue und dem Status Geplant.](/documentation/de/feedback-to-issue-workflow.png)

## Öffentliche Seiten und Ansichten zum Board hinzufügen {#feedback-pages-and-views}

Veröffentlichen Sie als Projektinhaber zunächst die gewünschte Projektseite oder teilen Sie die gewünschte Ansicht mit öffentlicher Sichtbarkeit. Prüfen Sie den Inhalt auf private Informationen. Öffnen Sie die Feedback-Einstellungen, aktivieren Sie die Seiten- oder Ansichtsfamilie und wählen Sie jedes anzuzeigende Element aus. Sowohl der Familienschalter als auch die Auswahl jedes Elements sind erforderlich.

Die Einstellungsliste kann geschützte Freigaben enthalten; die öffentliche Navigation zeigt jedoch nur Freigaben auf öffentlicher Ebene. Die Auswahl einer geschützten Seite umgeht weder deren Schutz noch zeigt sie deren Namen in einem Board-Tab. Ein veröffentlichtes Element aus einem anderen Projekt gehört nicht zur Tabliste dieses Projekts.

### Prüfen und Zugriff entfernen {#visibility}

Öffnen Sie das Board abgemeldet. Folgen Sie den Tabs zu den ausgewählten Ansichten und Seiten und prüfen Sie Titel und Inhalte. Wenn sie konfiguriert ist, wird die Navigation gemeinsam für Board, öffentliche Ansichten und öffentliche Seiten verwendet. Ein einzelner Tab erscheint nicht als Navigation.

Entfernen Sie einen Tab, indem Sie das Element abwählen oder seine Familie deaktivieren. Dadurch verschwindet die Navigation, nicht die eigentliche Freigabe. Widerrufen oder ändern Sie die Freigabe selbst, um den Zugriff über den direkten Link zu beenden. Die Deaktivierung des Boards deaktiviert auch seine gekoppelte Navigation, widerruft aber nicht jede Seiten- oder Ansichtsfreigabe einzeln. Prüfen Sie nach einer Veröffentlichungsänderung sowohl den Board-Tab als auch die ursprüngliche Freigabe-URL.

![Veröffentlichter Feedback-Leitfaden als ausgewählter Board-Tab, ohne Anmeldung lesbar.](/documentation/de/feedback-pages-and-views-workflow.png)
