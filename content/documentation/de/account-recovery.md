---
{
  "id": "account-recovery",
  "locale": "de",
  "title": "Den Kontozugriff wiederherstellen",
  "summary": "Setze ein Passwort sicher zurück und erkenne, wann MFA oder die Hilfe des Instanzbetreibers weiterhin erforderlich ist.",
  "topic": "Erste Schritte",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 1,
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
      "app/(auth)/reset-password/page.tsx",
      "components/settings/account-security-section.tsx",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "account-security",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/de/auth-recovery.png",
      "alt": "Formular zur Passwortwiederherstellung mit einer Beispieladresse und der Schaltfläche zum Senden des Links.",
      "caption": "Gib hier die E-Mail-Adresse deines Kontos ein. Die Beispieladresse wurde nicht übermittelt; die Aufnahme belegt weder die Zustellung noch eine erfolgreiche Wiederherstellung.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-recovery-steps"
  ]
}
---

## Einen neuen Link zum Zurücksetzen anfordern {#account-recovery}

Verwende auf der Anmeldeseite der richtigen Instanz die Passwortwiederherstellung und gib die E-Mail-Adresse deines Kontos ein. Öffne die Nachricht zum Zurücksetzen, folge ihrem Link und bestätige die Zurücksetzung. Gib auf der Rücksetzseite dein neues Passwort ein und sende es ab. Prüfe anschließend, ob du dich auf derselben Instanz anmelden kannst.

Ein Rücksetzlink kann ablaufen oder keine aktive Sitzung mehr haben. Die Rücksetzseite zeigt diesen Zustand an und ermöglicht, einen weiteren Link anzufordern. Beginne mit einer neuen Nachricht, statt ein altes Lesezeichen erneut zu verwenden. Sende weder Link noch Cookies oder Passwort an den Support.


![Formular zur Passwortwiederherstellung mit einer Beispieladresse und der Schaltfläche zum Senden des Links.](/documentation/de/auth-recovery.png)

## MFA und weiterhin fehlender Zugriff {#mfa-recovery}

Ist die Zwei-Faktor-Authentifizierung aktiviert, hebt ein zurückgesetztes Passwort diese Anforderung nicht auf. Verwende deine Authentifizierungs-App. Ein bei der MFA-Einrichtung gespeicherter Wiederherstellungscode ist eine weitere Möglichkeit; seine Verwendung deaktiviert MFA. Behandle Wiederherstellungscodes als Geheimnisse und richte MFA nach dem wiederhergestellten Zugriff in den Sicherheitseinstellungen erneut ein.

Sind weder der zweite Faktor noch ein Wiederherstellungscode verfügbar, kontaktiere den Instanzbetreiber über dessen Supportkanal. Nenne die Instanzadresse und den angezeigten Fehler, ohne Authentifizierungstoken oder private Projektinhalte mitzuschicken. Bei fehlender Wiederherstellungs-E-Mail bitte den Betreiber, Auth-Weiterleitungs-URLs und SMTP-Versand zu prüfen. Erstelle kein zweites Konto in der Annahme, es würde Projekte oder Verbindungen des ursprünglichen Kontos übernehmen.
