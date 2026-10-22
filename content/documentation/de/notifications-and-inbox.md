---
{
  "id": "notifications-and-inbox",
  "locale": "de",
  "title": "Posteingang und Benachrichtigungen",
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
  "revision": 9,
  "sourceRevision": 8,
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx",
      "components/notification-badge.tsx",
      "components/settings/account-settings-page.tsx",
      "lib/server/notifications.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of notifications-and-inbox-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Benachrichtigungen und Einladungen im Posteingang verfolgen"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/de/work-inbox.png",
      "alt": "Posteingang mit Beispiel-Erwähnungen, Zuweisungen und Kommentaren sowie gelesenen und ungelesenen Einträgen.",
      "caption": "Die Beispielaktivität zeigt Autor, Ticket und Lesestatus. Alle enthält gelesene und ungelesene Benachrichtigungen.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Den Posteingang lesen {#notifications-and-inbox}

Öffne den Posteingang über sein Symbol in der oberen Leiste, auf dem Smartphone über seine Zeile in der Seitenleiste oder mit G und dann I außerhalb eines Textfelds. Eine rote Zahl am Symbol zählt ungelesene Benachrichtigungen und ausstehende Einladungen zusammen; eine installierte PWA zeigt dieselbe Zahl auf ihrem App-Symbol. Der Posteingang öffnet sich als Popover, auf dem Smartphone als Sheet, und gruppiert Benachrichtigungen unter Heute, Gestern und Früher.

Er öffnet sich mit dem Filter Ungelesen. Alle zeigt auch gelesene Benachrichtigungen, und Erwähnungen behält nur Erwähnungen in Kommentaren und Seiten. Wähle einen Eintrag, um das zugrunde liegende Ticket, die Seite oder den Pull Request zu öffnen. Das Öffnen einer Benachrichtigung markiert sie als gelesen. Ihre Zeile bietet außerdem Als gelesen markieren oder Als ungelesen markieren, und Alle als gelesen markieren in der Kopfzeile des Posteingangs entfernt alle Ungelesen-Markierungen. Ungelesen stellt die Aktivitätsmarkierung wieder her, macht aber die zugrunde liegende Änderung am Ticket oder an der Seite nicht rückgängig. Eine Benachrichtigung verweist auf zugängliche Arbeit, ersetzt aber nicht deren aktuellen Inhalt.

Löschen in einer Zeile entfernt diese Benachrichtigung nach einer Bestätigung, und Gelesen löschen in der Kopfzeile entfernt nach einer Bestätigung alle gelesenen Benachrichtigungen. Beide Löschungen sind endgültig; ungelesene Benachrichtigungen bleiben, und das Ticket, die Seite oder der Pull Request, auf die eine Benachrichtigung verweist, bleibt unberührt.

Ausstehende Projekteinladungen erscheinen unter Einladungen in den Filtern Ungelesen und Alle. Nimm sie an oder lehne sie ab, nachdem du das Projekt und die einladende Person geprüft hast. Alte Posteingangslinks öffnen den aktuellen Einstiegspunkt, keine gesonderte Seite.

![Posteingang mit Beispiel-Erwähnungen, Zuweisungen und Kommentaren sowie gelesenen und ungelesenen Einträgen.](/documentation/de/work-inbox.png)

## Benachrichtigungskanäle wählen {#notification-preferences}

Wähle Posteingangseinstellungen in der Kopfzeile des Posteingangs oder öffne Kontoeinstellungen und dort den Tab Benachrichtigungen. Unter Posteingangsbenachrichtigungen legt ein Schalter pro Kategorie (Zuweisungen, Erwähnungen, Kommentare, Numo, Routinen, Pull Requests, Feedback und Seiten) fest, was in deinem Posteingang landet. Das Abschalten einer Kategorie stoppt künftige Benachrichtigungen dieser Art einschließlich ihrer Push-Nachrichten; bereits erhaltene Benachrichtigungen bleiben erhalten.

Der Abschnitt Push-Benachrichtigungen im selben Tab listet die Geräte, die Hinweise erhalten. Zustellung über Browser, PWA oder Desktop benötigt außerdem eine Geräteregistrierung und die Erlaubnis des Betriebssystems. Ein Gerät abzuschalten oder zu entfernen stoppt Hinweise nur auf diesem Gerät; dein Posteingang und seine Kategorien bleiben unverändert.

Führt eine Benachrichtigung zu nicht verfügbarem Inhalt, prüfe geänderte Projektmitgliedschaft oder eine Löschung des Objekts. Bei fehlenden Push-Nachrichten prüfe Geräteerlaubnis und Registrierung anhand der Gerätebenachrichtigungs-Anleitung; der Posteingang bleibt hilfreich zur Prüfung der Aktivität. Versende niemals Sitzungscookies oder private Benachrichtigungsinhalte als Diagnose-Bildschirmaufnahmen.
