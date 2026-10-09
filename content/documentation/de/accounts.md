---
{
  "id": "accounts",
  "locale": "de",
  "title": "Konten",
  "summary": "Erstelle und schütze dein Konto, stelle den Zugriff wieder her und verwalte Profil, Einstellungen und Kontolöschung.",
  "topic": "Erste Schritte",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02",
    "A02",
    "S03",
    "A01",
    "A09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json",
      "app/(auth)/reset-password/page.tsx",
      "docs/self-hosting-auth.md",
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts",
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison)",
    "date": "2026-10-09"
  },
  "related": [
    "choose-an-instance",
    "projects",
    "authentication-and-email",
    "applications",
    "automation-settings",
    "transfer-between-instances"
  ],
  "aliases": [
    "account-access",
    "account-security",
    "account-recovery",
    "profile-and-preferences",
    "settings-and-data",
    "privacy-and-account-deletion"
  ],
  "tags": [
    "Ein Konto erstellen und anmelden",
    "Das Konto mit einem zweiten Faktor schützen",
    "Den Kontozugriff wiederherstellen",
    "Profil und Oberflächenpräferenzen ändern",
    "Analyse steuern und Konto sorgfältig löschen"
  ],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/de/auth-signup.png",
      "alt": "Registrierung per E-Mail mit Anbieterschaltflächen und dem ersten Schritt des dreistufigen Assistenten.",
      "caption": "Beginne auf der richtigen Instanz. Nach der E-Mail folgen Identität und Passwort; in dieser Aufnahme wurde keine Registrierung abgeschickt.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        428,
        522
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/de/auth-login.png",
      "alt": "Anmeldeformular mit dem Link zur Passwortwiederherstellung unter dem Passwortfeld.",
      "caption": "Starte die Wiederherstellung auf der Instanz deines Kontos. Das Formular zeigt keine übermittelten Zugangsdaten.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        428,
        588
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/account-security-workflow.png",
      "alt": "Karte zur Zwei-Faktor-Authentifizierung mit Aktivieren-Schaltfläche.",
      "caption": "Beginne hier, bestätige anschließend den Authenticator und bewahre die Wiederherstellungscodes sicher auf.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        227
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/account-security-enrollment-workflow.png",
      "alt": "Authenticator-Einrichtung vor der Codeprüfung.",
      "caption": "Authenticator-Einrichtung vor der Codeprüfung. Der echte QR-Code und der manuelle Schlüssel sind verdeckt; dieser vorläufige, unbestätigte Faktor wurde abgebrochen und entfernt.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        498
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/de/auth-recovery.png",
      "alt": "Formular zur Passwortwiederherstellung mit einer Beispieladresse und der Schaltfläche zum Senden des Links.",
      "caption": "Gib hier die E-Mail-Adresse deines Kontos ein. Die Beispieladresse wurde nicht übermittelt; die Aufnahme belegt weder die Zustellung noch eine erfolgreiche Wiederherstellung.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        428,
        326
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-workflow.png",
      "alt": "Profileinstellungen mit Avatar, Benutzername und schreibgeschützter E-Mail-Adresse.",
      "caption": "Speichere die geprüften Profiländerungen. Die E-Mail-Adresse bleibt schreibgeschützt.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        416
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-preferences-workflow.png",
      "alt": "Sprachauswahl und Schalter für helles, dunkles und Systemdesign.",
      "caption": "Die Kontosprache und die Sprache der öffentlichen Website werden getrennt eingestellt.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/privacy-and-account-deletion-workflow.png",
      "alt": "Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.",
      "caption": "Lies die Vorschau und exportiere gewünschte Daten, bevor du die Löschbestätigung öffnest.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        231
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "account-access-steps",
    "account-security-workflow",
    "account-security-enrollment-workflow",
    "account-recovery-steps",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Ein Konto gehört zu der Instanz, auf der es erstellt wurde. Dieser Leitfaden behandelt Anmeldung, zweiten Faktor, Wiederherstellung, Profil und Präferenzen sowie die Folgen einer Kontolöschung.

## Ein Konto erstellen und anmelden {#account-access}

Öffne die Anmelde- oder Registrierungsseite auf der Instanz, die du nutzen möchtest. Cloud und eine andere selbst gehostete Instanz haben getrennte Konten. Verfügbare Anmeldeverfahren und die Möglichkeit zur Registrierung hängen von der Authentifizierungskonfiguration der Instanz ab.

Bei der Registrierung per E-Mail gibst du zunächst deine Adresse ein und gehst zum Schritt für deine Identität weiter. Gib deinen vollständigen Namen ein; ein leerer Name oder nur Leerzeichen sind nicht zulässig. Du kannst außerdem einen Avatar wählen. Gehe anschließend zum Passwortschritt. Gib ein Passwort mit mindestens acht Zeichen, einem Kleinbuchstaben (a–z), einem Großbuchstaben (A–Z) und einer Ziffer ein und wiederhole es im Bestätigungsfeld. Sende diesen letzten Schritt ab, um das Konto zu erstellen. Wenn du die vorherigen Schritte verlässt, wird kein Konto angelegt. Ist eine E-Mail-Bestätigung erforderlich, öffne die Nachricht dieser Instanz. Folge ihrem Link und betätige die Bestätigungsschaltfläche auf der Bestätigungsseite. Das Öffnen des Links allein schließt die Bestätigung nicht ab: minddy verlangt diese bewusste Aktion, bevor das E-Mail-Token verbraucht wird.

Kehre zur vorgesehenen Anwendung zurück und melde dich an. Ein neu angemeldetes Konto kann ein eigenes Projekt erstellen oder eine Projekteinladung annehmen. Die Kenntnis einer Projekt-URL verleiht keine Mitgliedschaft.


![Registrierung per E-Mail mit Anbieterschaltflächen und dem ersten Schritt des dreistufigen Assistenten.](/documentation/de/auth-signup.png)

### Abmelden und fehlende E-Mails prüfen {#session-and-mail}

Öffne das Kontomenü, wähle die Abmeldung und bestätige sie. In der Desktop-App ist das Schließen eines Tabs oder Fensters nicht mit einer Abmeldung gleichzusetzen. Verwende das Kontomenü, wenn du die Sitzung beenden möchtest.

Kommt keine E-Mail an, prüfe Adresse, Spamordner und die Identität der Instanz. Bei Selbsthosting muss der Betreiber einen funktionierenden E-Mail-Versand für Auth eingerichtet haben; optionale Benachrichtigungs-E-Mails der Anwendung und die Auth-Bestätigung sind getrennte Funktionen. Eine abgelaufene Bestätigungsseite führt zurück zur Anmeldung, um einen neuen Link anzufordern. Leite Bestätigungs- oder Wiederherstellungslinks nicht zur Fehlerdiagnose weiter: Sie ermöglichen den Kontozugriff.

![Anmeldeformular mit dem Link zur Passwortwiederherstellung unter dem Passwortfeld.](/documentation/de/auth-login.png)

## Das Konto mit einem zweiten Faktor schützen {#account-security}

Öffnen Sie den Bereich Sicherheit in den Kontoeinstellungen und aktivieren Sie die Zwei-Faktor-Authentifizierung. Dieser zweite Faktor wird auch bei der Anmeldung über Google oder GitHub verlangt; die Anmeldung beim Anbieter ersetzt ihn nicht.

1. Scannen Sie den QR-Code mit einer TOTP-Authentifizierungsapp oder tragen Sie den angezeigten Einrichtungsschlüssel manuell ein. Nehmen Sie weder den QR-Code noch den Schlüssel in einen Screenshot auf.
2. Geben Sie den aktuellen sechsstelligen Code ein und bestätigen Sie ihn. Ist er abgelaufen, versuchen Sie den nächsten. Nach zu vielen Versuchen warten Sie vor einem neuen Versuch.
3. Bewahren Sie die Wiederherstellungscodes geschützt und ohne Ihr Telefon erreichbar auf. Jeder Code funktioniert einmal, und die Liste wird nur einmal angezeigt. Bestätigen Sie vor dem Abschluss, dass Sie die Codes gespeichert haben.

Die Aktivierung aktualisiert die aktuelle Sitzung und versucht, andere Sitzungen abzumelden. Wird nach der Annahme des Codes eine erneute Anmeldung verlangt, melden Sie sich wieder an und befolgen Sie die angezeigten Hinweise.

![Karte zur Zwei-Faktor-Authentifizierung mit Aktivieren-Schaltfläche.](/documentation/de/account-security-workflow.png)

### Wiederherstellen und ändern {#recovery}

Verwenden Sie während der Anmeldung einen aufbewahrten Wiederherstellungscode, wenn Ihr Telefon nicht verfügbar ist. Dadurch wird die Zwei-Faktor-Authentifizierung deaktiviert, und alle übrigen Codes werden ungültig. Richten Sie nach der Anmeldung Ihre Authentifizierungsapp erneut ein und speichern Sie die neuen Wiederherstellungscodes. Dieser Ablauf verspricht keine Kontowiederherstellung durch menschlichen Support.

Wenn Sie die Wiederherstellungscodes ersetzen, wird die vorherige Liste ungültig. Sowohl das Ersetzen als auch das absichtliche Deaktivieren erfordert die serverseitigen Prüfungen einer kürzlich erfolgten Anmeldung. Lesen Sie die Bestätigung: Nach dem Deaktivieren wird der zusätzliche Faktor nicht mehr verlangt, auch nicht bei einer Anmeldung über Google oder GitHub.

![Authenticator-Einrichtung vor der Codeprüfung.](/documentation/de/account-security-enrollment-workflow.png)

## Den Kontozugriff wiederherstellen {#account-recovery}

Verwende auf der Anmeldeseite der richtigen Instanz die Passwortwiederherstellung und gib die E-Mail-Adresse deines Kontos ein. Öffne die Nachricht zum Zurücksetzen, folge ihrem Link und bestätige die Zurücksetzung. Gib auf der Rücksetzseite dein neues Passwort ein und sende es ab. Prüfe anschließend, ob du dich auf derselben Instanz anmelden kannst.

Ein Rücksetzlink kann ablaufen oder keine aktive Sitzung mehr haben. Die Rücksetzseite zeigt diesen Zustand an und ermöglicht, einen weiteren Link anzufordern. Beginne mit einer neuen Nachricht, statt ein altes Lesezeichen erneut zu verwenden. Sende weder Link noch Cookies oder Passwort an den Support.


![Formular zur Passwortwiederherstellung mit einer Beispieladresse und der Schaltfläche zum Senden des Links.](/documentation/de/auth-recovery.png)

### MFA und weiterhin fehlender Zugriff {#mfa-recovery}

Ist die Zwei-Faktor-Authentifizierung aktiviert, hebt ein zurückgesetztes Passwort diese Anforderung nicht auf. Verwende deine Authentifizierungs-App. Ein bei der MFA-Einrichtung gespeicherter Wiederherstellungscode ist eine weitere Möglichkeit; seine Verwendung deaktiviert MFA. Behandle Wiederherstellungscodes als Geheimnisse und richte MFA nach dem wiederhergestellten Zugriff in den Sicherheitseinstellungen erneut ein.

Sind weder der zweite Faktor noch ein Wiederherstellungscode verfügbar, kontaktiere den Instanzbetreiber über dessen Supportkanal. Nenne die Instanzadresse und den angezeigten Fehler, ohne Authentifizierungstoken oder private Projektinhalte mitzuschicken. Bei fehlender Wiederherstellungs-E-Mail bitte den Betreiber, Auth-Weiterleitungs-URLs und SMTP-Versand zu prüfen. Erstelle kein zweites Konto in der Annahme, es würde Projekte oder Verbindungen des ursprünglichen Kontos übernehmen.

## Profil und Oberflächenpräferenzen ändern {#profile-and-preferences}

Öffnen Sie die Kontoeinstellungen im Kontomenü. Tragen Sie im Profil einen nicht leeren Anzeigenamen ein und speichern Sie. Die E-Mail-Adresse ist schreibgeschützt. Erzeugen Sie einen Avatar oder laden Sie ein Bild über die Avatar-Steuerung hoch. Warten Sie auf das Ergebnis und prüfen Sie ihn in einem Kommentar oder in der Mitgliederliste; derselbe Avatar gilt projekt- und gesprächsübergreifend. Folgen Sie bei abgewiesenen Dateien der Validierungsmeldung, statt sie wiederholt hochzuladen.

Das Quellbild darf höchstens 10 MiB groß sein. Der Server prüft lesbare Bilddaten, berücksichtigt die Orientierung und schneidet mittig auf einen WebP-Avatar mit 256 × 256 Pixeln zu.

![Profileinstellungen mit Avatar, Benutzername und schreibgeschützter E-Mail-Adresse.](/documentation/de/profile-and-preferences-workflow.png)

### Die Oberfläche einstellen {#preferences}

Wählen Sie in den Präferenzen Sprache und Design und prüfen Sie eine andere Seite. Die Kontosprache betrifft das angemeldete Produkt; die öffentliche Website besitzt eine eigene Sprachauswahl. Das Design wird im Konto geräteübergreifend gespeichert.

Wählen Sie das Sendetastenkürzel unter Tastatur. Es gilt für Kommentare und Numo. Nutzen Sie die Sendeschaltfläche, wenn das Betriebssystem das Kürzel abfängt; Modifikatortasten unterscheiden sich je Plattform. Ticketpräferenzen wie automatische Zuweisung und Status von Numo-Tickets gehören ebenfalls zum Konto und ändern keine Einstellungen anderer Mitglieder.

![Sprachauswahl und Schalter für helles, dunkles und Systemdesign.](/documentation/de/profile-and-preferences-preferences-workflow.png)

## Analyse steuern und Konto sorgfältig löschen {#privacy-and-account-deletion}

Wenn Analytics konfiguriert ist, zeigen die Kontoeinstellungen einen Zustimmungsschalter und einen Link zur Cookie-Richtlinie. Das Abschalten ändert die Zustimmung zur Messung auf diesem Gerät sofort und speichert die Auswahl im Konto. Eine bereits vorhandene lokale Entscheidung auf einem anderen Gerät kann dort weiterhin gelten. Ist kein Analytics-Dienst konfiguriert, fehlt der Bereich.

Die Zustimmung ist von den für den Kontobetrieb erforderlichen Daten getrennt. Lesen Sie die Datenschutzrichtlinie der Instanz und prüfen Sie aktivierte externe Anbieter. Beim selbst betriebenen minddy bestimmen Konfiguration und Richtlinien des Betreibers die Dienstziele. Analytics abzuschalten entfernt keine KI- oder Git-Integrationen.

![Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.](/documentation/de/privacy-and-account-deletion-workflow.png)

### Löschvorschau prüfen {#deletion}

Exportieren Sie vor der Kontolöschung benötigte Daten im Bereich Daten. Lesen Sie die Vorschau der von Ihnen besessenen Projekte, betroffenen Mitglieder, Tickets, Kommentare und des aktiven Abonnements. Folgen für eigene Projekte betreffen andere Menschen; klären Sie diese vor der Bestätigung.

Öffnen Sie die Löschbestätigung erst, wenn Sie bereit sind. Geben Sie Ihre Konto-E-Mail-Adresse und bei Passwortkonten das Passwort ein. Konten ohne Passwort benötigen eine kürzlich erfolgte Anmeldung. Befolgen Sie Hinweise auf eine abgelehnte erneute Authentifizierung, statt blind erneut zu versuchen. Eine erfolgreiche Löschung meldet das Konto ab und führt zur öffentlichen Website zurück. Dies ist kein wiederherstellbarer Papierkorb. Halten Sie Exporte privat und bearbeiten Sie verbleibende Abonnement- oder Anbieterfragen über die jeweiligen Abrechnungs- und Anbieterfunktionen.
