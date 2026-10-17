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
  "revision": 10,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-693 project roles",
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
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root with agent:/root/review_de_es (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; de translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/review_de_es with agent:/root (de pre-merge wording, correction and retained-meaning review); agent:/root (de translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root/min693_de with agent:/root (de MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "alt": "Allgemeine Projekteinstellungen mit Name, Schlüssel, Symbol und eigener Papierkorbaktion.",
      "caption": "Prüfe Namen und Schlüssel vor dem Speichern. Das Verschieben in den Papierkorb ist eine eigene Aktion.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        563
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/de/project-members.png",
      "alt": "E-Mail-Einladung und drei Demomitglieder mit Kennzeichnung des Eigentümers.",
      "caption": "Lade Mitglieder über ihre Konto-E-Mail ein und prüfe den Eigentümer, bevor du einen Zugang entfernst.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        503
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Ein Projekt verbindet Probleme, Ziele, Seiten und die Personen, die daran arbeiten. Sein einziger Eigentümer verwaltet Einstellungen, Einladungen und Rollen. Mitglieder bearbeiten Inhalte, Leser verfolgen sie; beide können das Projekt verlassen. Wähle den passenden Abschnitt, um das Projekt einzurichten, festzulegen, wer was tun darf, das Eigentum zu übertragen oder ein Einladungsproblem zu lösen.

## Ein Projekt einrichten {#project-settings}

Öffne das Projekt und anschließend seine Einstellungen. Administrative Einstellungen unterliegen der Projekteigentümerschaft. Mitglieder und Leser können den allgemeinen Bereich ansehen, das Projekt für sich ausblenden und es verlassen, erhalten aber nicht die Bearbeitungsfunktionen des Eigentümers.

Gib als Eigentümer einen nicht leeren Namen und einen gültigen Projektschlüssel ein und speichere. Der Schlüssel wird in Großbuchstaben umgewandelt und besteht aus 2 bis 5 ASCII-Buchstaben. Prüfe nach einer Änderung die entstandenen Kennungen. Verwende Symbol- und Darstellungsfunktionen, um das Projekt in der Navigation zu unterscheiden; diese visuellen Entscheidungen verändern die Mitgliedschaft nicht.

Weitere Bereiche verwalten Mitwirkende, wiederkehrende Probleme, Git, Import, Integrationen, Automatisierung und Feedback. Lies die jeweilige Aufgabenanleitung, bevor du einen Anbieter oder automatische Arbeit aktivierst. Kontoeinstellungen wie deine Oberflächensprache sind von der Projektkonfiguration getrennt.


![Allgemeine Projekteinstellungen mit Name, Schlüssel, Symbol und eigener Papierkorbaktion.](/documentation/de/project-general.png)

### Ein Projekt für dich ausblenden {#hide-project}

Blende ein Projekt aus, das du nicht mehr täglich verfolgst, damit es aus deiner Seitenleiste und deiner Startseite verschwindet, ohne dass du es verlässt. Wähle in den allgemeinen Projekteinstellungen unter **Sichtbarkeit für dich** die Option **Ausblenden**, oder klicke das Projekt in der Seitenleiste mit der rechten Maustaste an und wähle **Projekt ausblenden**. Alle Personen im Projekt können es ausblenden, auch der Eigentümer und Leser.

Das Ausblenden ändert nur deine eigene Navigation. Die Einstellung wird in deinem Konto gespeichert und gilt daher auch nach einer erneuten Anmeldung und auf deinen anderen Geräten. Du behältst deinen Zugriff und kannst das Projekt weiterhin über einen direkten Link oder über **Kontoeinstellungen** → **Einstellungen** → **Ausgeblendete Projekte** öffnen und bearbeiten. Andere Mitglieder sehen das Projekt weiterhin, und seine Routinen, Integrationen und Benachrichtigungen laufen weiter. Das Öffnen eines ausgeblendeten Projekts bringt es nicht in deine Seitenleiste zurück.

Um es wieder anzuzeigen, wähle **Einblenden** unter **Ausgeblendete Projekte** oder in den allgemeinen Projekteinstellungen, oder wähle **Projekt einblenden** im Menü der Seitenleiste. Kann die Änderung nicht gespeichert werden, erscheint ein Fehler und das Projekt kehrt in seinen vorherigen Zustand zurück; versuche es erneut. Anders als Verlassen oder In den Papierkorb verschieben entfernt das Ausblenden nie Zugriff oder Inhalte.

### Verlassen und löschen {#project-removal}

Ein Mitglied oder Leser kann das Projekt über die entsprechende Aktion verlassen und damit seinen eigenen Zugriff entfernen. Bitte den Eigentümer um eine erneute Einladung, wenn du später wieder Zugriff brauchst. Das Verlassen löscht das Projekt nicht für alle. Der Eigentümer kann das Projekt nicht verlassen: [Übertrage das Eigentum](#transfer-ownership) zuerst an ein Mitglied.

Das Löschen eines Projekts ist eine Eigentümeraktion im Gefahrenbereich. Lies die Folgen und die Bestätigung, bevor du sie ausführst, besonders wenn das Projekt Probleme, Seiten, Dateien oder Integrationen enthält. Schlägt ein normales Speichern fehl, bewahre die gewünschten Werte auf, lies die Fehlermeldung und aktualisiere das Projekt vor einem neuen Versuch. Sende eine destruktive Aktion nicht wiederholt ab, solange ihr erstes Ergebnis unklar ist.

Der Eigentümer kann das Projekt auch in der Seitenleiste mit der rechten Maustaste anklicken und **In den Papierkorb verschieben** wählen. Es erscheint dieselbe Bestätigung, und nur das angeklickte Projekt ist betroffen.

## Personen zu einem Projekt einladen {#project-members}

Der Projekteigentümer verwaltet die Mitgliedschaft unter **Projekteinstellungen** → **Mitglieder**. Frage die mitwirkende Person nach ihrer E-Mail-Adresse auf dieser Instanz, wähle ihre Rolle, sende die Einladung und prüfe, ob sie als ausstehend angezeigt wird. Wähle **Mitglied** für jemanden, der am Projekt arbeitet, oder **Leser** für jemanden, der es nur verfolgt. Aktiviere bei einem Leser **Darf kommentieren**, wenn er sich an Diskussionen beteiligen soll. Solange die Einladung aussteht, kann der Eigentümer ihre Rolle und die Kommentaroption ändern. Dieselbe E-Mail-Adresse auf einer anderen Instanz gewährt hier keinen Zugriff.

Die eingeladene Person meldet sich mit diesem Konto an und öffnet den Posteingang. Nimm die ausstehende Einladung an, um mit der darin festgelegten Rolle beizutreten, oder lehne sie ab, wenn das Projekt unerwartet ist. Der Beitrittsdialog beim ersten Einstieg hilft, deine E-Mail-Adresse an den Eigentümer weiterzugeben; ohne Einladung kannst du damit keinem Projekt beitreten.


![E-Mail-Einladung und drei Demomitglieder mit Kennzeichnung des Eigentümers.](/documentation/de/project-members.png)

### Rollen Eigentümer, Mitglied und Leser {#member-permissions}

| Rolle | Projektzugriff |
| --- | --- |
| Eigentümer | Genau einer pro Projekt. Alles, was ein Mitglied tun kann, dazu Projekteinstellungen, Einladungen und Rollen, Integrationen, die Git-Verknüpfung, Routinen, die Übertragung des Eigentums und das Löschen des Projekts. |
| Mitglied | Die gesamte Arbeit an Inhalten: Probleme, Pläne, Ziele, Feedback, Seiten und Datenbanken, Kommentare, Dateien, geteilte Ansichten und Veröffentlichungslinks, Git- und Pull-Request-Aktionen, Numo und MCP. Kann das Projekt verlassen. |
| Leser | Liest die Inhalte, Mitglieder und Routinen des Projekts. Kann das Projekt ausblenden, unter den Betrachtern einer Seite erscheinen, persönliche Ansichten und Benachrichtigungen nutzen und das Projekt verlassen. Kann keine Inhalte bearbeiten, keine Zuweisungen erhalten, kein Ziel verantworten und keine Links veröffentlichen; sieht weder Integrationen noch Freigabe- und Board-Tokens. |
| Leser mit **Darf kommentieren** | Lesezugriff sowie Kommentare zu Problemen, Zielen, internen Feedback-Threads und Seiten: Antworten, Erwähnungen, Dateien an eigenen Kommentaren sowie das Bearbeiten und Löschen eigener Kommentare. Öffentliche Antworten auf dem Feedback-Board sowie Kommentare oder Reaktionen in Pull Requests bleiben nicht verfügbar. |
| Besucher über einen öffentlichen Link | Nur die ausdrücklich über diesen Link veröffentlichten Inhalte; keine Projektmitgliedschaft. |

Leser zählen wie Mitglieder zum Limit des Tarifs für Gäste pro Projekt, ebenso ausstehende Einladungen. Eine Abrechnung pro Platz gibt es nicht.

Prüfe die Mitgliederliste, bevor du jemanden entfernst. Die Eigentümerzeile bietet keine Entfernung an; nur eine [Übertragung](#transfer-ownership) ändert den Eigentümer. Der Eigentümer kann eine ausstehende Einladung vor ihrer Annahme widerrufen; der ausstehende Zustand verrät nicht, ob diese Adresse bereits ein Konto hat. Das Entfernen beendet den Zugriff über die Mitgliedschaft; bereits empfangene Exporte, Bildschirmaufnahmen oder Kopien lassen sich damit nicht zurückholen. Persönliche Git-, KI- und MCP-Zugangsdaten gehören weiterhin zum Konto und werden durch einen Eigentümerwechsel nicht übertragen.

### Die Rolle eines Mitglieds ändern {#change-role}

Öffne als Eigentümer **Projekteinstellungen** → **Mitglieder** und wähle die neue Rolle der Person: **Mitglied** oder **Leser**. Lege bei einem Leser fest, ob **Darf kommentieren** aktiviert ist. Diese Option ist standardmäßig deaktiviert und wird jedes Mal ausgeschaltet, wenn jemand zum Leser wird. Prüfe sie daher, nachdem du ein Mitglied zum Leser gemacht hast. Deine eigene Rolle als Eigentümer ändert sich nur durch eine Übertragung.

Wird ein Mitglied zum Leser, verliert es außerdem die Zuweisung seiner offenen Probleme und die Verantwortung für seine Ziele; diese Probleme verschwinden damit aus seinem persönlichen Zyklus. Weise diese Arbeit neu zu, wenn sie weitergehen soll.

Eine Rollenänderung gilt ab der nächsten Anfrage der Person, in der Anwendung, in Numo und über MCP. Bereits geladene oder heruntergeladene Inhalte werden nicht zurückgeholt, und ein bereits geöffneter signierter Dateilink kann noch einige Minuten gültig bleiben.

### Fehlenden Zugriff klären {#invitation-recovery}

Fehlt eine Einladung, vergleiche die eingeladene E-Mail-Adresse mit dem angemeldeten Konto und prüfe die Instanz-URL. Bitte den Eigentümer, ausstehende Einladungen zu prüfen, statt wiederholt Konten anzulegen. Ändert sich deine Rolle während einer geöffneten Sitzung, lade das Ziel neu und prüfe deine Rolle, bevor du Schreibaktionen wiederholst. Ein Leser, der Inhalte bearbeiten muss, bittet den Eigentümer, seine Rolle auf Mitglied zu ändern. Nutze nicht die Sitzung einer anderen Person, um einen Zugriffsfehler zu umgehen.

## Eigentum übertragen {#transfer-ownership}

Ein Projekt hat genau einen Eigentümer. Um es abzugeben, öffne als Eigentümer **Projekteinstellungen** → **Mitglieder**, wähle bei einem bestehenden Mitglied **Projekteigentum übertragen** und bestätige. Nur ein Mitglied kann das Eigentum erhalten; lade die Person zuerst ein oder ändere die Rolle eines Lesers auf Mitglied. Nach der Übertragung bleibst du als Mitglied im Projekt.

### Was mit dem Eigentum übergeht {#transfer-effects}

- Deine Routinen in diesem Projekt werden pausiert und können keine neue Arbeit starten. Der neue Eigentümer legt die Routinen an, die mit seinem eigenen Budget weiterlaufen sollen.
- Die Tariflimits für Probleme und Gäste pro Projekt, der Speicher und Hintergrund-KI wie Smart Assign und die Feedback-Prüfung richten sich nun nach Tarif und Budget des neuen Eigentümers. Bestehende Probleme und Mitglieder bleiben erhalten.
- Abonnements, Zahlungsmethoden sowie persönliche Schlüssel und Verbindungen bleiben beim jeweiligen Konto.
- Ausstehende Einladungen bleiben gültig.

Die Übertragung schlägt fehl, ohne etwas zu ändern, wenn der Speicher des neuen Eigentümers die Dateien des Projekts nicht aufnehmen kann oder wenn er bereits ein Projekt mit demselben Schlüssel besitzt. Gib Speicher frei oder ändere den Projektschlüssel und versuche es dann erneut.
