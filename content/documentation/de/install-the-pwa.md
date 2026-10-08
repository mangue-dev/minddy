---
{
  "id": "install-the-pwa",
  "locale": "de",
  "title": "Die Web-App auf Telefon oder Tablet installieren",
  "summary": "Die Instanz zum Startbildschirm hinzufügen und Netzwerk- sowie Push-Bedingungen verstehen.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A11"
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "public/sw.js",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json"
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
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/install-the-pwa-workflow.png",
      "alt": "Illustrierte Safari-Installationsanleitung von Minddy: Teilen, zum Home-Bildschirm hinzufügen und bestätigen.",
      "caption": "Die öffentliche Anleitung illustriert die drei Safari-Schritte und die aktivierte Option Als Web-App öffnen. Die Abbildungen sind von Minddy dargestellte Anleitungen und keine Aufnahmen einer abgeschlossenen iOS-Installation.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-the-pwa-workflow"
  ]
}
---

## Im Browser installieren {#install-the-pwa}
Öffnen Sie die gewünschte Minddy-Instanz in Safari auf dem iPhone oder iPad oder in Chrome beziehungsweise einem kompatiblen Android-Browser. Wurde der Link innerhalb einer anderen App geöffnet, öffnen Sie ihn zuerst im vollständigen Browser. Für eine selbst gehostete Instanz verwenden Sie die Adresse Ihres eigenen Servers.

Wählen Sie unter iOS Teilen und anschließend Zu Home-Bildschirm hinzufügen. Lassen Sie Als Web-App öffnen aktiviert und tippen Sie auf Hinzufügen. Je nach Safari-Oberfläche müssen Sie vor Teilen zunächst Mehr öffnen. Fehlt die Aktion, prüfen Sie Aktionen bearbeiten.

Nutzen Sie unter Android die angebotene Installationsaufforderung oder wählen Sie im Browsermenü App installieren beziehungsweise Zum Startbildschirm hinzufügen. Bestätigen Sie anschließend die Installation. Die Beschriftungen hängen vom Browser ab. Öffnen Sie das neue Symbol und melden Sie sich mit dem Konto dieser Instanz an. Es handelt sich um eine im Browser installierte PWA; im iOS App Store oder bei Google Play gibt es keine native Minddy-App.

## Updates, Offlinezugriff und Push {#operation}
Durch die Installation entsteht keine Offlinekopie des Projekts. Der Service Worker von Minddy verarbeitet nur Push-Benachrichtigungen und speichert keine Anwendungsanfragen im Cache. Verwenden Sie eine Netzwerkverbindung und laden Sie die Seite neu, um aktuelle Webinhalte abzurufen. Benachrichtigungen benötigen außerdem einen unterstützten Browser, dessen Berechtigung und eine serverseitige Push-Konfiguration. Unter iOS verwenden Sie die installierte App, wenn der Ablauf dies verlangt. Fehlt die Installationsoption, öffnen Sie einen unterstützten vollständigen Browser und prüfen Sie, ob die Instanz bereits installiert ist.

![Illustrierte Safari-Installationsanleitung von Minddy: Teilen, zum Home-Bildschirm hinzufügen und bestätigen.](/documentation/de/install-the-pwa-workflow.png)
