---
{
  "id": "code-work",
  "locale": "de",
  "title": "Code-Arbeit und Pull Requests",
  "summary": "Delegieren Sie die Umsetzung eines Problems an einen Code-Worker, setzen Sie die Arbeit fort und prüfen Sie den verknüpften Pull Request.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls",
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "lib/native-agent-models.ts",
      "components/settings/native-agent-model-preferences.tsx",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance)",
    "date": "2026-10-10"
  },
  "related": [
    "numo",
    "repository-skills"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Ein Ticket an den Code-Worker delegieren",
    "Einen verknüpften Pull Request prüfen"
  ],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/delegate-code-work-workflow.png",
      "alt": "Abgeschlossene Worker-Karte mit Modell, geringer Denkintensität, zwei geänderten Dateien, Branch, PR Nr. 1 und korrigiertem Commit.",
      "caption": "Historisches OpenCode-Beispiel: Karte der tatsächlichen Korrektur am bestehenden PR mit aktualisiertem Commit und Link. Prüfen Sie Diff und Tests vor dem Merge; der Abschlussstatus allein belegt nicht, dass die Abnahmekriterien erfüllt sind.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        180
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/review-pull-requests-workflow.png",
      "alt": "Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.",
      "caption": "Der tatsächlich korrigierte PR bleibt offen und wurde nicht gemergt. Der Diff entfernt Leerzeichen um den Namen und verwendet World bei leerem Wert. Diese Instanz kann keine GitHub-Benutzerautorisierung anfordern; der Bereitschaftsstatus verleiht keine Merge-Rechte und belegt keine erfolgreiche Anbieter-CI.",
      "revision": 7,
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
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

Codearbeit beginnt mit dem verknüpften Repository eines Projekts und läuft in einer Serversandbox. Bereiten Sie das Ticket vor und delegieren Sie die Umsetzung an Numos Code-Worker. Prüfen Sie vor dem Merge den verknüpften Pull Request und die Prüfungen des Git-Anbieters.

## Ein Ticket an den Code-Worker delegieren {#delegate-code-work}

Das Projekt benötigt ein verknüpftes GitHub- oder GitLab-Repository, gültige Anbieterrechte und eine konfigurierte Serversandbox. Prüfen Sie **Code-Agent** in den KI-Kontoeinstellungen. OpenCode benötigt ein kompatibles API-Codemodell; der eingeschränkte Zugriff auf Codex und Claude Code benötigt die Verbindung des ausgewählten persönlichen Kontos. Stellen Sie dort Modell und Denkaufwand ein oder lassen Sie **Automatisch** ausgewählt. Diese Auswahl ist unabhängig vom Numo-Unterhaltungsmodell. Bei fehlendem nativem Zugriff verbinden Sie das Konto erneut oder wählen ausdrücklich OpenCode; die Arbeit wechselt nicht zur API-Abrechnung.

Gehostete Codex-Abonnementauthentifizierung ist nicht allgemein verfügbar. OpenAI schließt app-server-Authentifizierung für gehostete Dienste ausdrücklich aus und verweist auf Sign in with ChatGPT. Minddy benötigt vor der Freigabe eine autorisierte Integration. Eingeschränkte technische Tests belegen weder die Anbietererlaubnis noch die Wiederherstellung nach natürlichem Token-Ablauf. Die kostenpflichtige Claude-Code-Ausführung bleibt ungetestet. Das Entfernen von UI-Badges ändert diese Bedingungen nicht. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

Die Karte für delegierte Arbeit, die Worker-Details und das Worker-Gespräch zeigen die Engine dieses Laufs mit ihrem Logo: **Codex**, **Claude Code** oder **OpenCode**. Diese Identität wird beim Start gespeichert. Änderungen an den Kontoeinstellungen gelten für neue Worker; sie ändern die Kennzeichnung eines bestehenden Laufs nicht. Ältere Läufe ohne gespeicherte Engine zeigen eine allgemeine Codeagent-Bezeichnung.

1. Öffnen Sie das Ticket und beschreiben Sie erwartetes Verhalten, Einschränkungen und Abnahmetests.
2. Öffnen Sie Numo mit Ticketkontext. Lassen Sie das Repository vor einem technischen Plan prüfen. Ungeprüfte Dateinamen und APIs sind keine Umsetzungsbelege.
3. Beauftragen Sie die Umsetzung ausdrücklich. Numo delegiert Branch-Änderungen an den Worker, der das Repository in der Server-Sandbox klont.
4. Verfolgen Sie Fortschritt, Dateien, Prüfungen und Fragen auf der Worker-Karte. Antworten Sie im Gespräch.
5. Öffnen Sie den verknüpften Pull Request. Prüfen Sie Diff und dokumentierte Tests anhand der Abnahmekriterien vor dem Merge. Eine Vorschau gibt es nur, wenn der Deployment-Anbieter eine erzeugt hat.

![Abgeschlossene Worker-Karte mit Modell, geringer Denkintensität, zwei geänderten Dateien, Branch, PR Nr. 1 und korrigiertem Commit.](/documentation/de/delegate-code-work-workflow.png)

### Sicher fortsetzen {#continuation}

Ein erhaltener Checkpoint kann eine Wiederaufnahme ermöglichen, garantiert aber keinen Abschluss. Prüfen Sie Branch und PR vor einem neuen Lauf. Erhalten Sie erledigte Planaufgaben und parallele Änderungen. Rein lokale Dateien fehlen dem Worker: Pushen Sie erforderlichen Code oder Skills zuerst.

## Einen verknüpften Pull Request prüfen {#review-pull-requests}

Öffnen Sie den Pull Request am Ticket oder delegierten Lauf. Repository-Zugriff bleibt erforderlich; Projektmitgliedschaft verleiht keine Forge-Rechte.

Lesen Sie Beschreibung und Aktivität, danach geänderte Dateien und Diff-Blöcke. Öffnen Sie ungelöste Diskussionen und antworten Sie im betreffenden Thread. Markierungen gelesener Dateien dokumentieren Ihren Fortschritt, gelten aber nicht als Anbieterfreigabe. Prüfen Sie Commits, CI-Ergebnisse und verknüpfte Tickets auf den geforderten Umfang.

![Änderungsansicht des offenen Demonstrations-PR mit Diff der Funktion greeting und Hinweis auf fehlende GitHub-Autorisierung.](/documentation/de/review-pull-requests-workflow.png)

### Review und Merge {#decision}

Fordern Sie bei Bedarf einen weiteren Reviewer an. Eine verfügbare KI-Prüfung ist zusätzliche Rückmeldung und kein Beleg bestandener Tests. Prüfen Sie Entwurfs- oder Review-Status, offene Diskussionen, angeforderte Reviews und die Merge-Regeln des Anbieters.

Führen Sie den Merge erst nach den erforderlichen Tests und Reviews mit einem berechtigten Anbieterkonto aus. Eine sichtbare Aktion kann dennoch abgelehnt werden. Bei veraltetem Status aktualisieren Sie die Ansicht und prüfen den Anbieter vor Wiederholung. Numo kann mit Freigabe lesen, kommentieren, Review-Bereitschaft ändern oder mergen; Branch-Änderungen erledigt der Worker. Eine Vorschau setzt ein tatsächliches Deployment voraus.
