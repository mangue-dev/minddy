---
{
  "id": "projects",
  "locale": "de",
  "title": "Projekte und Mitglieder",
  "summary": "Richte ein Projekt ein, lade andere Personen ein, wähle ihre Rollen und übertrage das Eigentum.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 20,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-31",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/use-offered-projects.ts",
      "components/global-board.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/server/cycles.ts",
      "lib/server/hidden-projects.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "lib/server/categories.ts",
      "components/settings/project-settings-page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/members-api.ts",
      "lib/server/collaborators.ts",
      "lib/collaborator-search.ts",
      "components/collaborator-suggestions.tsx",
      "app/api/me/collaborators/route.ts",
      "components/ui/confirm-delete-dialog.tsx",
      "components/stats/project-statistics.tsx",
      "components/stats/issue-graph.tsx",
      "lib/project-stats.ts",
      "lib/issue-graph-layout.ts",
      "app/api/projects/[id]/pull-request-stats/route.ts"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:claude (MIN-879: issue graph hover cards and neighbour identifiers checked against components/stats/issue-graph.tsx; existing figures unaffected and kept; no capture taken)",
    "language": "agent:claude (de sentences translated from en revision 18 with the glossary register; agent self-review, not human acceptance)",
    "date": "2026-10-31"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Ein Projekt einrichten",
    "Personen zu einem Projekt einladen"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-general.png",
      "alt": "Projektkopf mit Symbol und Bearbeitungssymbol, Name, Schlüssel sowie den Kennzahlen Tickets, Mitglieder, Ziele, Kategorien und Erstellt.",
      "caption": "Wähle Symbol, Namen oder Schlüssel, um sie direkt zu ändern; das Verschieben in den Papierkorb bleibt eine eigene Aktion weiter unten.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        359
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-members.png",
      "alt": "Karte „Personen einladen“ über der Karte Mitglieder mit drei Demo-Mitgliedern, der Eigentümer ist gekennzeichnet.",
      "caption": "Lade Mitglieder über ihre Konto-E-Mail ein und prüfe den Eigentümer, bevor du einen Zugang entfernst.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        430
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-statistics.png",
      "alt": "Abschnitte Dynamik, Aktueller Stand und Mitwirkende eines Projekts mit rund tausend Tickets: wöchentliche Balken für erstellte und erledigte Tickets, ein Statusbalken, Kennzahlen und ein Statusbalken pro Person.",
      "caption": "Die Dynamik vergleicht die letzten vier Wochen mit den vier davor; überfällige und stockende Tickets zeigen, wo du hinschauen solltest.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-31",
      "viewport": [
        816,
        912
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-issue-graph",
      "kind": "screenshot",
      "src": "/documentation/de/project-issue-graph.png",
      "alt": "Ticket-Graph der offenen Tickets, in farbigen Blasen pro Ziel um quadratische Anker gruppiert, mit grauen Pfeilen vom übergeordneten Ticket zum Unterticket, roten Blockierpfeilen, gestrichelten Verwandt-Linien, grauen Verbindungslinien zwischen Zielen, der Legende und dem Schalter Abgeschlossene Tickets und Ziele einbeziehen.",
      "caption": "Fahre über einen Punkt, um sein Ticket zu lesen und seine Verknüpfungen hervorzuheben; wähle ihn aus, um das Ticket im Seitenbereich zu öffnen.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-31",
      "viewport": [
        816,
        784
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps",
    "project-statistics-steps",
    "project-issue-graph"
  ]
}
---

Ein Projekt verbindet Tickets, Ziele, Seiten und die Personen, die daran arbeiten. Sein einziger Eigentümer verwaltet Einstellungen, Einladungen und Rollen. Mitglieder bearbeiten Inhalte, Leser verfolgen sie; beide können das Projekt verlassen. Wähle den passenden Abschnitt, um das Projekt einzurichten, festzulegen, wer was tun darf, das Eigentum zu übertragen oder ein Einladungsproblem zu lösen.

## Ein Projekt einrichten {#project-settings}

Öffne das Projekt und anschließend seine Einstellungen. Administrative Einstellungen unterliegen der Projekteigentümerschaft. Mitglieder und Leser können den allgemeinen Bereich ansehen, das Projekt für sich ausblenden und es verlassen, erhalten aber nicht die Bearbeitungsfunktionen des Eigentümers.

Der Tab **Allgemein** beginnt mit der Identität des Projekts: seinem Symbol, seinem Namen und Schlüssel und darunter fünf Kennzahlen: **Tickets**, **Mitglieder**, **Ziele**, **Kategorien** und **Erstellt**. Als Eigentümer änderst du Symbol, Name und Schlüssel direkt dort, wo sie angezeigt werden; eine Speichern-Schaltfläche gibt es nicht mehr. Wähle das Symbol und dann **Neue Kugel** (nur angeboten, solange kein Bild die Kugel verdeckt), **Bild hochladen**, **Von einer Website importieren…**, das nach der Adresse der Website fragt und ihr Symbol übernimmt, sobald du **Importieren** wählst, oder, wenn ein Bild gesetzt ist, **Bild entfernen**, das zuerst nachfragt, weil das Bild gelöscht wird. Wähle den Namen oder den Schlüssel, um ihn zu bearbeiten: Am Computer wird daraus ein Feld, in dem Enter oder das Verlassen des Felds speichert und Escape abbricht; auf dem Telefon öffnet sich ein Blatt mit **Speichern**. Der Name darf nicht leer sein. Der Schlüssel wird in Großbuchstaben umgewandelt und muss aus 2 bis 5 Buchstaben (A–Z) bestehen; andernfalls erscheint ein Fehler und der Schlüssel wird nicht gespeichert. Prüfe nach einer Änderung die entstandenen Kennungen. Das Symbol unterscheidet das Projekt nur in der Navigation; die Mitgliedschaft ändert es nicht. Mitglieder und Leser sehen denselben Kopfbereich ohne diese Bedienelemente.

Unter der Kopfzeile folgen die Statistiken des Projekts, berechnet aus seinen eigenen Daten und für alle im Projekt sichtbar. **Dynamik** vergleicht die in den letzten vier Wochen erledigten Tickets mit den vier Wochen davor, zeigt, ob der Backlog in diesem Zeitraum gewachsen oder geschrumpft ist, und nennt die mediane Durchlaufzeit von der Erstellung bis **Erledigt** in den letzten 90 Tagen; das Diagramm zeigt die pro Woche erstellten und erledigten Tickets über zwölf Wochen. **Aktueller Stand** teilt alle Tickets nach Status auf und zählt die offenen Tickets, die überfällig, nicht zugewiesen oder stockend sind, also in Bearbeitung oder in Prüfung und seit 14 Tagen ohne Änderung. Sind Pull Requests mit den Tickets des Projekts verknüpft, zeigt **Pull Requests**, wie viele zusammengeführt wurden, die mediane Zeit bis zur Zusammenführung, den Anteil der erledigten Tickets, die über einen zusammengeführten Pull Request geliefert wurden, und die Zusammenführungen pro Woche. **Mitwirkende** listet, wer in den letzten 90 Tagen die meisten Tickets erledigt hat, und teilt die Tickets jeder Person nach Status auf: offene im aktuellen Stand, abgeschlossene aus diesen 90 Tagen. **Ticket-Graph** zeichnet die offenen Tickets, die über eine Beziehung oder ein übergeordnetes Ticket verknüpft sind, nach Status eingefärbt, mit Pfeilen vom übergeordneten Ticket zum Unterticket und vom blockierenden zum blockierten Ticket. Die Tickets sammeln sich in einer farbigen Blase pro Ziel, um ein Quadrat, das für das Ziel steht und seine eigenen Beziehungen trägt; eine graue Linie zwischen zwei Zielen fasst die Verknüpfungen zwischen ihren Tickets zusammen, die erscheinen, wenn du mit der Maus über eines davon fährst. Bei sehr vielen Tickets bleiben die am stärksten vernetzten jedes Ziels, und die Blase zeigt, wie viele ausgeblendet sind. Wähle ein Ticket aus, um es im Seitenbereich zu öffnen, oder das Quadrat eines Ziels, um das Ziel zu öffnen; **Abgeschlossene Tickets und Ziele einbeziehen** fügt erledigte Arbeit hinzu. Bewege den Mauszeiger auf ein Ticket, um seine vollständige Karte und die Kennungen der verknüpften Tickets zu sehen, oder auf das Quadrat eines Ziels, um die Karte des Ziels zu sehen. Abgebrochene Tickets und Duplikate zählen nie als erledigt. Fahre mit der Maus über einen Balken oder fokussiere ihn, um seine genauen Werte zu lesen. Numo und Minddy-MCP-Clients lesen dieselben Zahlen, mit den überfälligen und stockenden Tickets selbst.

![Abschnitte Dynamik, Aktueller Stand und Mitwirkende eines Projekts mit rund tausend Tickets: wöchentliche Balken für erstellte und erledigte Tickets, ein Statusbalken, Kennzahlen und ein Statusbalken pro Person.](/documentation/de/project-statistics.png)

![Ticket-Graph der offenen Tickets, in farbigen Blasen pro Ziel um quadratische Anker gruppiert, mit grauen Pfeilen vom übergeordneten Ticket zum Unterticket, roten Blockierpfeilen, gestrichelten Verwandt-Linien, grauen Verbindungslinien zwischen Zielen, der Legende und dem Schalter Abgeschlossene Tickets und Ziele einbeziehen.](/documentation/de/project-issue-graph.png)

Die weiteren Tabs sind **Kategorien**, **Mitglieder**, **Wiederholungen**, **Smart Assign**, **Feedback**, **Git**, **Importieren** und **Integrationen**. Lies die jeweilige Aufgabenanleitung, bevor du einen Anbieter oder automatische Arbeit aktivierst. Kontoeinstellungen wie deine Oberflächensprache sind von der Projektkonfiguration getrennt.

Unter **Kategorien** verwalten der Eigentümer und die Mitglieder die Kategorien, mit denen Tickets eingeordnet werden. Wähle **Neue Kategorie** in der Titelzeile der Karte: Oben in der Liste erscheint eine Zeile mit einem Farbpunkt und einem Namensfeld. Drücke Enter oder wähle **Hinzufügen**, um die Kategorie anzulegen; Escape schließt die Zeile, ohne sie anzulegen. Wähle den Farbpunkt einer Kategorie, um die Liste der Farben zu öffnen, in der du den Namen einer Farbe eintippen kannst, um sie zu finden; die gewählte Farbe gilt sofort (auf dem Telefon öffnet sich die Liste in einem Blatt), oder wähle ihren Namen, um sie direkt umzubenennen. Die Löschschaltfläche fragt nach einer Bestätigung und entfernt die Kategorie dann aus allen Tickets. Sobald das Projekt mindestens zwei Kategorien hat, trägt jede Zeile links einen Ziehgriff: Ziehe ihn, um die Kategorie nach oben oder unten zu verschieben. Mit der Tastatur setzt du den Fokus auf den Griff, drückst die Leertaste, verschiebst die Kategorie mit den Pfeiltasten nach oben und unten und drückst erneut die Leertaste, um sie abzulegen; Escape bricht ab. Diese Reihenfolge zeigen alle Kategoriemenüs und -filter für alle im Projekt. Numo und Minddy-MCP-Clients können sie ebenfalls lesen und ändern, etwa wenn du Numo bittest, eine Kategorie an den Anfang zu stellen.


![Projektkopf mit Symbol und Bearbeitungssymbol, Name, Schlüssel sowie den Kennzahlen Tickets, Mitglieder, Ziele, Kategorien und Erstellt.](/documentation/de/project-general.png)

### Ein Projekt für dich ausblenden {#hide-project}

Blende ein Projekt aus, das du nicht mehr täglich verfolgst, damit es aus deiner Seitenleiste und deiner Startseite verschwindet, ohne dass du es verlässt. Wähle in den allgemeinen Projekteinstellungen in der **Gefahrenzone** die Option **Ausblenden**, oder klicke das Projekt in der Seitenleiste mit der rechten Maustaste an und wähle **Projekt ausblenden** und bestätige. In beiden Fällen fragt zuerst ein Dialog mit dem Projektnamen nach, weil das Projekt aus deiner Navigation verschwindet; das Wiedereinblenden braucht keine Bestätigung. Alle Personen im Projekt können es ausblenden, auch der Eigentümer und Leser.

Das Ausblenden ändert nur deine eigene Navigation. Außerhalb des Projekts selbst bietet Minddy weder das Projekt noch seine Tickets, Ziele und Seiten mehr an, wo du etwas auswählst: in der Befehlspalette, in den Erwähnungsvorschlägen nach @, im Numo-Kontext und bei der Projektwahl beim Erstellen eines Tickets, Ziels oder einer Routine. Bereits geschriebene Erwähnungen und Links zeigen weiterhin ihren Namen und lassen sich öffnen. Seine Tickets verschwinden außerdem aus der Ansicht **Alle Tickets** und ihren Filtern, aus dem CSV-Export aller deiner Projekte und aus dem automatischen Befüllen deines Zyklus; wählst du das Projekt im Export ausdrücklich aus, wird es weiterhin exportiert. Die Einstellung wird in deinem Konto gespeichert und gilt daher auch nach einer erneuten Anmeldung und auf deinen anderen Geräten. Du behältst deinen Zugriff und kannst das Projekt weiterhin über einen direkten Link oder über den Tab **Ausgeblendete Projekte** der **Kontoeinstellungen** öffnen und bearbeiten. Andere Mitglieder sehen das Projekt weiterhin, und seine Routinen, Integrationen und Benachrichtigungen laufen weiter. Das Öffnen eines ausgeblendeten Projekts bringt es nicht in deine Seitenleiste zurück.

Um es wieder anzuzeigen, wähle **Einblenden** unter **Ausgeblendete Projekte** oder in den allgemeinen Projekteinstellungen, oder wähle **Projekt einblenden** im Menü der Seitenleiste. Kann die Änderung nicht gespeichert werden, erscheint ein Fehler und das Projekt kehrt in seinen vorherigen Zustand zurück; versuche es erneut. Anders als Verlassen oder In den Papierkorb verschieben entfernt das Ausblenden nie Zugriff oder Inhalte.

### Verlassen und löschen {#project-removal}

Ein Mitglied oder Leser kann in der Gefahrenzone **Verlassen** wählen und damit seinen eigenen Zugriff entfernen; zuerst fragt ein Dialog mit dem Projektnamen nach. Bitte den Eigentümer um eine erneute Einladung, wenn du später wieder Zugriff brauchst. Das Verlassen löscht das Projekt nicht für alle. Der Eigentümer kann das Projekt nicht verlassen: [Übertrage das Eigentum](#transfer-ownership) zuerst an ein Mitglied.

Das Entfernen eines Projekts ist eine Eigentümeraktion: Wähle in der Gefahrenzone **In den Papierkorb verschieben** neben **Projekt in den Papierkorb verschieben**. Die Bestätigung nennt das Projekt und sagt, dass seine Tickets, Ziele und Feedbacks mit verschoben werden; das Projekt bleibt 30 Tage lang im [Papierkorb](/de/dokumentation/trash-and-recovery) wiederherstellbar, und sein Schlüssel wird sofort frei. Lies die Bestätigung, bevor du die Aktion ausführst, besonders wenn das Projekt Tickets, Seiten, Dateien oder Integrationen enthält. Schlägt ein normales Speichern fehl, bewahre die gewünschten Werte auf, lies die Fehlermeldung und aktualisiere das Projekt vor einem neuen Versuch. Sende eine destruktive Aktion nicht wiederholt ab, solange ihr erstes Ergebnis unklar ist.

Der Eigentümer kann das Projekt auch in der Seitenleiste mit der rechten Maustaste anklicken und **In den Papierkorb verschieben** wählen. Es erscheint dieselbe Bestätigung, und nur das angeklickte Projekt ist betroffen.

## Personen zu einem Projekt einladen {#project-members}

Der Projekteigentümer verwaltet die Mitgliedschaft unter **Projekteinstellungen** → **Mitglieder**. Suche in der Karte **Personen einladen** nach einem Namen oder gib die E-Mail-Adresse ein, die die Person auf dieser Instanz verwendet. Beim Tippen schlägt **Aus deinen Projekten** Personen vor, die bereits einem deiner anderen Projekte beigetreten sind, als Eigentümer, Mitglied oder Leser, und eine bestätigte E-Mail-Adresse haben; wer nur eingeladen wurde, wird nie vorgeschlagen, ebenso wenig aktuelle Mitglieder und ausstehende Einladungen. Wähle eine Person, um sie mit Avatar und Namen ins Feld zu übernehmen, oder drücke Enter, wenn der Name nur auf eine Person passt. Alle anderen werden per E-Mail eingeladen. Wähle dann ihre Rolle und **Einladen**. Eine aus deinen Projekten gewählte Person wird über ihr Konto eingeladen: Minddy prüft erneut, dass sie einem deiner Projekte beigetreten ist, und lehnt sonst mit „Diese Person gehört zu keinem deiner Projekte.“ ab. Die Einladung steht in der Karte **Ausstehende Einladungen**, bis sie angenommen wird; die aktuellen Mitglieder stehen in der Karte **Mitglieder**, deren Titel ihre Anzahl zeigt. Wähle **Mitglied** für jemanden, der am Projekt arbeitet, oder **Leser** für jemanden, der es nur verfolgt. Aktiviere bei einem Leser **Darf kommentieren**, wenn er sich an Diskussionen beteiligen soll. Solange die Einladung aussteht, kann der Eigentümer ihre Rolle und die Kommentaroption ändern. Dieselbe E-Mail-Adresse auf einer anderen Instanz gewährt hier keinen Zugriff.

Die eingeladene Person meldet sich mit diesem Konto an und öffnet den Posteingang. Nimm die ausstehende Einladung an, um mit der darin festgelegten Rolle beizutreten, oder lehne sie ab, wenn das Projekt unerwartet ist. Der Beitrittsdialog beim ersten Einstieg hilft, deine E-Mail-Adresse an den Eigentümer weiterzugeben; ohne Einladung kannst du damit keinem Projekt beitreten.

Du kannst Personen auch schon beim Erstellen des Projekts einladen. Suche im Schritt **Lade dein Team ein** des Assistenten nach einem Namen oder gib eine E-Mail-Adresse ein. Unter dem Feld schlägt **Aus deinen Projekten** dieselben Personen vor wie die Karte **Personen einladen**, schon bevor du tippst, und filtert beim Tippen. Wähle eine Person aus oder drücke Enter, wenn nur eine passt; gibst du die Adresse einer solchen Person ein, wird sie ebenfalls mit ihrem Namen hinzugefügt. Alle anderen fügst du per E-Mail mit **Hinzufügen** oder Enter hinzu. Das Gästelimit deines Plans gilt wie hier, und die Liste wird mit dem Projektentwurf gespeichert, falls du die Erstellung später fortsetzt.

Verschickt wird nichts, bevor du **Fertig stellen** wählst: Zuerst wird das Projekt erstellt, dann erhält jede Person eine Einladung mit der Rolle **Mitglied**. Aus deinen Projekten gewählte Personen werden über ihr Konto eingeladen: Minddy prüft erneut, dass sie einem deiner Projekte beigetreten sind, und verwendet ihre bestätigte Adresse. Die übrigen werden per E-Mail eingeladen. Diese Einladungen stehen in der Karte **Ausstehende Einladungen**, wo du ihre Rolle ändern kannst, und werden wie alle anderen im Posteingang angenommen. Werden einige abgelehnt, etwa wegen des Gästelimits des Plans oder weil jemand das gemeinsame Projekt inzwischen verlassen hat („Diese Person gehört zu keinem deiner Projekte.“), gehen die übrigen trotzdem hinaus, und eine Benachrichtigung nennt jede nicht eingeladene Person mit dem Grund. Prüfe die Karte **Ausstehende Einladungen**, bevor du sie erneut einlädst. Eine ausstehende Einladung ist gespeichert; das beweist nicht, dass ihre E-Mail zugestellt wurde.


![Karte „Personen einladen“ über der Karte Mitglieder mit drei Demo-Mitgliedern, der Eigentümer ist gekennzeichnet.](/documentation/de/project-members.png)

### Rollen Eigentümer, Mitglied und Leser {#member-permissions}

| Rolle | Projektzugriff |
| --- | --- |
| Eigentümer | Genau einer pro Projekt. Alles, was ein Mitglied tun kann, dazu Projekteinstellungen, Einladungen und Rollen, Integrationen, die Git-Verknüpfung, Routinen, die Übertragung des Eigentums und das Löschen des Projekts. |
| Mitglied | Die gesamte Arbeit an Inhalten: Tickets, Pläne, Ziele, Feedback, Seiten und Datenbanken, Kommentare, Dateien, geteilte Ansichten und Veröffentlichungslinks, Git- und Pull-Request-Aktionen, Numo und MCP. Kann das Projekt verlassen. |
| Leser | Liest die Inhalte, Mitglieder und Routinen des Projekts. Kann das Projekt ausblenden, unter den Betrachtern einer Seite erscheinen, persönliche Ansichten und Benachrichtigungen nutzen und das Projekt verlassen. Kann keine Inhalte bearbeiten, keine Zuweisungen erhalten, kein Ziel verantworten und keine Links veröffentlichen; sieht weder Integrationen noch Freigabe- und Board-Tokens. |
| Leser mit **Darf kommentieren** | Lesezugriff sowie Kommentare zu Tickets, Zielen, internen Feedback-Threads und Seiten: Antworten, Erwähnungen, Dateien an eigenen Kommentaren sowie das Bearbeiten und Löschen eigener Kommentare. Öffentliche Antworten auf dem Feedback-Board sowie Kommentare oder Reaktionen in Pull Requests bleiben nicht verfügbar. |
| Besucher über einen öffentlichen Link | Nur die ausdrücklich über diesen Link veröffentlichten Inhalte; keine Projektmitgliedschaft. |

Leser zählen wie Mitglieder zum Limit des Plans für Gäste pro Projekt, ebenso ausstehende Einladungen. Eine Abrechnung pro Platz gibt es nicht.

Prüfe die Mitgliederliste, bevor du jemanden entfernst. Die Eigentümerzeile bietet keine Entfernung an; nur eine [Übertragung](#transfer-ownership) ändert den Eigentümer. Der Eigentümer kann eine ausstehende Einladung vor ihrer Annahme zurückziehen, nachdem er in einem Dialog mit der eingeladenen Adresse bestätigt hat; der Link in der E-Mail funktioniert dann nicht mehr, und die Person kann später erneut eingeladen werden. Der ausstehende Zustand verrät nicht, ob diese Adresse bereits ein Konto hat. Das Entfernen beendet den Zugriff über die Mitgliedschaft; bereits empfangene Exporte, Bildschirmaufnahmen oder Kopien lassen sich damit nicht zurückholen. Persönliche Git-, KI- und MCP-Zugangsdaten gehören weiterhin zum Konto und werden durch einen Eigentümerwechsel nicht übertragen.

### Die Rolle eines Mitglieds ändern {#change-role}

Öffne als Eigentümer **Projekteinstellungen** → **Mitglieder** und wähle die neue Rolle der Person: **Mitglied** oder **Leser**. Lege bei einem Leser fest, ob **Darf kommentieren** aktiviert ist. Diese Option ist standardmäßig deaktiviert und wird jedes Mal ausgeschaltet, wenn jemand zum Leser wird. Prüfe sie daher, nachdem du ein Mitglied zum Leser gemacht hast. Deine eigene Rolle als Eigentümer ändert sich nur durch eine Übertragung.

Wird ein Mitglied zum Leser, verliert es außerdem die Zuweisung seiner offenen Tickets und die Verantwortung für seine Ziele; diese Tickets verschwinden damit aus seinem persönlichen Zyklus. Weise diese Arbeit neu zu, wenn sie weitergehen soll.

Eine Rollenänderung gilt ab der nächsten Anfrage der Person, in der Anwendung, in Numo und über MCP. Bereits geladene oder heruntergeladene Inhalte werden nicht zurückgeholt, und ein bereits geöffneter signierter Dateilink kann noch einige Minuten gültig bleiben.

### Fehlenden Zugriff klären {#invitation-recovery}

Fehlt eine Einladung, vergleiche die eingeladene E-Mail-Adresse mit dem angemeldeten Konto und prüfe die Instanz-URL. Bitte den Eigentümer, ausstehende Einladungen zu prüfen, statt wiederholt Konten anzulegen. Ändert sich deine Rolle während einer geöffneten Sitzung, lade das Ziel neu und prüfe deine Rolle, bevor du Schreibaktionen wiederholst. Ein Leser, der Inhalte bearbeiten muss, bittet den Eigentümer, seine Rolle auf Mitglied zu ändern. Nutze nicht die Sitzung einer anderen Person, um einen Zugriffsfehler zu umgehen.

## Eigentum übertragen {#transfer-ownership}

Ein Projekt hat genau einen Eigentümer. Um es abzugeben, öffne als Eigentümer **Projekteinstellungen** → **Mitglieder**, wähle bei einem bestehenden Mitglied **Projekteigentum übertragen** und bestätige. Nur ein Mitglied kann das Eigentum erhalten; lade die Person zuerst ein oder ändere die Rolle eines Lesers auf Mitglied. Nach der Übertragung bleibst du als Mitglied im Projekt.

### Was mit dem Eigentum übergeht {#transfer-effects}

- Deine Routinen in diesem Projekt werden pausiert und können keine neue Arbeit starten. Der neue Eigentümer legt die Routinen an, die mit seinem eigenen Budget weiterlaufen sollen.
- Die Planlimits für Tickets und Gäste pro Projekt, der Speicher und Hintergrund-KI wie Smart Assign und die Feedback-Prüfung richten sich nun nach Plan und Budget des neuen Eigentümers. Bestehende Tickets und Mitglieder bleiben erhalten.
- Abonnements, Zahlungsmethoden sowie persönliche Schlüssel und Verbindungen bleiben beim jeweiligen Konto.
- Ausstehende Einladungen bleiben gültig.

Die Übertragung schlägt fehl, ohne etwas zu ändern, wenn der Speicher des neuen Eigentümers die Dateien des Projekts nicht aufnehmen kann oder wenn er bereits ein Projekt mit demselben Schlüssel besitzt. Gib Speicher frei oder ändere den Projektschlüssel und versuche es dann erneut.
