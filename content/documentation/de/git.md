---
{
  "id": "git",
  "locale": "de",
  "title": "Git-Repositories und Issue-Synchronisierung",
  "summary": "Verbinde ein Git-Konto, verknüpfe ein Projekt-Repository und richte die Issue-Synchronisierung mit dem Anbieter ein.",
  "topic": "Numo und Integrationen",
  "type": "guide",
  "audiences": [
    "owner",
    "member",
    "integrator"
  ],
  "workflows": [
    "N10",
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 6,
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "docs/github-issue-sync.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "git-accounts-and-repositories",
    "integrations",
    "forge-issue-sync"
  ],
  "tags": [
    "Git verbinden und ein Repository verknüpfen",
    "Forge-Issues synchronisieren"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "diagram",
      "src": "/documentation/de/git-connection-flow.svg",
      "alt": "Die Verbindung des persönlichen Kontos und die Verknüpfung eines Projekt-Repositories sind getrennte Schritte.",
      "caption": "Autorisiere zuerst das Konto und verknüpfe dann als Projektinhaber ein Repository.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        580
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Konto verbinden, dann Repository verknüpfen",
        "items": [
          {
            "title": "Persönliches Git-Konto",
            "detail": "Autorisiere GitHub oder GitLab für die benötigten Repositories."
          },
          {
            "title": "Projektinhaber",
            "detail": "Wähle in den Git-Einstellungen des Projekts ein verfügbares Repository."
          },
          {
            "title": "Verknüpftes Repository",
            "detail": "Aurora → aurora/web. Die Synchronisierung von Issues ist eine separate Entscheidung."
          }
        ]
      }
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/de/forge-issue-sync-mapping.svg",
      "alt": "GitHub-Synchronisierung mit Einrichtung, Ereignisprüfung, Import und Statusabgleich.",
      "caption": "GitHub-Ereignisse bewahren neuere Änderungen und verhindern doppelte Zustellungen. GitLab-Zuordnungen sind separat zu prüfen.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "GitHub-Issue-Synchronisierung",
        "items": [
          {
            "title": "Einrichtung durch den Inhaber",
            "detail": "Repository verknüpfen, Issues lesen/schreiben erlauben und Synchronisierung aktivieren."
          },
          {
            "title": "Eingehende Ereignisse",
            "detail": "Zustellungs-IDs deduplizieren; ältere Daten überschreiben keine neueren lokalen Änderungen."
          },
          {
            "title": "Import und Zuordnung",
            "detail": "Importierte Issues landen in der Triage. Titel/Text werden Titel/Beschreibung; Labels liefern Kategorien und erkannte Priorität/Aufwand."
          },
          {
            "title": "Statusabgleich",
            "detail": "Offen/geschlossen wird in beide Richtungen gespiegelt. Bei konkurrierenden Änderungen Zeitstempel vergleichen."
          }
        ],
        "note": "Kommentare behalten die entfernte Identität und werden nicht doppelt angelegt. GitLab-Zuordnungen können abweichen."
      }
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/forge-issue-sync-workflow.png",
      "alt": "Verknüpftes GitHub-Demonstrationsrepository mit deaktivierter Issue-Synchronisierung.",
      "caption": "Das Demonstrationsrepository ist mit GitHub verknüpft. Die Issue-Synchronisierung ist noch ausgeschaltet. Prüfe den Umfang und den vorhandenen Backlog vor der Aktivierung. Diese Aufnahme belegt keinen synchronisierten Import.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

Ein persönliches Git-Konto zu verbinden, ein Projekt-Repository zu verknüpfen und Forge-Issues zu synchronisieren sind getrennte Aktionen. Autorisiere zuerst das Konto. Danach wählt der Projekteigentümer das Repository und kann die Synchronisierung mit den erforderlichen Anbieterrechten aktivieren.

## Git verbinden und ein Repository verknüpfen {#git-accounts-and-repositories}

Verbinde GitHub oder GitLab in den Git-Kontoeinstellungen und schließe die Browserfreigabe ab. Gewähre nur erforderlichen Repository-Zugriff. Kehre bei Desktop danach zur App zurück. Die Kontoverbindung ist projektübergreifend nutzbar, verknüpft aber nicht automatisch alle Repositories.

Der Eigentümer wählt im Git-Bereich der Projekteinstellungen ein verfügbares Repository und bestätigt. Prüfe Anbieter, vollständigen Repository-Namen und angezeigtes handelndes Konto. Mitglieder können diese Eigentümerverknüpfung nicht ersetzen. Sie ermöglicht Repository-Kontext, die Verfolgung von Pull Requests und Repository-Skills; Issue-Synchronisierung wird separat aktiviert.

![Die Verbindung des persönlichen Kontos und die Verknüpfung eines Projekt-Repositories sind getrennte Schritte.](/documentation/de/git-connection-flow.svg)

### Fehlende Repositories oder abgelaufener Zugriff {#recovery}

Bei leerer Auswahl prüfe Anbieterrechte und Freigabe der Organisation oder des Repositories. Verbinde abgelaufene Konten erneut, statt Token in Tickets einzutragen. Das Entfernen der Verknüpfung verlangt Eigentümerrechte; lies die Bestätigung.

Self-Hosting kann ein konfiguriertes verwaltetes Relay oder betreibereigene Anbieter-Apps nutzen. Relay-Zugriff startet ausdrücklich und macht die Forge nicht lokal. Verfügbarkeit hängt von der Instanzkonfiguration ab. Prüfe Betreiberregeln vor der Freigabe.


## Forge-Issues synchronisieren {#forge-issue-sync}

Öffne als Eigentümer nach der Repository-Verknüpfung den Git-Bereich. Aktiviere die Synchronisierung mit erforderlichen Schreibrechten. Importierte Forge-Issues landen als Tickets in der Triage. Prüfe den gemeldeten Nachimport sowie Titel, Beschreibung und Status eines bekannten Remote-Issues.

Offen und geschlossen werden in beide Richtungen gespiegelt. Bei GitHub werden Titel und Inhalt zu Titel und Beschreibung; Labels liefern Kategorien sowie erkannte Priorität und Aufwand; der erste verknüpfte Bearbeiter wird verwendet, die Milestone-Frist als Fälligkeit. Kommentare behalten Remote-Autor, Identität, URL und Zeitpunkte. Blockierbeziehungen verlangen beide Tickets im selben importierten Projekt. Anhangs-URLs bleiben erhalten; Dateibytes und GitHub-Projektfelder besitzen keine native Entsprechung.

### Rechte, Konflikte und Abschalten {#forge-issue-sync-recovery}

Die GitHub App braucht Issues-Lese-/Schreibrechte und Abonnements für Issues, Issue comments und Issue dependencies. Bestehende Installationen müssen neue Rechte akzeptieren. Diese Zuordnung garantiert nicht sämtliche GitLab-Felder.

Ältere GitHub-Ereignisse mit Zeitstempel überschreiben keine neueren lokalen Änderungen. Eindeutige Liefer- und Kommentaridentitäten verhindern Duplikateffekte. Vergleiche Zeitstempel sowie Anbieterereignisse und Betreiberlogs bei fehlendem Nachimport. Deaktiviere im selben Eigentümerbereich; prüfe bereits importierte Arbeit separat.

![GitHub-Synchronisierung mit Einrichtung, Ereignisprüfung, Import und Statusabgleich.](/documentation/de/forge-issue-sync-mapping.svg)

![Verknüpftes GitHub-Demonstrationsrepository mit deaktivierter Issue-Synchronisierung.](/documentation/de/forge-issue-sync-workflow.png)
