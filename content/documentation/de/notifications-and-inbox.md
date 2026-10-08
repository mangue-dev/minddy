---
{
  "id": "notifications-and-inbox",
  "locale": "de",
  "title": "Benachrichtigungen und Einladungen im Posteingang verfolgen",
  "summary": "Prüfe ungelesene Aktivität und Erwähnungen und passe anschließend die Benachrichtigungseinstellungen an.",
  "topic": "Arbeit planen und finden",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "devices-and-notifications",
    "profile-and-preferences"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-inbox.png",
      "alt": "Posteingang-Tabs und leere Liste ungelesener Einträge.",
      "caption": "Ein leerer Tab Ungelesen bedeutet, dass diese Ansicht keine ungelesenen Einträge enthält. Unter Alle findest du weitere gespeicherte Benachrichtigungen.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Den Posteingang lesen {#notifications-and-inbox}

Öffne den Posteingang über die Navigation. Sein Popover gruppiert Benachrichtigungen nach Datum und bietet Filter für ungelesene, alle und Erwähnungen. Wähle einen Eintrag, um das zugrunde liegende Problem oder die Seite zu prüfen, und kontrolliere den Lesestatus. Das Öffnen einer Benachrichtigung markiert sie als gelesen. Ihre Zeile bietet auch Funktionen zum Markieren als gelesen oder ungelesen; im Popover kannst du alle Benachrichtigungen als gelesen markieren. Ungelesen stellt die Aktivitätsmarkierung wieder her, macht aber die zugrunde liegende Änderung am Problem oder an der Seite nicht rückgängig. Eine Benachrichtigung verweist auf zugängliche Arbeit, ersetzt aber nicht deren aktuellen Inhalt.

Ausstehende Projekteinladungen erscheinen ebenfalls im Posteingang. Nimm sie an oder lehne sie ab, nachdem du Projekt und Konto geprüft hast. Alte Posteingangslinks öffnen den aktuellen Einstiegspunkt, keine gesonderte Seite.

![Posteingang-Tabs und leere Liste ungelesener Einträge.](/documentation/de/work-inbox.png)

## Benachrichtigungskanäle wählen {#notification-preferences}

Öffne die Benachrichtigungseinstellungen deines Kontos, um die empfangene Aktivität anzupassen. Zustellung über Browser, PWA oder Desktop benötigt außerdem eine Geräteregistrierung und die Erlaubnis des Betriebssystems. Das Abschalten eines Gerätekanals ist etwas anderes als das Ändern der Aktivitätsfilter in der Anwendung.

Führt eine Benachrichtigung zu nicht verfügbarem Inhalt, prüfe geänderte Projektmitgliedschaft oder eine Löschung des Objekts. Bei fehlenden Push-Nachrichten prüfe Geräteerlaubnis und Registrierung anhand der Gerätebenachrichtigungs-Anleitung; der Posteingang bleibt hilfreich zur Prüfung der Aktivität. Versende niemals Sitzungscookies oder private Benachrichtigungsinhalte als Diagnose-Bildschirmaufnahmen.
