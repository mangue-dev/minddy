---
{
  "id": "applications",
  "locale": "de",
  "title": "Web-, Mobil- und Desktop-Apps",
  "summary": "minddy im Browser nutzen, die iOS-App, die Web-App oder die Desktop-App installieren und Gerätebenachrichtigungen einrichten.",
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
    "A03",
    "A13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 22,
  "sourceRevision": 21,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-13",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/mobile-navigation.tsx",
      "components/auth/auth-entry.tsx",
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
      "components/auth/auth-chrome.tsx",
      "lib/desktop/window-material.ts",
      "components/ui/mobile-sheet.tsx",
      "lib/sheet-swipe-dismiss.ts",
      "mobile/README.md",
      "components/mobile/shell.tsx",
      "components/mobile/ai-consent-gate.tsx",
      "lib/mobile/ai-consent.ts",
      "lib/server/ai-consent.ts",
      "components/settings/account-mobile-section.tsx",
      "lib/mobile/haptics.ts",
      "lib/apple-app-site-association.ts",
      "lib/mobile/public-links.ts",
      "lib/native-app.ts"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (MIN-973 iOS app: new ios-app section with sign-in, server choice, offline screen, universal links, push, vibrations, purchases hidden and AI consent, and the iOS app in the PWA and notification passages; checked against mobile/README.md, components/mobile/shell.tsx, components/auth/auth-chrome.tsx, components/mobile/ai-consent-gate.tsx, lib/mobile/ai-consent.ts, lib/server/ai-consent.ts, components/settings/account-mobile-section.tsx, lib/apple-app-site-association.ts and the catalogs; not walked through on a device or on the App Store listing; 3 figures captured on 2026-11-13 from the local candidate in a phone-sized page with the shell bridge stubbed, inspected in all six locales; earlier figures kept with their capture dates); agent:claude-code (MIN-896 bottom sheets closed by a downward swipe, after the list scrolls back to its top; checked against components/ui/mobile-sheet.tsx and lib/sheet-swipe-dismiss.ts and their tests; not checked on a physical phone; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show the gesture); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-907 phone menu opened from the bottom bar as a sheet, and the desktop app's first launch on the single sign-in and sign-up screen: checked against components/mobile-navigation.tsx, components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx and desktop/src/main.ts; no browser walkthrough; existing figures do not show the bottom bar or the sign-in screen and were kept); agent:claude-code (MIN-907 store submission prep: the browser-install passage no longer states that minddy has no App Store app, ahead of the iOS app; checked against messages/*.json DownloadMobile.noteBody; no figure affected)",
    "language": "agent:claude-code (de MIN-973 iOS app section and passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de changed passage on closing bottom sheets, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 phone menu and desktop first-launch passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (de MIN-907 browser-install sentence, in the locale's register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
  },
  "related": [
    "issues"
  ],
  "aliases": [
    "web-and-mobile",
    "install-the-pwa",
    "desktop-app",
    "desktop-and-speed",
    "devices-and-notifications",
    "ios-app"
  ],
  "tags": [
    "Im Browser und auf kleinen Bildschirmen arbeiten",
    "Die iOS-App installieren",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        438,
        1032
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-sign-in",
      "kind": "screenshot",
      "src": "/documentation/de/ios-app-sign-in.png",
      "alt": "Der Bildschirm Anmelden oder registrieren der iOS-App mit dem E-Mail-Feld, den Schaltflächen für Apple, Google und GitHub und minddy selbst hosten.",
      "caption": "In der iOS-App folgt minddy selbst hosten auf die Anmeldedienste. Die Anmeldefenster von Apple und vom System sind auf diesem Bild nicht zu sehen.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        386,
        502
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-ai-consent",
      "kind": "screenshot",
      "src": "/documentation/de/ios-app-ai-consent.png",
      "alt": "Das Fenster KI-Funktionen nutzen? der iOS-App mit Nicht jetzt und Erlauben.",
      "caption": "Die Frage, die auf jedem Gerät einmal vor jeder KI-Funktion erscheint. Nicht jetzt lässt die KI-Funktionen in der App ausgeschaltet.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        442,
        538
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-mobile-preferences",
      "kind": "screenshot",
      "src": "/documentation/de/ios-app-mobile-preferences.png",
      "alt": "Der Bereich Mobile App in den Einstellungen der iOS-App mit den Schaltern Vibration und KI-Funktionen.",
      "caption": "Dieser Bereich erscheint nur in der iOS-App. KI-Funktionen ändert die Antwort auf die Frage beim ersten Start.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        418,
        305
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-28",
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
    "ios-app-sign-in",
    "ios-app-ai-consent",
    "ios-app-mobile-preferences",
    "install-the-pwa-workflow",
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow",
    "desktop-renderer-recovery"
  ]
}
---

Du kannst dieselbe Instanz im Browser, in der iOS-App, als installierte Web-App oder als Desktop-App öffnen. Folge der Installationsanleitung für dein Gerät und prüfe anschließend Verbindung, Updates und Benachrichtigungsberechtigungen der Plattform.

## Im Browser und auf kleinen Bildschirmen arbeiten {#web-and-mobile}

Öffne die Adresse deiner Instanz und melde dich dort an. Öffne auf einem schmalen Bildschirm das Menü links in der Leiste unten am Bildschirm, wähle ein Projekt und öffne ein Ticket aus der Liste oder dem Board. Lies die Details im an die Bildschirmgröße angepassten Panel, ändere das gewünschte Feld oder füge einen Kommentar hinzu. Warte auf das Ergebnis der Speicherung, bevor du das Panel schließt. Schließe das Detailpanel, um zur Liste zurückzukehren; die mobile Darstellung unterscheidet sich von der Darstellung auf einem breiten Bildschirm.

Auf dem Smartphone öffnen sich Menüs, Auswahllisten und Dialoge in einem unteren Blatt. Schließe es mit seiner Schaltfläche zum Schließen oder indem du es nach unten wischst; ist seine Liste gescrollt, scrollt die Wischbewegung sie zuerst wieder nach oben.

Öffne Numo über die schwebende Schaltfläche oder eine Kontextaktion des Tickets. Prüfe den Ticketkontext im Eingabefeld. Wenn ein Panel den benötigten Inhalt verdeckt, schließe es vor der weiteren Navigation. Verwende auf Touchgeräten die sichtbaren Schaltflächen und Menüs; setze weder Aktionen beim Darüberfahren mit der Maus noch Desktop-Tastenkürzel voraus.

### Tastatur und Verbindung {#access}

Mit der Tastatur kannst du Steuerelemente fokussieren und die Befehlspalette für die Navigation und häufige Aktionen verwenden. Die sichtbare Sendeschaltfläche bleibt eine Alternative zur Tastatureingabe. Verwende das Kürzel, das die App für deine Plattform anzeigt.

Browser und installierte Web-App benötigen eine Netzwerkverbindung für Projektdaten und das Speichern von Änderungen. Der Service Worker verarbeitet Push-Mitteilungen und stellt keinen Offline-Datencache bereit. Prüfe nach einem Verbindungsfehler, ob die Änderung gespeichert wurde, bevor du sie wiederholst. Die PWA-Installation erstellt kein separates Konto und umgeht keine Instanzberechtigungen.

![Mobiles Ticketpanel mit lokalisiertem Titel, Beschreibung, Eigenschaften und Kommentarfeld.](/documentation/de/web-and-mobile-workflow.png)

## Die iOS-App installieren {#ios-app}

Auf iPhone und iPad installierst du minddy aus dem App Store. Die App benötigt iOS 15 oder neuer. Sie zeigt die Oberfläche des Servers, mit dem sie verbunden ist, minddy Cloud oder deine eigene Instanz. Neue minddy-Funktionen erreichen sie deshalb ohne App-Update.

Beim ersten Start stellen einige Seiten minddy vor; **Loslegen** führt zu **Anmelden oder registrieren**. Gib deine E-Mail-Adresse ein und wähle **Weiter**, oder nutze **Weiter mit Apple**, **Weiter mit Google** oder **Weiter mit GitHub**. Apple öffnet sein eigenes Anmeldefenster; Google und GitHub öffnen das Anmeldefenster des Systems über der App und kehren nach der Anmeldung zu ihr zurück. Die weiteren Schritte entsprechen denen im Web; siehe [Konto erstellen und anmelden](/de/dokumentation/accounts#account-access).

Um eine selbst gehostete Instanz zu nutzen, tippe unter den Anmeldeoptionen auf **minddy selbst hosten**. Gib auf **Mit deinem Server verbinden** die Adresse der Instanz unter **Serveradresse** ein und tippe auf **Verbinden**. Entfernte Server benötigen HTTPS; eine Adresse ohne Schema verwendet HTTPS. **Zurück** führt zum Anmeldebildschirm, und wenn die App mit einem selbst gehosteten Server verbunden ist, kehrt **minddy Cloud verwenden** zu Cloud zurück. Konten gehören zu ihrer Instanz: Melde dich mit dem Konto des gewählten Servers an. **minddy selbst hosten** erscheint nur auf dem Anmeldebildschirm. Melde dich also zuerst ab, um den Server zu wechseln.

Antwortet der Server nicht, zeigt die App **Verbindung zum Server nicht möglich**, oder **Du bist offline**, wenn das Gerät kein Netz hat. **Erneut versuchen** lädt die Seite neu, und sobald das Netz zurück ist, versucht es die App auch von selbst. **Server wechseln** öffnet **Mit deinem Server verbinden**.

![Der Bildschirm Anmelden oder registrieren der iOS-App mit dem E-Mail-Feld, den Schaltflächen für Apple, Google und GitHub und minddy selbst hosten.](/documentation/de/ios-app-sign-in.png)

### Links, Benachrichtigungen, Vibration und Abrechnung {#ios-app-operation}

Ein Link auf `www.minddy.app`, den du in Mail, Nachrichten oder Notizen antippst, öffnet die App auf dieser Seite, ob sie lief oder nicht: ein Ticket, ein Projekt, eine Seite oder ein E-Mail-Link, der dein Konto bestätigt, dein Passwort zurücksetzt oder eine Einladung annimmt. Links zur Abrechnung, zur öffentlichen Website, zu diesem Handbuch und öffentliche Freigabelinks öffnen sich weiterhin im Browser. Links auf eine selbst gehostete Instanz öffnen sich im Browser, und solange die App mit einem selbst gehosteten Server verbunden ist, öffnet sich ein minddy-Cloud-Link in Safari. In der App öffnen sich Links zur öffentlichen Website, etwa zu den Preisen, zum Handbuch oder zu den rechtlichen Seiten, in einem Safari-Fenster über der App.

Um Push-Benachrichtigungen zu erhalten, öffne in der App **Kontoeinstellungen** → **Benachrichtigungen** und aktiviere **Dieses Gerät benachrichtigen**. iOS fragt beim ersten Mal nach der Erlaubnis; danach kommen Benachrichtigungen auch an, wenn die App geschlossen ist. Ein Tipp auf eine Benachrichtigung öffnet das Ticket, die Seite oder das Element, um das es geht. Blockiert iOS die Benachrichtigungen, öffnet **Einstellungen öffnen** die Benachrichtigungseinstellungen von minddy in der App Einstellungen. Siehe [Gerätebenachrichtigungen aktivieren](#devices-and-notifications).

Die App vibriert leicht, wenn du eine Option wählst, einen Schalter umlegst oder etwas kopierst, und kräftiger, wenn du ein Ticket oder ein Ziel erstellst, ein Ticket abschließt oder einen Kommentar sendest. Um das auszuschalten, öffne **Kontoeinstellungen** → **Einstellungen** → **Mobile App** und deaktiviere **Vibration**. Die Einstellung gehört zu deinem Konto und gilt deshalb auch auf deinen anderen Telefonen.

Die App verkauft nichts. Sie zeigt weder die Abrechnungsseite noch Pläne oder Upgrade-Schaltflächen, und eine Funktion, die dein Plan nicht enthält, sagt das, ohne ein Upgrade anzubieten. Verwalte dein Abonnement im Browser auf der Website von minddy; die App erkennt deinen Plan, sobald du dich anmeldest.

### KI-Funktionen erlauben oder ablehnen {#ios-app-ai}

Numo, Smart Fill, das Diktieren und die Suche senden die Inhalte, mit denen sie arbeiten (Tickettexte, Kommentare, Seiten, Aufnahmen), an den Anbieter des KI-Modells, das die Instanz verwendet. Vor der ersten solchen Anfrage fragt die App auf jedem Gerät einmal **KI-Funktionen nutzen?**, nach der Anmeldung und den ersten Schritten. Die Datenschutzerklärung, die das Fenster verlinkt, nennt die Anbieter. Wähle **Erlauben**, um die KI-Funktionen zu nutzen, oder **Nicht jetzt**, um sie in dieser App ausgeschaltet zu lassen. Schließt du das Fenster ohne Auswahl, fragt die App beim nächsten Start erneut. Die Abmeldung löscht die Antwort, sodass das nächste Konto auf dem Gerät wieder gefragt wird.

Lehnst du ab, startet die App keine KI-Arbeit: Eine Nachricht an Numo, ein Diktat oder eine andere KI-Funktion öffnet das Fenster erneut, damit du sie von dort aus erlauben kannst. Ein neues Ticket wird ohne Smart Fill erstellt, die Ticketsuche findet Tickets nur über ihre Wörter, ohne [Suche nach Bedeutung](/de/dokumentation/navigation#search-by-meaning), und eine Erwähnung von Numo in einem Kommentar bleibt unbeantwortet. Der Rest von minddy funktioniert wie gewohnt. Das Web und die Desktop-App stellen diese Frage nie, und eine Ablehnung in der App schränkt dich dort nicht ein. Deine letzte Antwort gilt jedoch für die KI-Arbeit, die minddy im Hintergrund für dein Konto ausführt: Nach **Nicht jetzt** nutzen Smart Assign und Smart Fill in deinen eigenen Projekten, deine geplanten Routinen und die Erinnerungen von Numo keine KI mehr.

Um deine Antwort zu ändern, öffne **Kontoeinstellungen** → **Einstellungen** → **Mobile App** und schalte **KI-Funktionen** ein oder aus.

![Das Fenster KI-Funktionen nutzen? der iOS-App mit Nicht jetzt und Erlauben.](/documentation/de/ios-app-ai-consent.png)

![Der Bereich Mobile App in den Einstellungen der iOS-App mit den Schaltern Vibration und KI-Funktionen.](/documentation/de/ios-app-mobile-preferences.png)

## Die Web-App auf Telefon oder Tablet installieren {#install-the-pwa}

Auf iPhone und iPad ist die [iOS-App](#ios-app) die übliche Wahl. Die installierte Web-App bleibt für Android verfügbar und für alle, die den Browser bevorzugen.

Öffne die gewünschte minddy-Instanz in Safari auf dem iPhone oder iPad oder in Chrome beziehungsweise einem kompatiblen Android-Browser. Wurde der Link innerhalb einer anderen App geöffnet, öffne ihn zuerst im vollständigen Browser. Für eine selbst gehostete Instanz verwendest du die Adresse deines eigenen Servers.

Wähle unter iOS Teilen und anschließend Zu Home-Bildschirm hinzufügen. Lass Als Web-App öffnen aktiviert und tippe auf Hinzufügen. Je nach Safari-Oberfläche musst du vor Teilen zunächst Mehr öffnen. Fehlt die Aktion, prüfe Aktionen bearbeiten.

Nutze unter Android die angebotene Installationsaufforderung oder wähle im Browsermenü App installieren beziehungsweise Zum Startbildschirm hinzufügen. Bestätige anschließend die Installation. Die Beschriftungen hängen vom Browser ab. Öffne das neue Symbol und melde dich mit dem Konto dieser Instanz an. So installiert der Browser minddy als Web-App.

### Updates, Offlinezugriff und Push {#operation}

Durch die Installation entsteht keine Offlinekopie des Projekts. Der Service Worker von minddy verarbeitet nur Push-Benachrichtigungen und speichert keine Anwendungsanfragen im Cache. Verwende eine Netzwerkverbindung und lade die Seite neu, um aktuelle Webinhalte abzurufen. Benachrichtigungen benötigen außerdem einen unterstützten Browser, dessen Berechtigung und eine serverseitige Push-Konfiguration. Unter iOS verwendest du die installierte App, wenn der Ablauf dies verlangt. Fehlt die Installationsoption, öffne einen unterstützten vollständigen Browser und prüfe, ob die Instanz bereits installiert ist.

![Illustrierte Safari-Installationsanleitung von minddy: Teilen, zum Home-Bildschirm hinzufügen und bestätigen.](/documentation/de/install-the-pwa-workflow.png)

## Desktop-App installieren und verwalten {#desktop-app}

Öffne die öffentliche Downloadseite. Wähle unter macOS das Paket für Apple silicon oder Intel. Installiere die Anwendung unter Windows über den Microsoft Store. Wähle unter Linux ein AppImage oder ein signiertes `deb`/`rpm`-Paket für x64 oder ARM64. Befolge die Plattformanleitung und die Hinweise zur Paketprüfung. Für Windows gibt es keinen `exe`-Installer. Die macOS-App benötigt macOS 13 (Ventura) oder neuer; auf einer älteren Version behält eine bereits installierte App ihre aktuelle Version und erhält keine weiteren Updates.

Beim ersten Start öffnet die App den Bildschirm **Anmelden oder registrieren** von minddy Cloud, auf dem du dich anmeldest oder dein Konto anlegst. Um stattdessen deine eigene Instanz zu nutzen, klicke unten auf diesem Bildschirm auf **minddy selbst hosten**. Das öffnet **minddy selbst hosten** mit drei Optionen: **Auf diesem Computer installieren** richtet eine [lokale Instanz](/de/dokumentation/install-locally#install-locally) ein, **Auf einem Server installieren** öffnet die öffentliche Anleitung für eine Serverinstallation in deinem Browser, und **Bestehende Installation verwenden** öffnet einen Bildschirm, der deine vorhandenen Installationen bündelt. Dort öffnet **Auf diesem Computer** einen minddy-Ordner, der bereits auf diesem Computer liegt, und die App startet ihn; darunter verbindet dich **Serveradresse** mit **Verbinden** mit einem Server, den du betreibst. Entfernte Server benötigen HTTPS; `localhost` kann HTTP verwenden.

Um den Server später zu wechseln, wähle **Connect to a Server…** im nativen Menü minddy (das native Menü ist englisch; unter Windows und Linux blendet Alt die Menüleiste ein), **Ändern…** neben **Verbundener Server** unter **Kontoeinstellungen** → **Einstellungen** → **Desktop-App** oder **minddy selbst hosten** unten auf dem Bildschirm **Anmelden oder registrieren**. Jeder Weg bringt das App-Fenster zu **minddy selbst hosten**; ist ein selbst gehosteter Server verbunden, kehrst du unter **Bestehende Installation verwenden** mit **minddy Cloud verwenden** zu Cloud zurück. Der Pfad oben auf der Seite führt zu jedem Schritt zurück, und das minddy-Logo führt zurück in die App. Dieser Bildschirm ist in die Desktop-App eingebaut und öffnet sich ohne Internetverbindung. Prüfe das Ziel vor der Anmeldung: Jedes Konto gehört zu seiner Instanz. OAuth verwendet den Systembrowser und kehrt anschließend zur Desktop-App zurück.

Unter macOS und Windows 11 zeigen Seitenleiste, Tabs und Fensterränder deinen Desktop verschwommen hinter dem deckenden Inhalt. Ein Fenster im Vollbildmodus bleibt deckend; die Transparenz kehrt zurück, sobald es den Vollbildmodus verlässt. Damit das Fenster auf diesem Gerät deckend bleibt, schalte **Transparenz der Desktop-App** unter **Kontoeinstellungen** → **Einstellungen** → [Aussehen](/docs/accounts#preferences) aus.

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

Öffne die Benachrichtigungen in den Kontoeinstellungen auf dem Gerät, das du registrieren möchtest. Aktiviere sie und erlaube die Anfrage des Browsers oder Betriebssystems. Eine verweigerte Erlaubnis musst du in den Browser- oder Systemeinstellungen ändern; wiederholtes Betätigen des minddy-Schalters kann sie nicht umgehen. Die [iOS-App](#ios-app-operation) registriert sich direkt. Installiere und öffne in Safari auf iPhone oder iPad zuerst die Web-App, wenn die Oberfläche dies verlangt.

Prüfe, ob das Gerät in der Liste erscheint, und verwende seinen Testbefehl. Lies die Angaben zur letzten Zustellung. Du kannst einzelne Registrierungen deaktivieren oder entfernen, ohne das Konto zu löschen. Die Kategorien unter **Kontoeinstellungen** → **Benachrichtigungen** bestimmen, welche Ereignisse dich benachrichtigen. Der Posteingang in der Anwendung bleibt verfügbar, wenn Push nicht verfügbar ist.

![Push-Einstellungen mit gesperrter Browserberechtigung und ohne registriertes Gerät.](/documentation/de/devices-and-notifications-workflow.png)

### Plattformbedingungen {#platforms}

Web-Push erfordert einen unterstützten Browser und einen konfigurierten Push-Dienst der Instanz. Native Hinweise und Hintergrundzustellung unterscheiden sich je nach Plattform. Die iOS-App empfängt Benachrichtigungen über APNs, auch wenn sie geschlossen ist. Die signierte macOS-Anwendung als Installationspaket unterstützt APNs; das Windows-Paket benötigt den optionalen WNS-Helfer für den Hintergrundtransport. Linux verwendet die Hintergrundsitzung der installierten Anwendung statt APNs oder WNS.

Wenn auf dem ausgewählten Server APNs oder WNS nicht konfiguriert ist, verwendet die Desktop-App lokale native Benachrichtigungen, solange sie läuft oder ausgeblendet ist. Nach dem Beenden der App werden über diesen Ersatzweg keine Benachrichtigungen mehr zugestellt.

Prüfe die Benachrichtigungserlaubnis des Betriebssystems, den Installationszustand im Browser und die angezeigte Erklärung, falls die Funktion nicht eingerichtet oder nicht unterstützt ist. Ein erfolgreicher Test garantiert keine Zustellung ohne Netz oder unter sämtlichen Hintergrundbeschränkungen des Betriebssystems. Halte die Anwendung oder ihren eingerichteten Hintergrunddienst entsprechend den Anforderungen der Plattform verfügbar.

![Aktives, für das Konto registriertes Browser-Gerät mit dem tatsächlichen Datum des letzten Versands.](/documentation/de/devices-and-notifications-registered.png)
