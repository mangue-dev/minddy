---
{
  "id": "code-work",
  "locale": "de",
  "title": "Code-Arbeit und Pull Requests",
  "summary": "Übergeben Sie ein Ticket mit einer kopierten Eingabeaufforderung und minddy MCP an Ihren eigenen Coding-Agenten, prüfen und mergen Sie dann den verknüpften Pull Request.",
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
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
    "revision": 18,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

Minddy verfolgt die Arbeit; Ihr eigener Coding-Agent, etwa Claude Code, Codex oder Cursor, ändert den Code. Kopieren Sie eine Eingabeaufforderung aus dem Ticket, lassen Sie den Agenten das Ticket über minddy MCP lesen und aktualisieren, und prüfen Sie den verknüpften Pull Request anschließend in Minddy, bevor Sie ihn mergen. Numo schreibt keinen Code, legt keine Branches an und führt keine Tests aus.

## Ein Ticket an einen externen Coding-Agenten übergeben {#external-coding-agents}

Verbinden Sie Ihren Agenten zuerst mit minddy MCP, damit er den Plan lesen und dessen Aufgaben aktualisieren kann; siehe [Einen externen Assistenten mit minddy MCP verbinden](/docs/minddy-mcp#external-minddy-mcp). Der Agent läuft auf Ihrem Computer oder in seinem eigenen Dienst, mit eigenem Abonnement oder eigenen API-Kosten. Minddy stellt ihm keinen Repository-Zugriff bereit.

1. Öffnen Sie das Ticket und beschreiben Sie erwartetes Verhalten, Einschränkungen und Abnahmekriterien. Schreiben oder prüfen Sie den Plan im Tab „Plan“, wenn die Arbeit mehrere Schritte umfasst.
2. Öffnen Sie das Aktionsmenü des Tickets und wählen Sie **Als Eingabeaufforderung kopieren**. Wählen Sie **Plan erstellen** (oder **Plan überprüfen**, wenn bereits einer existiert), um den Umfang ohne Programmierung festzulegen, **Problem umsetzen**, um die Änderung zu beginnen, **Überprüfen Sie die Implementierung**, damit der Agent abgeschlossene Arbeit mit Plan und Kommentaren abgleicht, oder **Benutzerdefiniert…** für eine eigene Anweisung.
3. Fügen Sie die Eingabeaufforderung in Ihren Agenten ein, und zwar in der Arbeitskopie des Repositorys. Das Kopieren führt kein KI-Modell aus und verbraucht kein KI-Kontingent.
4. Verfolgen Sie den Planfortschritt im Ticket, während der Agent dessen Aufgaben über MCP aktualisiert. Beantworten Sie seine Fragen im Agenten, oder halten Sie Entscheidungen im Ticket fest, damit die nächste Eingabeaufforderung sie enthält.

Inhalt der Eingabeaufforderung, Branch-Vorschlag und Sprachregeln beschreibt [Eine Eingabeaufforderung für einen anderen Coding-Agenten kopieren](/docs/issues#copy-issue-prompt).

### Die Arbeit mit dem Ticket verknüpft halten {#link-work}

Wenn das Repository mit dem Projekt verknüpft ist, behalten Sie die Ticketkennung im Branch-Namen, im Titel des Pull Requests oder in einer Zeile `Fixes MIN-42`. Minddy hängt den Pull Request dann an das Ticket, und spätere Eingabeaufforderungen weisen den Agenten an, den offenen Pull Request auf seinem Branch fortzusetzen. Um ein Ticket von Hand anzuhängen, verwenden Sie **Ein Problem verknüpfen** am Pull Request. Die Suche akzeptiert eine Kennung oder Wörter aus dem Titel, und eine Beschreibung listet auch [inhaltlich gefundene](/docs/navigation#search-by-meaning) Tickets des Projekts unter **Inhaltlich verwandt** auf.

Klicken Sie auf einem Board mit der rechten Maustaste auf ein Problem ohne offene Pull-Anfrage und wählen Sie **Mit einer Pull-Anfrage verknüpfen**, um eine der offenen Pull-Anfragen seines Projekts auszuwählen, Entwürfe eingeschlossen. Der Eintrag erscheint nur, wenn dieses Projekt mindestens eine solche Pull-Anfrage zum Verknüpfen hat. Bei mehreren ausgewählten Problemen bietet **Aktionen** dieselbe Auswahl für die gesamte Auswahl an, sowie **Die anderen Probleme mit #N verknüpfen**, wenn einige davon bereits Pull-Anfrage N haben. **Mit einer Pull-Anfrage verknüpfen** wird nicht angeboten, sobald ein ausgewähltes Problem eine verknüpfte Pull-Anfrage hat; **Verknüpfung von N Problemen mit ihren Pull-Anfragen lösen** entfernt nach Ihrer Bestätigung zuerst alle Verknüpfungen der Auswahl. Verknüpfungen erscheinen sofort auf den Karten, und eine abgelehnte Verknüpfung verschwindet, wenn das Board aktualisiert wird. Eine Karte mit offener Pull-Anfrage zeigt deren Nummer, nach Status eingefärbt, und ihre Merge-Bereitschaft, denselben Indikator wie in **Code-Review**.

Unter **Kontoeinstellungen → Vorgänge → Vorgang starten** setzt **Starten Sie das Problem oder die Aufgabe, wenn ich die Eingabeaufforderung kopiere.** ein noch nicht begonnenes Ticket oder eine Notizbuchaufgabe auf „In Arbeit“, sobald Sie deren Eingabeaufforderung kopieren. Lassen Sie die Option deaktiviert, wenn Sie Eingabeaufforderungen nur zum Lesen kopieren.

## Einen verknüpften Pull Request prüfen {#review-pull-requests}

Öffnen Sie den mit einem Ticket verknüpften Pull Request oder suchen Sie ihn in der Pull-Request-Liste. Repository-Zugriff bleibt erforderlich; Projektmitgliedschaft verleiht keine Forge-Rechte.

Lesen Sie Beschreibung und Aktivität, danach geänderte Dateien und Diff-Blöcke. Öffnen Sie ungelöste Diskussionen und antworten Sie im betreffenden Thread, statt einen unabhängigen Kommentar anzulegen. Um das verbleibende Feedback an Ihren Agenten zurückzugeben, öffnen Sie **Diskussionen anzeigen**, dann **Alle beheben** und **Prompt kopieren**. Markierungen gelesener Dateien dokumentieren Ihren Fortschritt, gelten aber nicht als Anbieterfreigabe. Prüfen Sie Commits, CI-Ergebnisse und verknüpfte Tickets, um sicherzustellen, dass die vorgeschlagene Änderung den geforderten Umfang abdeckt.

Klicken Sie in einer Beschreibung, einem Kommentar oder dem Diff eines Bildes auf ein Bild, um es im ganzen Fenster zu öffnen; der Diff eines Bildes öffnet die Seiten **Vorher** und **Nachher** einzeln. Mit **Schließen** oder Esc kehren Sie zum Pull Request zurück.

Erwähnen Sie `@numo` in einem Pull-Request-Kommentar, um Numo in einer Unterhaltung um ein Review ohne Schreibzugriff zu bitten. Numo liest den Pull Request und antwortet; es pusht keine Commits. Eine auf der Forge geschriebene Erwähnung zählt nur, wenn ihr Autor mit dem Eigentümer oder einem Mitglied (nicht einem Leser) eines Projekts verknüpft ist, das das Repository verknüpft; die Nutzung wird dem Eigentümer dieses Projekts angerechnet.

![Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.](/documentation/de/review-pull-requests-workflow.png)

### Review und Merge {#decision}

Wählen Sie mit **Review anfordern** einen Reviewer, wenn ein zweites Review nötig ist. Prüfen Sie Entwurfs- oder Review-Status, offene Diskussionen, angeforderte Reviews und die Merge-Regeln des Anbieters.

Führen Sie den Merge erst nach den erforderlichen Prüfungen und Reviews mit einem berechtigten Anbieterkonto aus. Mit **Mit Numo zusammenführen** schreibt Numo Titel und Beschreibung des Merge-Commits anhand des Pull Requests und führt den Merge aus, sobald beides fertig ist. Eine sichtbare Aktion kann von der Forge dennoch abgelehnt werden. Bei veraltetem Status aktualisieren Sie die Ansicht und prüfen den Anbieter vor einer Wiederholung. Eine verknüpfte Vorschau setzt ein tatsächliches Deployment beim Anbieter voraus.

Klicken Sie mit der rechten Maustaste auf einen Pull Request in der Liste, um seinen Status zu ändern, ihn zusammenzuführen oder eine Korrektur anzufordern, ohne ihn zu öffnen. Ein offener Pull Request bietet **In Entwurf umwandeln** und **Pull-Request schließen**, ein Entwurf bietet **Bereit zur Überprüfung** und **Pull-Request schließen**, und ein geschlossener bietet **Erneut öffnen**; jede Änderung verlangt eine Bestätigung. Ein zusammengeführter Pull Request bietet keine Statusänderung. Schreibaktionen erscheinen nur, wenn Ihr Anbieterkonto in das Repository schreiben kann, und bleiben nicht verfügbar, bis das Menü den Pull Request neu gelesen hat. **Zusammenführen** erscheint, wenn der Pull Request offen, kein Entwurf und zum Merge bereit ist; es öffnet den Pull Request mit seiner üblichen Merge-Bestätigung. **Korrektur-Prompt kopieren** und **Mit Numo beheben** erscheinen, wenn eine Prüfung fehlschlägt, eine Konversation ungelöst ist oder der Branch Konflikte hat oder veraltet ist. **Mit Numo beheben** sendet diesen Prompt mit dem Pull Request als Kontext an Numo. Numo kann den Pull Request lesen, eine Review-Unterhaltung beantworten, die keine Codeänderung erfordert, und Unterhaltungen auflösen, die der Branch bereits erledigt, ändert aber keinen Code und pusht keine Commits. Für Codeänderungen verwenden Sie **Korrektur-Prompt kopieren** und fügen den Prompt in Ihren Coding-Agenten ein. Berechtigungen und Merge-Fähigkeit werden beim Bestätigen erneut geprüft.
