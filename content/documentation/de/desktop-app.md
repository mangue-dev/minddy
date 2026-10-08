---
{
  "id": "desktop-app",
  "locale": "de",
  "title": "Desktop-App installieren und verwalten",
  "summary": "Plattformpaket und Instanz wählen und den passenden Updateweg verwenden.",
  "topic": "Konto und Apps",
  "type": "guide",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "A12"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "content/knowledge/desktop-and-speed.md",
      "app/(marketing)/download/page.tsx",
      "components/settings/account-desktop-section.tsx",
      "docs/linux-desktop.md",
      "content/documentation/reviews/desktop-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "install-the-pwa",
    "web-and-mobile",
    "devices-and-notifications",
    "import-issues"
  ],
  "aliases": [
    "desktop-and-speed"
  ],
  "tags": [],
  "figures": [
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/de/desktop-app-workflow.png",
      "alt": "Desktop-Einstellungen in der echten macOS-Electron-Entwicklungsapp, Version 0.11.1, mit lokalem Server und isoliertem Profil.",
      "caption": "Desktop-Einstellungen in der echten macOS-Electron-Entwicklungsapp, Version 0.11.1, mit lokalem Server und isoliertem Profil. Die Aufnahme bestätigt keine signierten Releases oder anderen Betriebssysteme.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "desktop-app-workflow"
  ]
}
---

## Installieren und einen Server wählen {#desktop-app}
Öffnen Sie die öffentliche Downloadseite. Wählen Sie unter macOS das Paket für Apple silicon oder Intel. Installieren Sie die Anwendung unter Windows über den Microsoft Store. Wählen Sie unter Linux ein AppImage oder ein signiertes deb/rpm-Paket für x64 oder ARM64. Befolgen Sie die Plattformanleitung und die Hinweise zur Paketprüfung. Für Windows gibt es keinen exe-Installer.

Wählen Sie in der Serverauswahl Minddy Cloud, die Origin eines selbst gehosteten Servers oder die verfügbare lokale Laufzeit. Prüfen Sie das Ziel vor der Anmeldung: Jedes Konto gehört zu seiner Instanz. OAuth verwendet den Systembrowser und kehrt anschließend zur Desktop-App zurück. Eine lokale Laufzeit bedeutet nicht, dass Numos Code-Worker in Ihrem lokalen Checkout arbeitet.

## Tabs, Schließen und Updates {#operation}
Navigieren Sie mit den Tab-Steuerelementen und der Befehlspalette zwischen Ihren Aufgaben. Verwenden Sie die angezeigten Plattformkürzel. Unter macOS ist es Command, wo Windows und Linux normalerweise Control verwenden. Das Schließen des Fensters blendet es aus; die Anwendung läuft weiter. Verwenden Sie Beenden, um die Anwendung zu stoppen, unter macOS auch Cmd+Q. Hintergrundbenachrichtigungen hängen vom Paket und den Plattformfunktionen ab.

Unter macOS und mit portablen AppImages sind Updates in der Anwendung verfügbar. Windows aktualisiert sie über den Microsoft Store. Für deb/rpm installieren Sie das nächste geprüfte Paket. Die Desktop-Einstellungen des Kontos zeigen den verbundenen Server und die verfügbaren Update- oder Supportfunktionen. Prüfen Sie nach einem Update die angezeigte Desktop-Version und ob weiterhin die gewünschte Instanz geöffnet wird.

![Desktop-Einstellungen in der echten macOS-Electron-Entwicklungsapp, Version 0.11.1, mit lokalem Server und isoliertem Profil.](/documentation/de/desktop-app-workflow.png)
