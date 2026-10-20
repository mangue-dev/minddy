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
  "revision": 17,
  "sourceRevision": 17,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-721 removal of Numo code work (copied prompts and MCP for external agents, pull request review and merge retained); MIN-685 sidebar context menus; MIN-693 project roles; MIN-718 hybrid issue search; MIN-737 account settings reorganization; MIN-686 shared reader for pull request images; UI/UX refinements batch: Link to a pull request offered only with a linkable pull request",
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
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md",
      "components/pull-requests/pr-link-issue.tsx",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "components/markdown-image.tsx",
      "components/pull-requests/pr-image-diff.tsx",
      "components/image-viewer.tsx",
      "content/documentation/reviews/min-686-preview.md",
      "components/issue-card.tsx"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (worker card, explicit validation, PR handoff and footer source/component review; no new provider execution); agent:/root/min721_docs (MIN-721 source review inherited from en revision 9; de translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 10; de translation of added passages; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (board pull request linking and card merge readiness: source and unit-test review of use-issue-menu-actions, pr-link-target-picker, bulk-pull-request-links and issue-pr-context; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (bulk link rule, unlink from all pull requests and optimistic links: source and unit-test review of bulk-pull-request-links and use-link-issues-to-pull-request; no browser walkthrough with live pull requests; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Starting an issue card in components/settings/account-issues-section.tsx; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-686 pull request images: source and unit-test review of MarkdownImage and PrImageDiff opening the shared reader, Close and Escape dismissal; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of LinkablePullRequestsProbe in components/pull-requests/pr-link-target-picker.tsx (open pull requests, drafts included) and the gated board-card menu entry in components/issue-card.tsx; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale card controls and delivery wording review; not human acceptance); agent:/root/min721_de (de translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (de translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min693_de with agent:/root (de MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (de translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de board pull request linking paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (de added sentences, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (de MIN-686 added sentence with catalog UI labels; agent review, not human acceptance); agent:/root (de translation of the Link to a pull request entry changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
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
      "revision": 17,
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

Klicken Sie auf einem Board mit der rechten Maustaste auf ein Problem ohne offene Pull-Anfrage und wählen Sie **Mit einer Pull-Anfrage verknüpfen**, um eine der offenen Pull-Anfragen seines Projekts auszuwählen, Entwürfe eingeschlossen. Der Eintrag erscheint nur, wenn dieses Projekt mindestens eine solche Pull-Anfrage zum Verknüpfen hat. Bei mehreren ausgewählten Problemen bietet **Aktionen** dieselbe Auswahl für die gesamte Auswahl an, sowie **Die anderen Probleme mit #N verknüpfen**, wenn einige davon bereits Pull-Anfrage N haben. **Mit einer Pull-Anfrage verknüpfen** wird nicht angeboten, sobald ein ausgewähltes Problem eine verknüpfte Pull-Anfrage hat; **Verknüpfung von N Problemen mit ihren Pull-Anfragen lösen** entfernt zuerst alle Verknüpfungen der Auswahl. Verknüpfungen erscheinen sofort auf den Karten, und eine abgelehnte Verknüpfung verschwindet, wenn das Board aktualisiert wird. Eine Karte mit offener Pull-Anfrage zeigt deren Nummer, nach Status eingefärbt, und ihre Merge-Bereitschaft, denselben Indikator wie in **Code-Review**.

Unter **Kontoeinstellungen → Vorgänge → Vorgang starten** setzt **Starten Sie das Problem oder die Aufgabe, wenn ich die Eingabeaufforderung kopiere.** ein noch nicht begonnenes Ticket oder eine Notizbuchaufgabe auf „In Arbeit“, sobald Sie deren Eingabeaufforderung kopieren. Lassen Sie die Option deaktiviert, wenn Sie Eingabeaufforderungen nur zum Lesen kopieren.

## Einen verknüpften Pull Request prüfen {#review-pull-requests}

Öffnen Sie den mit einem Ticket verknüpften Pull Request oder suchen Sie ihn in der Pull-Request-Liste. Repository-Zugriff bleibt erforderlich; Projektmitgliedschaft verleiht keine Forge-Rechte.

Lesen Sie Beschreibung und Aktivität, danach geänderte Dateien und Diff-Blöcke. Öffnen Sie ungelöste Diskussionen und antworten Sie im betreffenden Thread, statt einen unabhängigen Kommentar anzulegen. Um das verbleibende Feedback an Ihren Agenten zurückzugeben, öffnen Sie **Diskussionen anzeigen**, dann **Alle beheben** und **Prompt kopieren**. Markierungen gelesener Dateien dokumentieren Ihren Fortschritt, gelten aber nicht als Anbieterfreigabe. Prüfen Sie Commits, CI-Ergebnisse und verknüpfte Tickets, um sicherzustellen, dass die vorgeschlagene Änderung den geforderten Umfang abdeckt.

Klicken Sie in einer Beschreibung, einem Kommentar oder dem Diff eines Bildes auf ein Bild, um es im ganzen Fenster zu öffnen; der Diff eines Bildes öffnet die Seiten **Vorher** und **Nachher** einzeln. Mit **Schließen** oder Esc kehren Sie zum Pull Request zurück.

Erwähnen Sie `@numo` in einem Pull-Request-Kommentar, um Numo in einer Unterhaltung um ein Review ohne Schreibzugriff zu bitten. Numo liest den Pull Request und antwortet; es pusht keine Commits. Eine auf der Forge geschriebene Erwähnung zählt nur, wenn ihr Autor mit dem Eigentümer oder einem Mitglied (nicht einem Leser) eines Projekts verknüpft ist, das das Repository verknüpft; die Nutzung wird dem Eigentümer dieses Projekts angerechnet.

![Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.](/documentation/de/review-pull-requests-workflow.png)

### Review und Merge {#decision}

Fordern Sie bei Bedarf einen weiteren Reviewer an. Prüfen Sie Entwurfs- oder Review-Status, offene Diskussionen, angeforderte Reviews und die Merge-Regeln des Anbieters.

Führen Sie den Merge erst nach den erforderlichen Prüfungen und Reviews mit einem berechtigten Anbieterkonto aus. Mit **Mit Numo zusammenführen** schreibt Numo Titel und Beschreibung des Merge-Commits anhand des Pull Requests und führt den Merge aus, sobald beides fertig ist. Eine sichtbare Aktion kann von der Forge dennoch abgelehnt werden. Bei veraltetem Status aktualisieren Sie die Ansicht und prüfen den Anbieter vor einer Wiederholung. Eine verknüpfte Vorschau setzt ein tatsächliches Deployment beim Anbieter voraus.

Klicken Sie mit der rechten Maustaste auf einen Pull Request in der Liste, um seinen Status zu ändern, ihn zusammenzuführen oder eine Korrektur anzufordern, ohne ihn zu öffnen. Ein offener Pull Request bietet **In Entwurf umwandeln** und **Pull-Request schließen**, ein Entwurf bietet **Bereit zur Überprüfung** und **Pull-Request schließen**, und ein geschlossener bietet **Erneut öffnen**; jede Änderung verlangt eine Bestätigung. Ein zusammengeführter Pull Request bietet keine Statusänderung. Schreibaktionen erscheinen nur, wenn Ihr Anbieterkonto in das Repository schreiben kann, und bleiben nicht verfügbar, bis das Menü den Pull Request neu gelesen hat. **Zusammenführen** erscheint, wenn der Pull Request offen, kein Entwurf und zum Merge bereit ist; es öffnet den Pull Request mit seiner üblichen Merge-Bestätigung. **Korrektur-Prompt kopieren** und **Mit Numo beheben** erscheinen, wenn eine Prüfung fehlschlägt, eine Konversation ungelöst ist oder der Branch Konflikte hat oder veraltet ist. **Mit Numo beheben** sendet diesen Prompt mit dem Pull Request als Kontext an Numo. Berechtigungen und Merge-Fähigkeit werden beim Bestätigen erneut geprüft.
