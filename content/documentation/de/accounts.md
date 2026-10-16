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
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "app/api/account/route.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-691-session-expiry.md",
      "supabase/migrations/20270109200046_list_auth_sessions.sql",
      "content/documentation/reviews/sign-out-other-devices.md"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root (session list and sign-out-other-devices control source and test review; unchanged controls retain prior capture evidence)",
    "language": "agent:/root (de changed-text and retained-meaning self-review)",
    "date": "2026-10-16"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/account-security-workflow.png",
      "alt": "Karte zur Zwei-Faktor-Authentifizierung mit Aktivieren-Schaltfläche.",
      "caption": "Beginne hier, bestätige anschließend den Authenticator und bewahre die Wiederherstellungscodes sicher auf.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        227
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-workflow.png",
      "alt": "Profileinstellungen mit Avatar, Benutzername und schreibgeschützter E-Mail-Adresse.",
      "caption": "Speichere die geprüften Profiländerungen. Die E-Mail-Adresse bleibt schreibgeschützt.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        416
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-preferences-workflow.png",
      "alt": "Sprachauswahl und Schalter für helles, dunkles und Systemdesign.",
      "caption": "Die Kontosprache und die Sprache der öffentlichen Website werden getrennt eingestellt.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/privacy-and-account-deletion-workflow.png",
      "alt": "Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.",
      "caption": "Lies die Vorschau und exportiere gewünschte Daten, bevor du die Löschbestätigung öffnest.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        231
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow",
    "privacy-and-account-deletion-workflow"
  ]
}
---

Ein Konto gehört zu der Instanz, auf der du dich registriert hast. Hier verwaltest du Anmeldung, Zwei-Faktor-Authentifizierung, Wiederherstellung und persönliche Einstellungen. Prüfe vor einer Kontolöschung den Datenexport und die Folgen für deine Projekte.

## Ein Konto erstellen und anmelden {#account-access}

Öffne die Anmelde- oder Registrierungsseite auf der Instanz, die du nutzen möchtest. Cloud und eine andere selbst gehostete Instanz haben getrennte Konten. Verfügbare Anmeldeverfahren und die Möglichkeit zur Registrierung hängen von der Authentifizierungskonfiguration der Instanz ab.

Bei der Registrierung per E-Mail gibst du zunächst deine Adresse ein und gehst zum Schritt für deine Identität weiter. Gib deinen vollständigen Namen ein; ein leerer Name oder nur Leerzeichen sind nicht zulässig. Du kannst außerdem einen Avatar wählen. Gehe anschließend zum Passwortschritt. Gib ein Passwort mit mindestens acht Zeichen, einem Kleinbuchstaben (a–z), einem Großbuchstaben (A–Z) und einer Ziffer ein und wiederhole es im Bestätigungsfeld. Sende diesen letzten Schritt ab, um das Konto zu erstellen. Wenn du die vorherigen Schritte verlässt, wird kein Konto angelegt. Ist eine E-Mail-Bestätigung erforderlich, öffne die Nachricht dieser Instanz. Folge ihrem Link und betätige die Bestätigungsschaltfläche auf der Bestätigungsseite. Das Öffnen des Links allein schließt die Bestätigung nicht ab: minddy verlangt diese bewusste Aktion, bevor das E-Mail-Token verbraucht wird.

Kehre zur vorgesehenen Anwendung zurück und melde dich an. Ein neu angemeldetes Konto kann ein eigenes Projekt erstellen oder eine Projekteinladung annehmen. Die Kenntnis einer Projekt-URL verleiht keine Mitgliedschaft.


### Abmelden und fehlende E-Mails prüfen {#session-and-mail}

Öffne das Kontomenü, wähle die Abmeldung und bestätige sie. In der Desktop-App ist das Schließen eines Tabs oder Fensters nicht mit einer Abmeldung gleichzusetzen. Verwende das Kontomenü, wenn du die Sitzung beenden möchtest.

Eine Sitzung bleibt angemeldet, solange du minddy nutzt, höchstens ein Jahr, und endet nach 30 Tagen ohne Nutzung. Endet sie oder wird sie auf einem anderen Gerät beendet, kehrt minddy mit dem Hinweis, dass deine Sitzung abgelaufen ist, zur Anmeldung zurück. Melde dich erneut an, um dort weiterzumachen, wo du warst.

Die Gruppe **Sitzungen** im Tab **Sicherheit** der Kontoeinstellungen listet die Browser und Desktop-Apps auf, die bei deinem Konto angemeldet sind, markiert das Gerät, das du gerade nutzt, und zeigt, wann jedes andere zuletzt aktiv war. Um alle anderen Sitzungen zu beenden, etwa auf einem verlorenen Laptop oder einem gemeinsam genutzten Computer, wähle dort **Andere Geräte abmelden** und bestätige. Jeder andere Browser und jede Desktop-App, die bei deinem Konto angemeldet sind, kehren zur Anmeldung zurück; das Gerät, das du gerade nutzt, bleibt angemeldet. Apps, die du unter **minddy-MCP** → **Verbundene Apps** autorisiert hast, behalten ihren Zugriff, bis du ihn dort widerrufst.

Kommt keine E-Mail an, prüfe Adresse, Spamordner und die Identität der Instanz. Bei Selbsthosting muss der Betreiber einen funktionierenden E-Mail-Versand für Auth eingerichtet haben; optionale Benachrichtigungs-E-Mails der Anwendung und die Auth-Bestätigung sind getrennte Funktionen. Eine abgelaufene Bestätigungsseite führt zurück zur Anmeldung, um einen neuen Link anzufordern. Leite Bestätigungs- oder Wiederherstellungslinks nicht zur Fehlerdiagnose weiter: Sie ermöglichen den Kontozugriff.


## Das Konto mit einem zweiten Faktor schützen {#account-security}

Öffne den Bereich Sicherheit in den Kontoeinstellungen und aktiviere die Zwei-Faktor-Authentifizierung. Der zweite Faktor gilt auch bei der Anmeldung über Google oder GitHub; die Anmeldung beim Anbieter ersetzt ihn nicht.

1. Scanne den QR-Code mit einer TOTP-Authentifizierungsapp oder trage den angezeigten Einrichtungsschlüssel manuell ein. Nimm weder den QR-Code noch den Schlüssel in einen Screenshot auf.
2. Gib den aktuellen sechsstelligen Code ein und bestätige ihn. Ist er abgelaufen, versuche den nächsten. Warte nach zu vielen Versuchen, bevor du es erneut versuchst.
3. Bewahre die Wiederherstellungscodes geschützt und ohne dein Telefon erreichbar auf. Jeder Code funktioniert einmal, und die Liste wird nur einmal angezeigt. Bestätige vor dem Abschluss, dass du die Codes gespeichert hast.

Die Aktivierung aktualisiert die aktuelle Sitzung und versucht, andere Sitzungen abzumelden. Wird nach der Annahme des Codes eine erneute Anmeldung verlangt, melde dich wieder an und befolge die angezeigten Hinweise.

![Karte zur Zwei-Faktor-Authentifizierung mit Aktivieren-Schaltfläche.](/documentation/de/account-security-workflow.png)

### Wiederherstellen und ändern {#recovery}

Verwende bei der Anmeldung einen gespeicherten Wiederherstellungscode, wenn dein Telefon nicht verfügbar ist. Dadurch wird die Zwei-Faktor-Authentifizierung deaktiviert, und alle übrigen Codes werden ungültig. Richte nach der Anmeldung deine Authentifizierungsapp erneut ein und speichere die neuen Wiederherstellungscodes. Dieser Ablauf verspricht keine Kontowiederherstellung durch menschlichen Support.

Wenn du die Wiederherstellungscodes ersetzt, wird die vorherige Liste ungültig. Sowohl das Ersetzen als auch das absichtliche Deaktivieren erfordert die serverseitigen Prüfungen einer kürzlich erfolgten Anmeldung. Lies die Bestätigung: Nach dem Deaktivieren wird der zusätzliche Faktor nicht mehr verlangt, auch nicht bei einer Anmeldung über Google oder GitHub.


## Den Kontozugriff wiederherstellen {#account-recovery}

Verwende auf der Anmeldeseite der richtigen Instanz die Passwortwiederherstellung und gib die E-Mail-Adresse deines Kontos ein. Öffne die Nachricht zum Zurücksetzen, folge ihrem Link und bestätige die Zurücksetzung. Gib auf der Rücksetzseite dein neues Passwort ein und sende es ab. Prüfe anschließend, ob du dich auf derselben Instanz anmelden kannst.

Ein Rücksetzlink kann ablaufen oder keine aktive Sitzung mehr haben. Die Rücksetzseite zeigt diesen Zustand an und ermöglicht, einen weiteren Link anzufordern. Beginne mit einer neuen Nachricht, statt ein altes Lesezeichen erneut zu verwenden. Sende weder Link noch Cookies oder Passwort an den Support.


### MFA und weiterhin fehlender Zugriff {#mfa-recovery}

Ist die Zwei-Faktor-Authentifizierung aktiviert, hebt ein zurückgesetztes Passwort diese Anforderung nicht auf. Verwende deine Authentifizierungs-App. Ein bei der MFA-Einrichtung gespeicherter Wiederherstellungscode ist eine weitere Möglichkeit; seine Verwendung deaktiviert MFA. Behandle Wiederherstellungscodes als Geheimnisse und richte MFA nach dem wiederhergestellten Zugriff in den Sicherheitseinstellungen erneut ein.

Sind weder der zweite Faktor noch ein Wiederherstellungscode verfügbar, kontaktiere den Instanzbetreiber über dessen Supportkanal. Nenne die Instanzadresse und den angezeigten Fehler, ohne Authentifizierungstoken oder private Projektinhalte mitzuschicken. Bei fehlender Wiederherstellungs-E-Mail bitte den Betreiber, Auth-Weiterleitungs-URLs und SMTP-Versand zu prüfen. Erstelle kein zweites Konto in der Annahme, es würde Projekte oder Verbindungen des ursprünglichen Kontos übernehmen.

## Profil und Oberflächenpräferenzen ändern {#profile-and-preferences}

Öffne die Kontoeinstellungen im Kontomenü. Gib im Profil einen nicht leeren Anzeigenamen ein und speichere. Die E-Mail-Adresse ist schreibgeschützt. Erzeuge einen Avatar oder lade ein Bild über die Avatar-Steuerung hoch. Warte auf das Ergebnis und prüfe den Avatar in einem Kommentar oder in der Mitgliederliste; derselbe Avatar gilt für alle Projekte und Gespräche. Folge bei abgewiesenen Dateien der Validierungsmeldung, statt sie wiederholt hochzuladen.

Das Quellbild darf höchstens 10 MiB groß sein. Der Server prüft lesbare Bilddaten, berücksichtigt die Orientierung und schneidet mittig auf einen WebP-Avatar mit 256 × 256 Pixeln zu.

![Profileinstellungen mit Avatar, Benutzername und schreibgeschützter E-Mail-Adresse.](/documentation/de/profile-and-preferences-workflow.png)

### Die Oberfläche einstellen {#preferences}

Wähle in den Präferenzen Sprache und Design und prüfe eine andere Seite. Die Kontosprache betrifft das angemeldete Produkt; die öffentliche Website besitzt eine eigene Sprachauswahl. Das Design wird im Konto geräteübergreifend gespeichert.

Wähle das Sendetastenkürzel unter Tastatur. Es gilt für Kommentare und Numo. Nutze die Sendeschaltfläche, wenn das Betriebssystem das Kürzel abfängt; Modifikatortasten unterscheiden sich je Plattform. Ticketpräferenzen wie automatische Zuweisung und Status von Numo-Tickets gehören ebenfalls zum Konto und ändern keine Einstellungen anderer Mitglieder.

![Sprachauswahl und Schalter für helles, dunkles und Systemdesign.](/documentation/de/profile-and-preferences-preferences-workflow.png)

## Analyse steuern und Konto sorgfältig löschen {#privacy-and-account-deletion}

Wenn Analytics konfiguriert ist, zeigen die Kontoeinstellungen einen Zustimmungsschalter und einen Link zur Cookie-Richtlinie. Das Abschalten ändert die Zustimmung zur Messung auf diesem Gerät sofort und speichert die Auswahl im Konto. Eine bereits vorhandene lokale Entscheidung auf einem anderen Gerät kann dort weiterhin gelten. Ist kein Analytics-Dienst konfiguriert, fehlt der Bereich.

Die Zustimmung ist von den für den Kontobetrieb erforderlichen Daten getrennt. Lies die Datenschutzrichtlinie der Instanz und prüfe aktivierte externe Anbieter. Beim selbst betriebenen minddy bestimmen Konfiguration und Richtlinien des Betreibers die Dienstziele. Analytics abzuschalten entfernt keine KI- oder Git-Integrationen.

![Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.](/documentation/de/privacy-and-account-deletion-workflow.png)

### Löschvorschau prüfen {#deletion}

Exportiere vor der Kontolöschung benötigte Daten im Bereich Daten. Lies die Vorschau deiner eigenen Projekte, betroffenen Mitglieder, Tickets, Kommentare und des aktiven Abonnements. Kläre vor der Bestätigung die Folgen für andere Menschen, die an deinen Projekten beteiligt sind.

Öffne die Löschbestätigung erst, wenn du bereit bist. Gib deine Konto-E-Mail-Adresse und bei Passwortkonten das Passwort ein. Konten ohne Passwort benötigen eine kürzlich erfolgte Anmeldung. Folge den Hinweisen, wenn die erneute Authentifizierung abgelehnt wird, statt die Anfrage wiederholt zu senden. Eine erfolgreiche Löschung meldet das Konto ab und führt zur öffentlichen Website zurück. Dies ist kein wiederherstellbarer Papierkorb. Halte Exporte privat und bearbeite verbleibende Abonnement- oder Anbieterfragen über die jeweiligen Abrechnungs- und Anbieterfunktionen.


## Routinen konfigurieren {#routines}

Automatische Projektarbeit wird in [Routinen](/docs/scheduled-routines) konfiguriert. Der Eigentümer wählt Zeitplan, Produktereignis oder Datenbankeingang. Automatisierungsvoreinstellungen des Kontos und ihre Projektschalter sind entfernt. Lesen Sie vor der Aktivierung eines archivierten Vorschlags den [Übergangsleitfaden](/docs/automation-settings).
