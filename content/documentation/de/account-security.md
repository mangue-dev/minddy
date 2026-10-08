---
{
  "id": "account-security",
  "locale": "de",
  "title": "Das Konto mit einem zweiten Faktor schützen",
  "summary": "Einen Authenticator bestätigen und Wiederherstellungscodes vor Abschluss sichern.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A02"
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
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/account-security-workflow.png",
      "alt": "Karte zur Zwei-Faktor-Authentifizierung mit Aktivieren-Schaltfläche.",
      "caption": "Beginne hier, bestätige anschließend den Authenticator und bewahre die Wiederherstellungscodes sicher auf.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/account-security-enrollment-workflow.png",
      "alt": "Authenticator-Einrichtung vor der Codeprüfung.",
      "caption": "Authenticator-Einrichtung vor der Codeprüfung. Der echte QR-Code und der manuelle Schlüssel sind verdeckt; dieser vorläufige, unbestätigte Faktor wurde abgebrochen und entfernt.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "account-security-enrollment-workflow"
  ]
}
---

## Einrichten und bestätigen {#account-security}

Öffnen Sie den Bereich Sicherheit in den Kontoeinstellungen und aktivieren Sie die Zwei-Faktor-Authentifizierung. Dieser zweite Faktor wird auch bei der Anmeldung über Google oder GitHub verlangt; die Anmeldung beim Anbieter ersetzt ihn nicht.

1. Scannen Sie den QR-Code mit einer TOTP-Authentifizierungsapp oder tragen Sie den angezeigten Einrichtungsschlüssel manuell ein. Nehmen Sie weder den QR-Code noch den Schlüssel in einen Screenshot auf.
2. Geben Sie den aktuellen sechsstelligen Code ein und bestätigen Sie ihn. Ist er abgelaufen, versuchen Sie den nächsten. Nach zu vielen Versuchen warten Sie vor einem neuen Versuch.
3. Bewahren Sie die Wiederherstellungscodes geschützt und ohne Ihr Telefon erreichbar auf. Jeder Code funktioniert einmal, und die Liste wird nur einmal angezeigt. Bestätigen Sie vor dem Abschluss, dass Sie die Codes gespeichert haben.

Die Aktivierung aktualisiert die aktuelle Sitzung und versucht, andere Sitzungen abzumelden. Wird nach der Annahme des Codes eine erneute Anmeldung verlangt, melden Sie sich wieder an und befolgen Sie die angezeigten Hinweise.

![Karte zur Zwei-Faktor-Authentifizierung mit Aktivieren-Schaltfläche.](/documentation/de/account-security-workflow.png)


## Wiederherstellen und ändern {#recovery}

Verwenden Sie während der Anmeldung einen aufbewahrten Wiederherstellungscode, wenn Ihr Telefon nicht verfügbar ist. Dadurch wird die Zwei-Faktor-Authentifizierung deaktiviert, und alle übrigen Codes werden ungültig. Richten Sie nach der Anmeldung Ihre Authentifizierungsapp erneut ein und speichern Sie die neuen Wiederherstellungscodes. Dieser Ablauf verspricht keine Kontowiederherstellung durch menschlichen Support.

Wenn Sie die Wiederherstellungscodes ersetzen, wird die vorherige Liste ungültig. Sowohl das Ersetzen als auch das absichtliche Deaktivieren erfordert die serverseitigen Prüfungen einer kürzlich erfolgten Anmeldung. Lesen Sie die Bestätigung: Nach dem Deaktivieren wird der zusätzliche Faktor nicht mehr verlangt, auch nicht bei einer Anmeldung über Google oder GitHub.

![Authenticator-Einrichtung vor der Codeprüfung.](/documentation/de/account-security-enrollment-workflow.png)
