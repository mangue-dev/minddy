---
{
  "id": "git",
  "locale": "de",
  "title": "Git-Repositories und Problemsynchronisierung",
  "summary": "Verbinden Sie ein Git-Konto, verknüpfen Sie ein Projekt-Repository und richten Sie die Problemsynchronisierung mit dem Anbieter ein.",
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
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "docs/github-issue-sync.md",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
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
    "Forge-Tickets synchronisieren"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "diagram",
      "src": "/documentation/de/git-connection-flow.svg",
      "alt": "Die Verbindung des persönlichen Kontos und die Verknüpfung eines Projekt-Repositories sind getrennte Schritte.",
      "caption": "Autorisieren Sie zuerst das Konto und verknüpfen Sie dann als Projektinhaber ein Repository.",
      "revision": 2,
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
            "detail": "Autorisieren Sie GitHub oder GitLab für die benötigten Repositories."
          },
          {
            "title": "Projektinhaber",
            "detail": "Wählen Sie in den Git-Einstellungen des Projekts ein verfügbares Repository."
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
      "revision": 2,
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
      "caption": "Das Demonstrationsrepository ist mit GitHub verknüpft. Die Issue-Synchronisierung ist noch ausgeschaltet. Prüfen Sie den Umfang und den vorhandenen Backlog vor der Aktivierung. Diese Aufnahme belegt keinen synchronisierten Import.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        278
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

Eine Git-Verbindung ermöglicht Repositoryzugriff und Code-Arbeit. Die Repositoryverknüpfung des Projekts und die Synchronisierung von Problemen sind getrennte Einstellungen. Dieser Leitfaden erklärt ihre Einrichtung und die Grenzen bei Rechten, übertragenen Daten und gleichzeitigen Änderungen.

## Git verbinden und ein Repository verknüpfen {#git-accounts-and-repositories}

Verbinden Sie GitHub oder GitLab in den Git-Kontoeinstellungen und schließen Sie die Browserfreigabe ab. Gewähren Sie nur erforderlichen Repository-Zugriff. Kehren Sie bei Desktop danach zur App zurück. Die Kontoverbindung ist projektübergreifend nutzbar, verknüpft aber nicht automatisch alle Repositories.

Der Eigentümer wählt im Git-Bereich der Projekteinstellungen ein verfügbares Repository und bestätigt. Prüfen Sie Anbieter, vollständigen Repository-Namen und angezeigtes handelndes Konto. Mitglieder können diese Eigentümerverknüpfung nicht ersetzen. Sie ermöglicht Repository-Kontext und serverseitige Codearbeit; Ticketsynchronisierung wird separat aktiviert.

![Die Verbindung des persönlichen Kontos und die Verknüpfung eines Projekt-Repositories sind getrennte Schritte.](/documentation/de/git-connection-flow.svg)

### Fehlende Repositories oder abgelaufener Zugriff {#recovery}

Bei leerer Auswahl prüfen Sie Anbieterrechte und Freigabe der Organisation oder des Repositories. Verbinden Sie abgelaufene Konten erneut, statt Token in Tickets einzutragen. Das Entfernen der Verknüpfung verlangt Eigentümerrechte; lesen Sie die Bestätigung.

Self-Hosting kann ein konfiguriertes verwaltetes Relay oder betreibereigene Anbieter-Apps nutzen. Relay-Zugriff startet ausdrücklich und macht die Forge nicht lokal. Verfügbarkeit hängt von der Instanzkonfiguration ab. Prüfen Sie Betreiberregeln vor der Freigabe.


## Forge-Tickets synchronisieren {#forge-issue-sync}

Öffnen Sie als Eigentümer nach der Repository-Verknüpfung den Git-Bereich. Aktivieren Sie die Synchronisierung mit erforderlichen Schreibrechten. Importierte Tickets landen in der Triage. Prüfen Sie den gemeldeten Nachimport sowie Titel, Beschreibung und Status eines bekannten Remote-Tickets.

Offen und geschlossen werden in beide Richtungen gespiegelt. Bei GitHub werden Titel und Inhalt zu Titel und Beschreibung; Labels liefern Kategorien sowie erkannte Priorität und Aufwand; der erste verknüpfte Bearbeiter wird verwendet, die Milestone-Frist als Fälligkeit. Kommentare behalten Remote-Autor, Identität, URL und Zeitpunkte. Blockierbeziehungen verlangen beide Tickets im selben importierten Projekt. Anhangs-URLs bleiben erhalten; Dateibytes und GitHub-Projektfelder besitzen keine native Entsprechung.

### Rechte, Konflikte und Abschalten {#forge-issue-sync-recovery}

Die GitHub App braucht Issues-Lese-/Schreibrechte und Abonnements für Issues, Issue comments und Issue dependencies. Bestehende Installationen müssen neue Rechte akzeptieren. Diese Zuordnung garantiert nicht sämtliche GitLab-Felder.

Ältere GitHub-Ereignisse mit Zeitstempel überschreiben keine neueren lokalen Änderungen. Eindeutige Liefer- und Kommentaridentitäten verhindern Duplikateffekte. Vergleichen Sie Zeitstempel sowie Anbieterereignisse und Betreiberlogs bei fehlendem Nachimport. Deaktivieren Sie im selben Eigentümerbereich; prüfen Sie bereits importierte Arbeit separat.

![GitHub-Synchronisierung mit Einrichtung, Ereignisprüfung, Import und Statusabgleich.](/documentation/de/forge-issue-sync-mapping.svg)

![Verknüpftes GitHub-Demonstrationsrepository mit deaktivierter Issue-Synchronisierung.](/documentation/de/forge-issue-sync-workflow.png)
