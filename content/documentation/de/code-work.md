---
{
  "id": "code-work",
  "locale": "de",
  "title": "Code-Arbeit und Pull Requests",
  "summary": "Übergib ein Ticket mit einem kopierten Prompt und minddy MCP an deinen eigenen Coding-Agenten, prüfe und merge dann den verknüpften Pull Request.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 20,
  "sourceRevision": 19,
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
      "components/agent/use-agent-menu-actions.tsx",
      "components/agent/custom-prompt-dialog.tsx",
      "components/settings/account-preferences-section.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-unresolved-conversations.tsx",
      "lib/server/agent/pr-mention.ts",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/pull-requests/pr-link-issue.tsx",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "components/markdown-image.tsx",
      "components/pull-requests/pr-image-diff.tsx",
      "components/image-viewer.tsx",
      "components/issue-card.tsx"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "issues",
    "minddy-mcp",
    "git"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Ein Ticket an einen externen Coding-Agenten übergeben",
    "Einen verknüpften Pull Request prüfen"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/review-pull-requests-workflow.png",
      "alt": "Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.",
      "caption": "Demonstrations-PR, der offen bleibt und nicht gemergt wurde. Der Diff entfernt Leerzeichen um den Namen und verwendet World bei leerem Wert. Diese Instanz kann keine GitHub-Benutzerautorisierung anfordern; der Bereitschaftsstatus verleiht keine Merge-Rechte und belegt keine erfolgreiche Anbieter-CI.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

Minddy verfolgt die Arbeit; dein eigener Coding-Agent, etwa Claude Code, Codex oder Cursor, ändert den Code. Kopiere einen Prompt aus dem Ticket, lass den Agenten das Ticket über minddy MCP lesen und aktualisieren, und prüfe den verknüpften Pull Request anschließend in Minddy, bevor du ihn mergst. Numo schreibt keinen Code, legt keine Branches an und führt keine Tests aus.

## Ein Ticket an einen externen Coding-Agenten übergeben {#external-coding-agents}

Verbinde deinen Agenten zuerst mit minddy MCP, damit er den Plan lesen und dessen Aufgaben aktualisieren kann; siehe [Einen externen Assistenten mit minddy MCP verbinden](/docs/minddy-mcp#external-minddy-mcp). Der Agent läuft auf deinem Computer oder in seinem eigenen Dienst, mit eigenem Abonnement oder eigenen API-Kosten. Minddy stellt ihm keinen Repository-Zugriff bereit.

1. Öffne das Ticket und beschreibe erwartetes Verhalten, Einschränkungen und Abnahmekriterien. Schreibe oder prüfe den Plan im Tab „Plan“, wenn die Arbeit mehrere Schritte umfasst.
2. Öffne das Aktionsmenü des Tickets und wähle **Als Prompt kopieren**. Wähle **Plan erstellen** (oder **Plan überprüfen**, wenn bereits einer existiert), um den Umfang ohne Programmierung festzulegen, **Ticket umsetzen**, um die Änderung zu beginnen, **Implementierung überprüfen**, damit der Agent abgeschlossene Arbeit mit Plan und Kommentaren abgleicht, oder **Benutzerdefiniert…** für eine eigene Anweisung.
3. Füge den Prompt in deinen Agenten ein, und zwar in der Arbeitskopie des Repositorys. Das Kopieren führt kein KI-Modell aus und verbraucht kein KI-Kontingent.
4. Verfolge den Planfortschritt im Ticket, während der Agent dessen Aufgaben über MCP aktualisiert. Beantworte seine Fragen im Agenten, oder halte Entscheidungen im Ticket fest, damit der nächste Prompt sie enthält.

Inhalt des Prompts, Branch-Vorschlag und Sprachregeln beschreibt [Einen Prompt für einen anderen Coding-Agenten kopieren](/docs/issues#copy-issue-prompt).

### Die Arbeit mit dem Ticket verknüpft halten {#link-work}

Wenn das Repository mit dem Projekt verknüpft ist, behalte die Ticketkennung im Branch-Namen, im Titel des Pull Requests oder in einer Zeile `Fixes MIN-42`. Minddy hängt den Pull Request dann an das Ticket, und spätere Prompts weisen den Agenten an, den offenen Pull Request auf seinem Branch fortzusetzen. Um ein Ticket von Hand anzuhängen, verwende **Ein Ticket verknüpfen** am Pull Request. Die Suche akzeptiert eine Kennung oder Wörter aus dem Titel, und eine Beschreibung listet auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets des Projekts unter **Inhaltlich verwandt** auf.

Klicke auf einem Board mit der rechten Maustaste auf ein Ticket ohne offenen Pull Request und wähle **Mit einem Pull Request verknüpfen**, um einen der offenen Pull Requests seines Projekts auszuwählen, Entwürfe eingeschlossen. Der Eintrag erscheint nur, wenn dieses Projekt mindestens einen solchen Pull Request zum Verknüpfen hat. Bei mehreren ausgewählten Tickets bietet **Aktionen** dieselbe Auswahl für die gesamte Auswahl an, sowie **Die anderen Tickets mit #N verknüpfen**, wenn einige davon bereits Pull Request N haben. **Mit einem Pull Request verknüpfen** wird nicht angeboten, sobald ein ausgewähltes Ticket einen verknüpften Pull Request hat; **Verknüpfung von N Tickets mit ihren Pull Requests lösen** entfernt nach deiner Bestätigung zuerst alle Verknüpfungen der Auswahl. Verknüpfungen erscheinen sofort auf den Karten, und eine abgelehnte Verknüpfung verschwindet, wenn das Board aktualisiert wird. Eine Karte mit offenem Pull Request zeigt dessen Nummer, nach Status eingefärbt, und seine Merge-Bereitschaft, denselben Indikator wie in **Code-Review**.

Unter **Kontoeinstellungen → Tickets → Ticket starten** setzt **Ticket oder Aufgabe starten, wenn ich den Prompt kopiere** ein noch nicht begonnenes Ticket oder eine Notizbuchaufgabe auf „In Arbeit“, sobald du deren Prompt kopierst. Lass die Option deaktiviert, wenn du Prompts nur zum Lesen kopieren.

## Einen verknüpften Pull Request prüfen {#review-pull-requests}

Öffne den mit einem Ticket verknüpften Pull Request oder suche ihn in der Pull-Request-Liste. Repository-Zugriff bleibt erforderlich; Projektmitgliedschaft verleiht keine Forge-Rechte.

Lies Beschreibung und Aktivität, danach geänderte Dateien und Diff-Blöcke. Öffne ungelöste Diskussionen und antworte im betreffenden Thread, statt einen unabhängigen Kommentar anzulegen. Um das verbleibende Feedback an deinen Agenten zurückzugeben, öffne **Unterhaltungen anzeigen**, dann **Alle beheben** und **Prompt kopieren**. Markierungen gelesener Dateien dokumentieren deinen Fortschritt, gelten aber nicht als Anbieterfreigabe. Prüfe Commits, CI-Ergebnisse und verknüpfte Tickets, um sicherzustellen, dass die vorgeschlagene Änderung den geforderten Umfang abdeckt.

Klicke in einer Beschreibung, einem Kommentar oder dem Diff eines Bildes auf ein Bild, um es im ganzen Fenster zu öffnen; der Diff eines Bildes öffnet die Seiten **Vorher** und **Nachher** einzeln. Mit **Schließen** oder Esc kehrst du zum Pull Request zurück.

Erwähne `@numo` in einem Pull-Request-Kommentar, um Numo in einer Unterhaltung um ein Review ohne Schreibzugriff zu bitten. Numo liest den Pull Request und antwortet; es pusht keine Commits. Eine auf der Forge geschriebene Erwähnung zählt nur, wenn ihr Autor mit dem Eigentümer oder einem Mitglied (nicht einem Leser) eines Projekts verknüpft ist, das das Repository verknüpft; die Nutzung wird dem Eigentümer dieses Projekts angerechnet.

![Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.](/documentation/de/review-pull-requests-workflow.png)

### Review und Merge {#decision}

Wähle mit **Review anfordern** einen Reviewer, wenn ein zweites Review nötig ist. Prüfe Entwurfs- oder Review-Status, offene Diskussionen, angeforderte Reviews und die Merge-Regeln des Anbieters.

Führe den Merge erst nach den erforderlichen Prüfungen und Reviews mit einem berechtigten Anbieterkonto aus. Mit **Mit Numo zusammenführen** schreibt Numo Titel und Beschreibung des Merge-Commits anhand des Pull Requests und führt den Merge aus, sobald beides fertig ist. Eine sichtbare Aktion kann von der Forge dennoch abgelehnt werden. Bei veraltetem Status aktualisiere die Ansicht und prüfe den Anbieter vor einer Wiederholung. Eine verknüpfte Vorschau setzt ein tatsächliches Deployment beim Anbieter voraus.

Klicke mit der rechten Maustaste auf einen Pull Request in der Liste, um seinen Status zu ändern, ihn zusammenzuführen oder eine Korrektur anzufordern, ohne ihn zu öffnen. Ein offener Pull Request bietet **In Entwurf umwandeln** und **Pull Request schließen**, ein Entwurf bietet **Bereit zur Überprüfung** und **Pull Request schließen**, und ein geschlossener bietet **Erneut öffnen**; jede Änderung verlangt eine Bestätigung. Ein zusammengeführter Pull Request bietet keine Statusänderung. Schreibaktionen erscheinen nur, wenn dein Anbieterkonto in das Repository schreiben kann, und bleiben nicht verfügbar, bis das Menü den Pull Request neu gelesen hat. **Zusammenführen** erscheint, wenn der Pull Request offen, kein Entwurf und zum Merge bereit ist; es öffnet den Pull Request mit seiner üblichen Merge-Bestätigung. **Korrektur-Prompt kopieren** und **Mit Numo beheben** erscheinen, wenn eine Prüfung fehlschlägt, eine Konversation ungelöst ist oder der Branch Konflikte hat oder veraltet ist. **Mit Numo beheben** sendet diesen Prompt mit dem Pull Request als Kontext an Numo. Numo kann den Pull Request lesen, eine Review-Unterhaltung beantworten, die keine Codeänderung erfordert, und Unterhaltungen auflösen, die der Branch bereits erledigt, ändert aber keinen Code und pusht keine Commits. Für Codeänderungen verwende **Korrektur-Prompt kopieren** und füge den Prompt in deinen Coding-Agenten ein. Berechtigungen und Merge-Fähigkeit werden beim Bestätigen erneut geprüft.
