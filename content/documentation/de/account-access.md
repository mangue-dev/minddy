---
{
  "id": "account-access",
  "locale": "de",
  "title": "Ein Konto erstellen und anmelden",
  "summary": "Verwende die richtige Instanz, bestätige deine E-Mail-Adresse und beende die Sitzung bewusst.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
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
      "app/(auth)/signup/page.tsx",
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "choose-an-instance",
    "account-recovery",
    "project-members"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/de/auth-signup.png",
      "alt": "Registrierung per E-Mail mit Anbieterschaltflächen und dem ersten Schritt des dreistufigen Assistenten.",
      "caption": "Beginne auf der richtigen Instanz. Nach der E-Mail folgen Identität und Passwort; in dieser Aufnahme wurde keine Registrierung abgeschickt.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        474
      ],
      "theme": "light"
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/de/auth-login.png",
      "alt": "Anmeldeformular mit dem Link zur Passwortwiederherstellung unter dem Passwortfeld.",
      "caption": "Starte die Wiederherstellung auf der Instanz deines Kontos. Das Formular zeigt keine übermittelten Zugangsdaten.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-access-steps"
  ]
}
---

## Registrieren und das Konto bestätigen {#account-access}

Öffne die Anmelde- oder Registrierungsseite auf der Instanz, die du nutzen möchtest. Cloud und eine andere selbst gehostete Instanz haben getrennte Konten. Verfügbare Anmeldeverfahren und die Möglichkeit zur Registrierung hängen von der Authentifizierungskonfiguration der Instanz ab.

Bei der Registrierung per E-Mail gibst du zunächst deine Adresse ein und gehst zum Schritt für deine Identität weiter. Gib deinen vollständigen Namen ein; ein leerer Name oder nur Leerzeichen sind nicht zulässig. Du kannst außerdem einen Avatar wählen. Gehe anschließend zum Passwortschritt. Gib ein Passwort mit mindestens acht Zeichen, einem Kleinbuchstaben (a–z), einem Großbuchstaben (A–Z) und einer Ziffer ein und wiederhole es im Bestätigungsfeld. Sende diesen letzten Schritt ab, um das Konto zu erstellen. Wenn du die vorherigen Schritte verlässt, wird kein Konto angelegt. Ist eine E-Mail-Bestätigung erforderlich, öffne die Nachricht dieser Instanz. Folge ihrem Link und betätige die Bestätigungsschaltfläche auf der Bestätigungsseite. Das Öffnen des Links allein schließt die Bestätigung nicht ab: Minddy verlangt diese bewusste Aktion, bevor das E-Mail-Token verbraucht wird.

Kehre zur vorgesehenen Anwendung zurück und melde dich an. Ein neu angemeldetes Konto kann ein eigenes Projekt erstellen oder eine Projekteinladung annehmen. Die Kenntnis einer Projekt-URL verleiht keine Mitgliedschaft.


![Registrierung per E-Mail mit Anbieterschaltflächen und dem ersten Schritt des dreistufigen Assistenten.](/documentation/de/auth-signup.png)

## Abmelden und fehlende E-Mails prüfen {#session-and-mail}

Öffne das Kontomenü, wähle die Abmeldung und bestätige sie. In der Desktop-App ist das Schließen eines Tabs oder Fensters nicht mit einer Abmeldung gleichzusetzen. Verwende das Kontomenü, wenn du die Sitzung beenden möchtest.

Kommt keine E-Mail an, prüfe Adresse, Spamordner und die Identität der Instanz. Bei Selbsthosting muss der Betreiber einen funktionierenden E-Mail-Versand für Auth eingerichtet haben; optionale Benachrichtigungs-E-Mails der Anwendung und die Auth-Bestätigung sind getrennte Funktionen. Eine abgelaufene Bestätigungsseite führt zurück zur Anmeldung, um einen neuen Link anzufordern. Leite Bestätigungs- oder Wiederherstellungslinks nicht zur Fehlerdiagnose weiter: Sie ermöglichen den Kontozugriff.

![Anmeldeformular mit dem Link zur Passwortwiederherstellung unter dem Passwortfeld.](/documentation/de/auth-login.png)
