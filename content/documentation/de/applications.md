---
{
  "id": "applications",
  "locale": "de",
  "title": "Web-, Mobil- und Desktop-Apps",
  "summary": "Nutze minddy im Browser, installiere die Mobil- oder Desktop-App und richte Gerätebenachrichtigungen ein.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A10",
    "A11",
    "A12",
    "A03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 17,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "lib/query-snapshot-budget.ts",
      "lib/query-persistence.ts",
      "lib/desktop/renderer-recovery.ts",
      "desktop/src/main.ts",
      "lib/query-retention.ts",
      "lib/pull-request-tab-labels.ts",
      "lib/desktop/window-stall-recovery.ts",
      "lib/desktop/local-recovery-load.ts",
      "scripts/desktop-renderer-hang.integration.mjs",
      "lib/use-desktop-notifications.ts",
      "lib/use-desktop-notifications.test.ts",
      "lib/query-provider.tsx",
      "lib/navigation-working-set.ts",
      "lib/query-storage-writes.test.ts",
      "lib/local-snapshot-security.test.ts",
      "components/settings/account-settings-page.tsx",
      "components/desktop/server-choice.tsx",
      "components/desktop/server-choice-entry.tsx",
      "lib/desktop/server-choice.ts",
      "desktop/src/menu.ts",
      "components/auth/auth-chrome.tsx"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; 3 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (MIN-762 recapture of web-and-mobile-workflow, devices-and-notifications-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, desktop/src/main.ts, desktop/src/menu.ts and lib/desktop/server-choice.ts; no desktop walkthrough, no screenshot recaptured)",
    "language": "agent:/root/min747 (de translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (de MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (de MIN-762 figure update; agent review, not human acceptance); agent:claude-code (de manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-781 translation on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications"
  ],
  "tags": [
    "Im Browser und auf kleinen Bildschirmen arbeiten",
    "Die Web-App auf Telefon oder Tablet installieren",
    "Desktop-App installieren und verwalten",
    "Gerätebenachrichtigungen aktivieren"
  ],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/web-and-mobile-workflow.png",
      "alt": "Mobiles Ticketpanel mit lokalisiertem Titel, Beschreibung, Eigenschaften und Kommentarfeld.",
      "caption": "Auf einem schmalen Bildschirm erscheinen Ticketdetails in einem angepassten Panel. Schließe es über die Schaltfläche, um zum Projekt zurückzukehren; Numo bleibt über seine schwebende Schaltfläche erreichbar.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/install-the-pwa-workflow.png",
      "alt": "Illustrierte Safari-Installationsanleitung von minddy: Teilen, zum Home-Bildschirm hinzufügen und bestätigen.",
      "caption": "Die öffentliche Anleitung illustriert die drei Safari-Schritte und die aktivierte Option Als Web-App öffnen. Die Abbildungen sind von minddy dargestellte Anleitungen und keine Aufnahmen einer abgeschlossenen iOS-Installation.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1488,
        762
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/devices-and-notifications-workflow.png",
      "alt": "Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.",
      "caption": "Dieser Browser blockiert Benachrichtigungen. Erlaube sie in den Website-Einstellungen, bevor du das Gerät registrierst.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        196
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/devices-and-notifications-registered.png",
      "alt": "Aktives, für das Konto registriertes Browser-Gerät mit dem tatsächlichen Datum des letzten Versands.",
      "caption": "Für das Konto ist ein aktives Browser-Gerät registriert. Die Liste zeigt das Registrierungsdatum und den letzten Versand. Ob ein Banner erscheint, hängt weiterhin von der Browserberechtigung und den Betriebssystemeinstellungen ab.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-renderer-recovery",
      "kind": "screenshot",
      "src": "/documentation/de/desktop-renderer-recovery.png",
      "alt": "Lokale Wiederherstellungsseite nach einem erzwungenen Renderer-Absturz mit Reload window und Check server settings.",
      "caption": "Wiederherstellungsseite in der macOS-Entwicklungsapp mit isoliertem Profil und Demonstrationsserver. Die native Oberfläche verwendet in allen Sprachen englische Beschriftungen.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        1280,
        860
      ],
      "theme": "light",
      "padding": 0,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Du kannst dieselbe Instanz im Browser, als installierte Web-App oder als Desktop-App öffnen. Folge der Installationsanleitung für dein Gerät und prüfe anschließend Verbindung, Updates und Benachrichtigungsberechtigungen der Plattform.

## Im Browser und auf kleinen Bildschirmen arbeiten {#web-and-mobile}

Öffne die Adresse deiner Instanz und melde dich dort an. Blende auf einem schmalen Bildschirm die Seitenleiste ein, wähle ein Projekt und öffne ein Ticket aus der Liste oder dem Board. Lies die Details im an die Bildschirmgröße angepassten Panel, ändere das gewünschte Feld oder füge einen Kommentar hinzu. Warte auf das Ergebnis der Speicherung, bevor du das Panel schließt. Schließe das Detailpanel, um zur Liste zurückzukehren; die mobile Darstellung unterscheidet sich von der Darstellung auf einem breiten Bildschirm.

Öffne Numo über die schwebende Schaltfläche oder eine Kontextaktion des Tickets. Prüfe den Ticketkontext im Eingabefeld. Wenn ein Panel den benötigten Inhalt verdeckt, schließe es vor der weiteren Navigation. Verwende auf Touchgeräten die sichtbaren Schaltflächen und Menüs; setze weder Aktionen beim Darüberfahren mit der Maus noch Desktop-Tastenkürzel voraus.

### Tastatur und Verbindung {#access}

Mit der Tastatur kannst du Steuerelemente fokussieren und die Befehlspalette für die Navigation und häufige Aktionen verwenden. Die sichtbare Sendeschaltfläche bleibt eine Alternative zur Tastatureingabe. Verwende das Kürzel, das die App für deine Plattform anzeigt.

Browser und installierte Web-App benötigen eine Netzwerkverbindung für Projektdaten und das Speichern von Änderungen. Der Service Worker verarbeitet Push-Mitteilungen und stellt keinen Offline-Datencache bereit. Prüfe nach einem Verbindungsfehler, ob die Änderung gespeichert wurde, bevor du sie wiederholst. Die PWA-Installation erstellt kein separates Konto und umgeht keine Instanzberechtigungen.

![Mobiles Ticketpanel mit lokalisiertem Titel, Beschreibung, Eigenschaften und Kommentarfeld.](/documentation/de/web-and-mobile-workflow.png)

## Die Web-App auf Telefon oder Tablet installieren {#install-the-pwa}

Öffne die gewünschte minddy-Instanz in Safari auf dem iPhone oder iPad oder in Chrome beziehungsweise einem kompatiblen Android-Browser. Wurde der Link innerhalb einer anderen App geöffnet, öffne ihn zuerst im vollständigen Browser. Für eine selbst gehostete Instanz verwendest du die Adresse deines eigenen Servers.

Wähle unter iOS Teilen und anschließend Zu Home-Bildschirm hinzufügen. Lass Als Web-App öffnen aktiviert und tippe auf Hinzufügen. Je nach Safari-Oberfläche musst du vor Teilen zunächst Mehr öffnen. Fehlt die Aktion, prüfe Aktionen bearbeiten.

Nutze unter Android die angebotene Installationsaufforderung oder wähle im Browsermenü App installieren beziehungsweise Zum Startbildschirm hinzufügen. Bestätige anschließend die Installation. Die Beschriftungen hängen vom Browser ab. Öffne das neue Symbol und melde dich mit dem Konto dieser Instanz an. Es handelt sich um eine im Browser installierte PWA; im iOS App Store oder bei Google Play gibt es keine native minddy-App.

### Updates, Offlinezugriff und Push {#operation}

Durch die Installation entsteht keine Offlinekopie des Projekts. Der Service Worker von minddy verarbeitet nur Push-Benachrichtigungen und speichert keine Anwendungsanfragen im Cache. Verwende eine Netzwerkverbindung und lade die Seite neu, um aktuelle Webinhalte abzurufen. Benachrichtigungen benötigen außerdem einen unterstützten Browser, dessen Berechtigung und eine serverseitige Push-Konfiguration. Unter iOS verwendest du die installierte App, wenn der Ablauf dies verlangt. Fehlt die Installationsoption, öffne einen unterstützten vollständigen Browser und prüfe, ob die Instanz bereits installiert ist.

![Illustrierte Safari-Installationsanleitung von minddy: Teilen, zum Home-Bildschirm hinzufügen und bestätigen.](/documentation/de/install-the-pwa-workflow.png)

## Desktop-App installieren und verwalten {#desktop-app}

Öffne die öffentliche Downloadseite. Wähle unter macOS das Paket für Apple silicon oder Intel. Installiere die Anwendung unter Windows über den Microsoft Store. Wähle unter Linux ein AppImage oder ein signiertes `deb`/`rpm`-Paket für x64 oder ARM64. Befolge die Plattformanleitung und die Hinweise zur Paketprüfung. Für Windows gibt es keinen `exe`-Installer.

Beim ersten Start öffnet die App die Registrierungsseite von minddy Cloud, auf der du dein Konto anlegst. Um stattdessen deine eigene Instanz zu nutzen, klicke unten auf den Anmelde- und Registrierungsseiten auf **minddy selbst hosten**. Das öffnet **minddy selbst hosten** mit drei Optionen: **Auf diesem Computer installieren** richtet eine [lokale Instanz](/de/dokumentation/install-locally#install-locally) ein, **Auf einem Server installieren** öffnet die öffentliche Anleitung für eine Serverinstallation in deinem Browser, und **Bestehende Installation verwenden** öffnet einen Bildschirm, der deine vorhandenen Installationen bündelt. Dort öffnet **Auf diesem Computer** einen minddy-Ordner, der bereits auf diesem Computer liegt, und die App startet ihn; darunter verbindet dich **Serveradresse** mit **Verbinden** mit einem Server, den du betreibst. Entfernte Server benötigen HTTPS; `localhost` kann HTTP verwenden.

Um den Server später zu wechseln, wähle **Connect to a Server…** im nativen Menü minddy (das native Menü ist englisch; unter Windows und Linux blendet Alt die Menüleiste ein), **Ändern…** neben **Verbundener Server** unter **Kontoeinstellungen** → **Einstellungen** → **Desktop-App** oder **minddy selbst hosten** unten auf den Anmelde- und Registrierungsseiten. Jeder Weg bringt das App-Fenster zu **minddy selbst hosten**; ist ein selbst gehosteter Server verbunden, kehrst du unter **Bestehende Installation verwenden** mit **minddy Cloud verwenden** zu Cloud zurück. Der Pfad oben auf der Seite führt zu jedem Schritt zurück, und das minddy-Logo führt zurück in die App. Dieser Bildschirm ist in die Desktop-App eingebaut und öffnet sich ohne Internetverbindung. Prüfe das Ziel vor der Anmeldung: Jedes Konto gehört zu seiner Instanz. OAuth verwendet den Systembrowser und kehrt anschließend zur Desktop-App zurück.

### Tabs, Schließen und Updates {#desktop-app-operation}

Navigiere mit den Tab-Steuerelementen und der Befehlspalette zwischen deinen Aufgaben. Verwende die angezeigten Plattformkürzel. Unter macOS ist es Command, wo Windows und Linux normalerweise Control verwenden. Das Schließen des Fensters blendet es aus; die Anwendung läuft weiter. Verwende Beenden, um die Anwendung zu stoppen, unter macOS auch Cmd+Q. Hintergrundbenachrichtigungen hängen vom Paket und den Plattformfunktionen ab.

Unter macOS und mit portablen AppImages sind Updates in der Anwendung verfügbar. Windows aktualisiert sie über den Microsoft Store. Für `deb`/`rpm` installierst du das nächste geprüfte Paket. In der Desktop-App zeigt **Kontoeinstellungen** → **Einstellungen** → **Desktop-App** den verbundenen Server und die App-Version, mit einer Update-Prüfung, sofern das Paket sie unterstützt. Im Web führt dieselbe Karte zur Download-Seite. Prüfe nach einem Update die angezeigte Desktop-Version und ob weiterhin die gewünschte Instanz geöffnet wird.

### Ein abgestürztes Fenster wiederherstellen {#desktop-renderer-recovery}

Wenn ein Desktop-Fenster abstürzt, bietet eine lokale Wiederherstellungsseite **Reload window** an. Öffne damit den letzten Bildschirm auf dem aktuell ausgewählten Server erneut. Nicht gespeicherte Änderungen können verloren gehen. Die App wartet auf deine Aktion, statt die fehlerhafte Seite wiederholt neu zu laden. Falls auch die Wiederherstellungsseite ausfällt, fordert die native Meldung dich auf, minddy zu beenden und erneut zu öffnen. Diese nativen Wiederherstellungsfunktionen verwenden derzeit englische Beschriftungen.

Wenn eine Seite nach 30 Sekunden noch lädt oder ein Fenster fünf Sekunden nach Erkennung durch die Desktop-App weiterhin nicht reagiert, bietet ein nativer Dialog **Wait** und **Recover window** an. **Wait** ist die Standardauswahl und lässt deine Arbeit sowie die laufende Anfrage unverändert. Der Dialog schließt sich, sobald der Ladevorgang endet oder das Fenster wieder reagiert. Bei der Wiederherstellung können ungespeicherte Änderungen verloren gehen: Wähle **Recover window**, um die lokale Wiederherstellungsseite zu öffnen, und anschließend **Reload window**, um zum letzten Bildschirm zurückzukehren.

Der optional gespeicherte Abfragecache ist auf 2 MiB Abfragedaten begrenzt. Ist der gesamte Cache zu groß, speichert minddy vollständige, dafür geeignete Abfrageergebnisse und bevorzugt bei Bedarf die aktuellen Ansichten und die Tabs in der Tableiste. Überschreitet auch diese Auswahl das Limit, wird der vorherige lokale Snapshot entfernt. Daten, die nicht im gespeicherten Cache enthalten sind, bleiben während der Sitzung im Arbeitsspeicher und werden nach einem Neustart bei Bedarf erneut abgerufen. Separat gespeicherte Entwürfe sind davon nicht betroffen. Dieser Cache ist keine Sicherung deiner Arbeit.

Um den Speicherverbrauch bei langen Sitzungen zu reduzieren, werden inaktive PR-Details, Commit-Diffs und Seiteninhalte nach einer Minute freigegeben und bei Bedarf erneut geladen. Aktive Abfragen bleiben erhalten. Tab-Beschriftungen speichern nur kompakte PR-Informationen; ein geöffneter Tab hält daher keine Patches im Speicher.

![Lokale Wiederherstellungsseite nach einem erzwungenen Renderer-Absturz mit Reload window und Check server settings.](/documentation/de/desktop-renderer-recovery.png)

## Gerätebenachrichtigungen aktivieren {#devices-and-notifications}

Öffne die Benachrichtigungen in den Kontoeinstellungen auf dem Gerät, das du registrieren möchtest. Aktiviere sie und erlaube die Anfrage des Browsers oder Betriebssystems. Eine verweigerte Erlaubnis musst du in den Browser- oder Systemeinstellungen ändern; wiederholtes Betätigen des minddy-Schalters kann sie nicht umgehen. Installiere und öffne unter iOS zuerst die Web-App, wenn die Oberfläche dies verlangt.

Prüfe, ob das Gerät in der Liste erscheint, und verwende seinen Testbefehl. Lies die Angaben zur letzten Zustellung. Du kannst einzelne Registrierungen deaktivieren oder entfernen, ohne das Konto zu löschen. Die Kategorien unter **Kontoeinstellungen** → **Benachrichtigungen** bestimmen, welche Ereignisse dich benachrichtigen. Der Posteingang in der Anwendung bleibt verfügbar, wenn Push nicht verfügbar ist.

![Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.](/documentation/de/devices-and-notifications-workflow.png)

### Plattformbedingungen {#platforms}

Web-Push erfordert einen unterstützten Browser und einen konfigurierten Push-Dienst der Instanz. Native Hinweise und Hintergrundzustellung unterscheiden sich je nach Plattform. Die signierte macOS-Anwendung als Installationspaket unterstützt APNs; das Windows-Paket benötigt den optionalen WNS-Helfer für den Hintergrundtransport. Linux verwendet die Hintergrundsitzung der installierten Anwendung statt APNs oder WNS.

Wenn auf dem ausgewählten Server APNs oder WNS nicht konfiguriert ist, verwendet die Desktop-App lokale native Benachrichtigungen, solange sie läuft oder ausgeblendet ist. Nach dem Beenden der App werden über diesen Ersatzweg keine Benachrichtigungen mehr zugestellt.

Prüfe die Benachrichtigungserlaubnis des Betriebssystems, den Installationszustand im Browser und die angezeigte Erklärung, falls die Funktion nicht eingerichtet oder nicht unterstützt ist. Ein erfolgreicher Test garantiert keine Zustellung ohne Netz oder unter sämtlichen Hintergrundbeschränkungen des Betriebssystems. Halte die Anwendung oder ihren eingerichteten Hintergrunddienst entsprechend den Anforderungen der Plattform verfügbar.

![Aktives, für das Konto registriertes Browser-Gerät mit dem tatsächlichen Datum des letzten Versands.](/documentation/de/devices-and-notifications-registered.png)
