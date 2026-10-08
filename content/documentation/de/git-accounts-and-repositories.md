---
{
  "id": "git-accounts-and-repositories",
  "locale": "de",
  "title": "Git verbinden und ein Repository verknüpfen",
  "summary": "Das Anbieterkonto autorisieren und als Eigentümer das Projekt-Repository wählen.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "N10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "forge-issue-sync",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "integrations"
  ],
  "tags": [],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/git-accounts-and-repositories-workflow.png",
      "alt": "Nicht verbundene GitHub- und GitLab-Konten mit Autorisierungsschaltflächen.",
      "caption": "Autorisiere zuerst dein Git-Konto. Der Projektinhaber verknüpft das Repository anschließend separat.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "git-accounts-and-repositories-project-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/git-accounts-and-repositories-project-workflow.png",
      "alt": "Git-Einstellungen eines Projekts ohne verknüpftes Repository.",
      "caption": "Git-Einstellungen eines Projekts ohne verknüpftes Repository. Autorisiere GitHub oder GitLab, bevor du ein Repository auswählst.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow"
  ]
}
---

## Konto und Projekt verbinden {#git-accounts-and-repositories}
Verbinden Sie GitHub oder GitLab in den Git-Kontoeinstellungen und schließen Sie die Browserfreigabe ab. Gewähren Sie nur erforderlichen Repository-Zugriff. Kehren Sie bei Desktop danach zur App zurück. Die Kontoverbindung ist projektübergreifend nutzbar, verknüpft aber nicht automatisch alle Repositories.

Der Eigentümer wählt im Git-Bereich der Projekteinstellungen ein verfügbares Repository und bestätigt. Prüfen Sie Anbieter, vollständigen Repository-Namen und angezeigtes handelndes Konto. Mitglieder können diese Eigentümerverknüpfung nicht ersetzen. Sie ermöglicht Repository-Kontext und serverseitige Codearbeit; Ticketsynchronisierung wird separat aktiviert.

![Nicht verbundene GitHub- und GitLab-Konten mit Autorisierungsschaltflächen.](/documentation/de/git-accounts-and-repositories-workflow.png)


## Fehlende Repositories oder abgelaufener Zugriff {#recovery}
Bei leerer Auswahl prüfen Sie Anbieterrechte und Freigabe der Organisation oder des Repositories. Verbinden Sie abgelaufene Konten erneut, statt Token in Tickets einzutragen. Das Entfernen der Verknüpfung verlangt Eigentümerrechte; lesen Sie die Bestätigung.

Self-Hosting kann ein konfiguriertes verwaltetes Relay oder betreibereigene Anbieter-Apps nutzen. Relay-Zugriff startet ausdrücklich und macht die Forge nicht lokal. Verfügbarkeit hängt von der Instanzkonfiguration ab. Prüfen Sie Betreiberregeln vor der Freigabe.

![Git-Einstellungen eines Projekts ohne verknüpftes Repository.](/documentation/de/git-accounts-and-repositories-project-workflow.png)
