---
{
  "id": "publish-a-feedback-board",
  "locale": "de",
  "title": "Ein Feedback-Board veröffentlichen",
  "summary": "Als Eigentümer Besucherkanal, Identität, Anzeige und Prüfung konfigurieren.",
  "topic": "Feedback und Anfragen",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "F01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "feedback"
  ],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/publish-a-feedback-board-workflow.png",
      "alt": "Aktiviertes öffentliches Feedback-Board mit lokaler SSO-Identität und ausgeblendeter URL.",
      "caption": "Der Eigentümer aktiviert das Board und wählt die Besucheridentität. Dieses Beispiel verwendet einen lokalen SSO-Signierer; URL und Signaturgeheimnis sind ausgeblendet.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow"
  ]
}
---

## Einrichten und öffnen {#publish-a-feedback-board}

Öffnen Sie als Projektinhaber Feedback in den Projekteinstellungen. Schließen Sie die Einrichtung ab, falls noch kein Board existiert, und aktivieren Sie dann den öffentlichen Board-Kanal. Kopieren Sie die öffentliche URL und öffnen Sie sie in einem abgemeldeten Browser, um die Besucheransicht zu prüfen. Mitglieder können die Einstellungen einsehen, aber weder die Veröffentlichung ändern noch Tokens erneuern oder das SSO-Geheimnis verwalten.

Wählen Sie, ob Besucher sich mit einem E-Mail-Code oder über das konfigurierte SSO identifizieren. Konfigurieren Sie öffentliche Kommentare, die Kategorienanzeige und ausgewählte öffentliche Seiten- oder Ansichtstabs. Prüfen Sie die sichtbaren Daten, bevor Sie die URL weitergeben. Besucher können ohne Identifikation lesen; Beiträge, Stimmen und Kommentare erfordern eine Board-Identität. Öffentliche Darstellungen zeigen weder E-Mail-Adresse noch echten Namen der Besucher. Das Team kann identifizierte Rückmeldungen dennoch intern bearbeiten.


## Veröffentlichung und Eingang trennen {#channels}

Wenn Sie das Board deaktivieren, sind seine Besucherseiten nicht mehr erreichbar. Die Server-zu-Server-Erfassung verwendet einen separaten Feedback-Integrationsschlüssel und kann ohne öffentliches Board weiterlaufen. Auch die gewählte Sichtbarkeit eines Beitrags, sein Prüfstatus und sein Spamstatus bestimmen, ob er sichtbar ist. Ein aktiviertes Board veröffentlicht allein noch nicht jeden Beitrag.

Die optionale Numo-Prüfung betrifft eingereichtes Feedback und hängt von Projekt- und Instanzeinstellungen, Anbietern und dem Budget des Inhabers ab. Ist sie aktiviert, warten Einreichungen vor der Veröffentlichung auf die Prüfung; andernfalls warten sie nicht auf eine Prüfung, die gar nicht stattfindet. Prüfen Sie die Warteschlange nach einer Demoeinreichung. Numo sendet öffentliche Antworten nur nach ausdrücklicher Aufforderung.

![Aktiviertes öffentliches Feedback-Board mit lokaler SSO-Identität und ausgeblendeter URL.](/documentation/de/publish-a-feedback-board-workflow.png)
