---
{
  "id": "devices-and-notifications",
  "locale": "de",
  "title": "Gerätebenachrichtigungen aktivieren",
  "summary": "Das Gerät registrieren, Zustellung testen und Browser- von nativer Unterstützung unterscheiden.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
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
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "public/sw.js",
      "content/documentation/reviews/push-registration-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/devices-and-notifications-workflow.png",
      "alt": "Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.",
      "caption": "Dieser Browser blockiert Benachrichtigungen. Erlauben Sie sie in den Website-Einstellungen, bevor Sie das Gerät registrieren.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/devices-and-notifications-registered.png",
      "alt": "Aktives, für das Konto registriertes Browser-Gerät mit dem tatsächlichen Datum des letzten Versands.",
      "caption": "Für das Konto ist ein aktives Browser-Gerät registriert. Die Liste zeigt das Registrierungsdatum und den letzten Versand. Ob ein Banner erscheint, hängt weiterhin von der Browserberechtigung und den Betriebssystemeinstellungen ab.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

## Aktivieren und testen {#devices-and-notifications}

Öffnen Sie die Benachrichtigungen in den Kontoeinstellungen auf dem Gerät, das Sie registrieren möchten. Aktivieren Sie sie und erlauben Sie die Anfrage des Browsers oder Betriebssystems. Eine verweigerte Erlaubnis müssen Sie in den Browser- oder Systemeinstellungen ändern; wiederholtes Betätigen des Minddy-Schalters kann sie nicht umgehen. Installieren und öffnen Sie unter iOS zuerst die Web-App, wenn die Oberfläche dies verlangt.

Prüfen Sie, ob das Gerät in der Liste erscheint, und verwenden Sie seinen Testbefehl. Lesen Sie die Angaben zur letzten Zustellung. Sie können einzelne Registrierungen deaktivieren oder entfernen, ohne das Konto zu löschen. Die Einstellungen des Posteingangs bestimmen, welche Ereignisse Sie benachrichtigen. Der Posteingang in der Anwendung bleibt verfügbar, wenn Push nicht verfügbar ist.

![Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.](/documentation/de/devices-and-notifications-workflow.png)


## Plattformbedingungen {#platforms}

Web-Push erfordert einen unterstützten Browser und einen konfigurierten Push-Dienst der Instanz. Native Hinweise und Hintergrundzustellung unterscheiden sich je nach Plattform. Die signierte macOS-Anwendung als Installationspaket unterstützt APNs; das Windows-Paket benötigt den optionalen WNS-Helfer für den Hintergrundtransport. Linux verwendet die Hintergrundsitzung der installierten Anwendung statt APNs oder WNS.

Prüfen Sie die Benachrichtigungserlaubnis des Betriebssystems, den Installationszustand im Browser und die angezeigte Erklärung, falls die Funktion nicht eingerichtet oder nicht unterstützt ist. Ein erfolgreicher Test garantiert keine Zustellung ohne Netz oder unter sämtlichen Hintergrundbeschränkungen des Betriebssystems. Halten Sie die Anwendung oder ihren eingerichteten Hintergrunddienst entsprechend den Anforderungen der Plattform verfügbar.

![Aktives, für das Konto registriertes Browser-Gerät mit dem tatsächlichen Datum des letzten Versands.](/documentation/de/devices-and-notifications-registered.png)
