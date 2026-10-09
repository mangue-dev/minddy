---
{
  "id": "applications",
  "locale": "de",
  "title": "Web-, Mobil- und Desktop-Apps",
  "summary": "Nutzen Sie minddy im Browser, installieren Sie die Mobil- oder Desktop-App und richten Sie Gerätebenachrichtigungen ein.",
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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "components/mobile-sidebar-reveal.tsx",
      "components/issue-side-panel.tsx",
      "components/assistant-panel.tsx",
      "public/sw.js",
      "content/documentation/reviews/mobile-account-capture-candidates.json",
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json",
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json",
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "content/documentation/reviews/push-registration-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/german_spanish_review (structural consolidation review; prior procedural evidence retained; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/german_spanish_review (de title, summary, lead and heading review; retained body comparison); agent:/root/editorial_de_es (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "caption": "Auf einem schmalen Bildschirm erscheinen Ticketdetails in einem angepassten Panel. Schließen Sie es über die Schaltfläche, um zum Projekt zurückzukehren; Numo bleibt über seine schwebende Schaltfläche erreichbar.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        438,
        968
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        1488,
        762
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/desktop-app-workflow.png",
      "alt": "Desktop-Einstellungen in der echten macOS-Electron-Entwicklungsapp, Version 0.11.1, mit lokalem Server und isoliertem Profil.",
      "caption": "Desktop-Einstellungen in der echten macOS-Electron-Entwicklungsapp, Version 0.11.1, mit lokalem Server und isoliertem Profil. Die Aufnahme bestätigt keine signierten Releases oder anderen Betriebssysteme.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        287
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/devices-and-notifications-workflow.png",
      "alt": "Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.",
      "caption": "Dieser Browser blockiert Benachrichtigungen. Erlauben Sie sie in den Website-Einstellungen, bevor Sie das Gerät registrieren.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        208
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "web-and-mobile-workflow",
    "install-the-pwa-workflow",
    "desktop-app-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

Sie können dieselbe Instanz im Browser, als installierte Web-App oder als Desktop-App öffnen. Folgen Sie der Installationsanleitung für Ihr Gerät und prüfen Sie anschließend Verbindung, Updates und Benachrichtigungsberechtigungen der Plattform.

## Im Browser und auf kleinen Bildschirmen arbeiten {#web-and-mobile}

Öffnen Sie die Adresse Ihrer Instanz und melden Sie sich dort an. Blenden Sie auf einem schmalen Bildschirm die Seitenleiste ein, wählen Sie ein Projekt und öffnen Sie ein Ticket aus der Liste oder dem Board. Lesen Sie die Details im an die Bildschirmgröße angepassten Panel, ändern Sie das gewünschte Feld oder fügen Sie einen Kommentar hinzu. Warten Sie auf das Ergebnis der Speicherung, bevor Sie das Panel schließen. Schließen Sie das Detailpanel, um zur Liste zurückzukehren; die mobile Darstellung unterscheidet sich von der Darstellung auf einem breiten Bildschirm.

Öffnen Sie Numo über die schwebende Schaltfläche oder eine Kontextaktion des Tickets. Prüfen Sie den Ticketkontext im Eingabefeld. Wenn ein Panel den benötigten Inhalt verdeckt, schließen Sie es vor der weiteren Navigation. Verwenden Sie auf Touchgeräten die sichtbaren Schaltflächen und Menüs; setzen Sie weder Aktionen beim Darüberfahren mit der Maus noch Desktop-Tastenkürzel voraus.

### Tastatur und Verbindung {#access}

Mit der Tastatur können Sie Steuerelemente fokussieren und die Befehlspalette für die Navigation und häufige Aktionen verwenden. Die sichtbare Sendeschaltfläche bleibt eine Alternative zur Tastatureingabe. Verwenden Sie das Kürzel, das die App für Ihre Plattform anzeigt.

Browser und installierte Web-App benötigen eine Netzwerkverbindung für Projektdaten und das Speichern von Änderungen. Der Service Worker verarbeitet Push-Mitteilungen und stellt keinen Offline-Datencache bereit. Prüfen Sie nach einem Verbindungsfehler, ob die Änderung gespeichert wurde, bevor Sie sie wiederholen. Die PWA-Installation erstellt kein separates Konto und umgeht keine Instanzberechtigungen.

![Mobiles Ticketpanel mit lokalisiertem Titel, Beschreibung, Eigenschaften und Kommentarfeld.](/documentation/de/web-and-mobile-workflow.png)

## Die Web-App auf Telefon oder Tablet installieren {#install-the-pwa}

Öffnen Sie die gewünschte minddy-Instanz in Safari auf dem iPhone oder iPad oder in Chrome beziehungsweise einem kompatiblen Android-Browser. Wurde der Link innerhalb einer anderen App geöffnet, öffnen Sie ihn zuerst im vollständigen Browser. Für eine selbst gehostete Instanz verwenden Sie die Adresse Ihres eigenen Servers.

Wählen Sie unter iOS Teilen und anschließend Zu Home-Bildschirm hinzufügen. Lassen Sie Als Web-App öffnen aktiviert und tippen Sie auf Hinzufügen. Je nach Safari-Oberfläche müssen Sie vor Teilen zunächst Mehr öffnen. Fehlt die Aktion, prüfen Sie Aktionen bearbeiten.

Nutzen Sie unter Android die angebotene Installationsaufforderung oder wählen Sie im Browsermenü App installieren beziehungsweise Zum Startbildschirm hinzufügen. Bestätigen Sie anschließend die Installation. Die Beschriftungen hängen vom Browser ab. Öffnen Sie das neue Symbol und melden Sie sich mit dem Konto dieser Instanz an. Es handelt sich um eine im Browser installierte PWA; im iOS App Store oder bei Google Play gibt es keine native minddy-App.

### Updates, Offlinezugriff und Push {#operation}

Durch die Installation entsteht keine Offlinekopie des Projekts. Der Service Worker von minddy verarbeitet nur Push-Benachrichtigungen und speichert keine Anwendungsanfragen im Cache. Verwenden Sie eine Netzwerkverbindung und laden Sie die Seite neu, um aktuelle Webinhalte abzurufen. Benachrichtigungen benötigen außerdem einen unterstützten Browser, dessen Berechtigung und eine serverseitige Push-Konfiguration. Unter iOS verwenden Sie die installierte App, wenn der Ablauf dies verlangt. Fehlt die Installationsoption, öffnen Sie einen unterstützten vollständigen Browser und prüfen Sie, ob die Instanz bereits installiert ist.

![Illustrierte Safari-Installationsanleitung von minddy: Teilen, zum Home-Bildschirm hinzufügen und bestätigen.](/documentation/de/install-the-pwa-workflow.png)

## Desktop-App installieren und verwalten {#desktop-app}

Öffnen Sie die öffentliche Downloadseite. Wählen Sie unter macOS das Paket für Apple silicon oder Intel. Installieren Sie die Anwendung unter Windows über den Microsoft Store. Wählen Sie unter Linux ein AppImage oder ein signiertes deb/rpm-Paket für x64 oder ARM64. Befolgen Sie die Plattformanleitung und die Hinweise zur Paketprüfung. Für Windows gibt es keinen exe-Installer.

Wählen Sie in der Serverauswahl minddy Cloud, die Origin eines selbst gehosteten Servers oder die verfügbare lokale Laufzeit. Prüfen Sie das Ziel vor der Anmeldung: Jedes Konto gehört zu seiner Instanz. OAuth verwendet den Systembrowser und kehrt anschließend zur Desktop-App zurück. Eine lokale Laufzeit bedeutet nicht, dass Numos Code-Worker in Ihrem lokalen Checkout arbeitet.

### Tabs, Schließen und Updates {#desktop-app-operation}

Navigieren Sie mit den Tab-Steuerelementen und der Befehlspalette zwischen Ihren Aufgaben. Verwenden Sie die angezeigten Plattformkürzel. Unter macOS ist es Command, wo Windows und Linux normalerweise Control verwenden. Das Schließen des Fensters blendet es aus; die Anwendung läuft weiter. Verwenden Sie Beenden, um die Anwendung zu stoppen, unter macOS auch Cmd+Q. Hintergrundbenachrichtigungen hängen vom Paket und den Plattformfunktionen ab.

Unter macOS und mit portablen AppImages sind Updates in der Anwendung verfügbar. Windows aktualisiert sie über den Microsoft Store. Für deb/rpm installieren Sie das nächste geprüfte Paket. Die Desktop-Einstellungen des Kontos zeigen den verbundenen Server und die verfügbaren Update- oder Supportfunktionen. Prüfen Sie nach einem Update die angezeigte Desktop-Version und ob weiterhin die gewünschte Instanz geöffnet wird.

![Desktop-Einstellungen in der echten macOS-Electron-Entwicklungsapp, Version 0.11.1, mit lokalem Server und isoliertem Profil.](/documentation/de/desktop-app-workflow.png)

## Gerätebenachrichtigungen aktivieren {#devices-and-notifications}

Öffnen Sie die Benachrichtigungen in den Kontoeinstellungen auf dem Gerät, das Sie registrieren möchten. Aktivieren Sie sie und erlauben Sie die Anfrage des Browsers oder Betriebssystems. Eine verweigerte Erlaubnis müssen Sie in den Browser- oder Systemeinstellungen ändern; wiederholtes Betätigen des minddy-Schalters kann sie nicht umgehen. Installieren und öffnen Sie unter iOS zuerst die Web-App, wenn die Oberfläche dies verlangt.

Prüfen Sie, ob das Gerät in der Liste erscheint, und verwenden Sie seinen Testbefehl. Lesen Sie die Angaben zur letzten Zustellung. Sie können einzelne Registrierungen deaktivieren oder entfernen, ohne das Konto zu löschen. Die Einstellungen des Posteingangs bestimmen, welche Ereignisse Sie benachrichtigen. Der Posteingang in der Anwendung bleibt verfügbar, wenn Push nicht verfügbar ist.

![Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.](/documentation/de/devices-and-notifications-workflow.png)

### Plattformbedingungen {#platforms}

Web-Push erfordert einen unterstützten Browser und einen konfigurierten Push-Dienst der Instanz. Native Hinweise und Hintergrundzustellung unterscheiden sich je nach Plattform. Die signierte macOS-Anwendung als Installationspaket unterstützt APNs; das Windows-Paket benötigt den optionalen WNS-Helfer für den Hintergrundtransport. Linux verwendet die Hintergrundsitzung der installierten Anwendung statt APNs oder WNS.

Prüfen Sie die Benachrichtigungserlaubnis des Betriebssystems, den Installationszustand im Browser und die angezeigte Erklärung, falls die Funktion nicht eingerichtet oder nicht unterstützt ist. Ein erfolgreicher Test garantiert keine Zustellung ohne Netz oder unter sämtlichen Hintergrundbeschränkungen des Betriebssystems. Halten Sie die Anwendung oder ihren eingerichteten Hintergrunddienst entsprechend den Anforderungen der Plattform verfügbar.

![Aktives, für das Konto registriertes Browser-Gerät mit dem tatsächlichen Datum des letzten Versands.](/documentation/de/devices-and-notifications-registered.png)
