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
  "revision": 17,
  "sourceRevision": 16,
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
      "supabase/migrations/20270109200046_list_auth_sessions.sql",
      "supabase/migrations/20270109200047_revoke_auth_session.sql",
      "lib/theme-presets.ts",
      "app/theme-presets.css",
      "components/settings/account-settings-page.tsx",
      "components/settings/account-desktop-section.tsx",
      "components/settings/account-issues-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "components/mobile-account.tsx",
      "lib/keyboard/shortcuts.ts"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 4 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (MIN-762 UI label and terminology correction: de labels aligned on the corrected catalog and the Ticket term; no behavior change, no new captures); agent:claude-code (MIN-762 recapture of account-security-workflow, profile-and-preferences-workflow, profile-and-preferences-preferences-workflow, privacy-and-account-deletion-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (de MIN-762 terminology edit; self-reviewed; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "alt": "Profilkopf mit Avatar und Bearbeitungssymbol, Name und schreibgeschützter E-Mail-Adresse.",
      "caption": "Wähle den Avatar, um einen zu erzeugen oder hochzuladen, oder den Namen, um ihn zu ändern; die E-Mail-Adresse bleibt schreibgeschützt.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        256
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/profile-and-preferences-preferences-workflow.png",
      "alt": "Sprachauswahl, Schalter für helles, dunkles und Systemdesign, Palettenauswahl für hellen und dunklen Modus und Transparenzschalter.",
      "caption": "Die Kontosprache und die Sprache der öffentlichen Website werden getrennt eingestellt.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        421
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
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Die Gruppe **Sitzungen** im Tab **Sicherheit** der Kontoeinstellungen listet die Browser und Desktop-Apps auf, die bei deinem Konto angemeldet sind, markiert das Gerät, das du gerade nutzt, und zeigt, wann jedes andere zuletzt aktiv war. Um alle anderen Sitzungen zu beenden, etwa auf einem verlorenen Laptop oder einem gemeinsam genutzten Computer, wähle in der Zeile **Andere Geräte abmelden** die Option **Alle abmelden** und bestätige: Jeder andere Browser und jede Desktop-App, die bei deinem Konto angemeldet sind, kehren zur Anmeldung zurück. Um nur eine Sitzung zu beenden, wähle in ihrer Zeile **Abmelden** und bestätige; nur dieses Gerät kehrt zur Anmeldung zurück. In beiden Fällen bleibt das Gerät, das du gerade nutzt, angemeldet. Apps, die du unter **minddy-MCP** → **Verbundene Apps** autorisiert hast, behalten ihren Zugriff, bis du ihn dort widerrufst.

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

Wähle **Kontoeinstellungen** im Kontomenü, im mobilen Menü oder in der Befehlspalette, oder drücke Command+Komma unter macOS (Strg+Komma unter Windows/Linux): Die Kontoeinstellungen öffnen sich im Tab **Einstellungen**. Um direkt den Tab **Profil** zu öffnen, wähle deinen Namen oben im Kontomenü; du kannst **Profil** auch unter den Tabs der Kontoeinstellungen auswählen. Er zeigt deinen Avatar, deinen Namen und deine E-Mail-Adresse, gefolgt von deiner [persönlichen Statistik](/docs/personal-statistics). Wähle deinen Avatar und dann **Neuer Lorelei-Avatar** oder **Bild hochladen**; die Änderung gilt, sobald sie gelungen ist. Wähle deinen Namen, um ihn zu ändern: Am Computer wird er zu einem Feld, das Enter oder ein Klick daneben speichert und Escape verwirft; auf dem Telefon öffnet sich ein Bereich mit **Benutzername** und **Speichern**. Der Name darf nicht leer sein. Die E-Mail-Adresse ist schreibgeschützt. Warte auf das Ergebnis und prüfe den Avatar in einem Kommentar oder in der Mitgliederliste; derselbe Avatar gilt für alle Projekte und Gespräche. Folge bei abgewiesenen Dateien der Validierungsmeldung, statt sie wiederholt hochzuladen.

Das Quellbild darf höchstens 10 MiB groß sein. Der Server prüft lesbare Bilddaten, berücksichtigt die Orientierung und schneidet mittig auf einen WebP-Avatar mit 256 × 256 Pixeln zu.

![Profilkopf mit Avatar und Bearbeitungssymbol, Name und schreibgeschützter E-Mail-Adresse.](/documentation/de/profile-and-preferences-workflow.png)

### Die Oberfläche einstellen {#preferences}

Wähle in den Präferenzen Sprache und Design und prüfe eine andere Seite. Die Kontosprache betrifft das angemeldete Produkt; die öffentliche Website besitzt eine eigene Sprachauswahl. Das Design wird im Konto geräteübergreifend gespeichert.

Das Design wählt den hellen, dunklen oder System-Modus. **Palette für hellen Modus** und **Palette für dunklen Modus** legen jeweils die Farben eines Modus fest. **Akzentfarben** (minddy, Blau, Violett, Grün, Orange, Rosé) behalten die Farben von minddy und färben nur Schaltflächen und den Fokusring um; **Vollständige Paletten** (Solarized, Catppuccin, Nord) färben alle Flächen um; **Hoher Kontrast** steht unter Barrierefreiheit. Die Palette des angezeigten Modus gilt sofort; die andere wird gespeichert und erscheint, sobald ihr Modus aktiv wird, auch wenn System einem Wechsel des Betriebssystems folgt. Hoher Kontrast verstärkt den Kontrast von Text und Rahmen, umrandet Felder, Menüs, Dialoge und Tabs, markiert die aktuelle Seite und das ausgewählte Element, zeigt den Tastaturfokus immer an und hält Menüs deckend. Schalte **Transparenz** aus, damit Menüs, Popover und die Befehlspalette deckend und ohne Unschärfe erscheinen. Paletten und Transparenz werden im Konto gespeichert; ein anderes Gerät übernimmt sie beim nächsten Laden einer Seite.

Wähle das Sendetastenkürzel unter Tastatur. Es gilt für Kommentare, Numo und die Eingabetaste im Titel eines Erstellungsformulars; eine Beschreibung behält Command/Strg+Eingabetaste, und Umschalt+Eingabetaste in einem Titel wechselt immer zur Beschreibung. Nutze die Sendeschaltfläche, wenn das Betriebssystem das Kürzel abfängt; Modifikatortasten unterscheiden sich je Plattform. Projekte, die du ausgeblendet hast, stehen in einem eigenen Tab **Ausgeblendete Projekte**, wo du sie wieder einblenden kannst. Der Tab **Einstellungen** enthält außerdem die Karte **Desktop-App**: Im Web führt sie zum Download der Desktop-App, in der Desktop-App zeigt sie den verbundenen Server und die App-Version. Ticketpräferenzen gehören ebenfalls zum Konto und ändern keine Einstellungen anderer Mitglieder: Die automatische Zuweisung liegt im Tab **Tickets**, der Status von Tickets, die Numo erstellt, unter **KI & Numo** → **Von Numo erstellte Tickets**.

![Sprachauswahl, Schalter für helles, dunkles und Systemdesign, Palettenauswahl für hellen und dunklen Modus und Transparenzschalter.](/documentation/de/profile-and-preferences-preferences-workflow.png)

## Analyse steuern und Konto sorgfältig löschen {#privacy-and-account-deletion}

Wenn Analytics konfiguriert ist, zeigt der Tab **Datenschutz & Daten** der Kontoeinstellungen einen Zustimmungsschalter und einen Link zur Cookie-Richtlinie. Das Abschalten ändert die Zustimmung zur Messung auf diesem Gerät sofort und speichert die Auswahl im Konto. Eine bereits vorhandene lokale Entscheidung auf einem anderen Gerät kann dort weiterhin gelten. Ist kein Analytics-Dienst konfiguriert, fehlt der Bereich.

Die Zustimmung ist von den für den Kontobetrieb erforderlichen Daten getrennt. Lies die Datenschutzrichtlinie der Instanz und prüfe aktivierte externe Anbieter. Beim selbst betriebenen minddy bestimmen Konfiguration und Richtlinien des Betreibers die Dienstziele. Analytics abzuschalten entfernt keine KI- oder Git-Integrationen.

![Löschvorschau mit eigenen Projekten, Tickets und Mitgliedern, die Zugriff verlieren.](/documentation/de/privacy-and-account-deletion-workflow.png)

### Löschvorschau prüfen {#deletion}

Exportiere vor der Kontolöschung benötigte Daten im Tab **Datenschutz & Daten**. Lies die Vorschau deiner eigenen Projekte, betroffenen Mitglieder, Tickets, Kommentare und des aktiven Abonnements. Kläre vor der Bestätigung die Folgen für andere Menschen, die an deinen Projekten beteiligt sind.

Öffne die Löschbestätigung erst, wenn du bereit bist. Gib deine Konto-E-Mail-Adresse und bei Passwortkonten das Passwort ein. Konten ohne Passwort benötigen eine kürzlich erfolgte Anmeldung. Folge den Hinweisen, wenn die erneute Authentifizierung abgelehnt wird, statt die Anfrage wiederholt zu senden. Eine erfolgreiche Löschung meldet das Konto ab und führt zur öffentlichen Website zurück. Dies ist kein wiederherstellbarer Papierkorb. Halte Exporte privat und bearbeite verbleibende Abonnement- oder Anbieterfragen über die jeweiligen Abrechnungs- und Anbieterfunktionen.


## Routinen konfigurieren {#routines}

Automatische Projektarbeit wird in [Routinen](/docs/scheduled-routines) konfiguriert. Der Eigentümer wählt Zeitplan, Produktereignis oder Datenbankeingang. Automatisierungsvoreinstellungen des Kontos und ihre Projektschalter sind entfernt. Lies vor der Aktivierung eines archivierten Vorschlags den [Übergangsleitfaden](/docs/automation-settings).
