---
{
  "id": "desktop-app",
  "locale": "it",
  "title": "Installare e gestire l’app desktop",
  "summary": "Scegliere pacchetto e istanza e seguire l’aggiornamento appropriato.",
  "topic": "Account e applicazioni",
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
      "src": "/documentation/it/desktop-app-workflow.png",
      "alt": "Impostazioni desktop nella vera app Electron di sviluppo per macOS, versione 0.11.1, collegata al server locale con un profilo isolato.",
      "caption": "Impostazioni desktop nella vera app Electron di sviluppo per macOS, versione 0.11.1, collegata al server locale con un profilo isolato. La cattura non convalida release firmate né altri sistemi operativi.",
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

## Installare e scegliere un server {#desktop-app}
Apri la pagina pubblica dei download. Su macOS, scegli il pacchetto per Apple silicon o Intel. Su Windows, installa l’app da Microsoft Store. Su Linux, scegli un’AppImage o un pacchetto deb/rpm firmato per x64 o ARM64. Segui la guida della piattaforma e le istruzioni di verifica del pacchetto. Windows non offre un installer exe.

Nel selettore del server, scegli Minddy Cloud, l’origine di un server self-hosted o il runtime locale disponibile. Controlla la destinazione prima di accedere: gli account appartengono alle rispettive istanze. OAuth usa il browser di sistema e ritorna poi all’app desktop. Un runtime locale non significa che il worker di codice Numo lavori nel tuo checkout locale.

## Schede, chiusura e aggiornamenti {#operation}
Usa i controlli delle schede e la palette dei comandi per spostarti tra le attività. Segui le scorciatoie mostrate per la piattaforma: macOS usa Command dove Windows e Linux usano generalmente Control. Chiudere la finestra la nasconde e lascia l’app in esecuzione. Usa Esci per terminare l’applicazione; su macOS puoi anche usare Cmd+Q. Le notifiche in background dipendono dal pacchetto e dalle funzioni della piattaforma.

macOS e le AppImage portatili offrono aggiornamenti nell’app. Windows li installa tramite Microsoft Store. Per deb/rpm, installa il nuovo pacchetto verificato. Le impostazioni desktop dell’account mostrano il server collegato e i controlli di aggiornamento o assistenza disponibili. Dopo l’aggiornamento, controlla la versione desktop visualizzata e verifica che si apra ancora l’istanza desiderata.

![Impostazioni desktop nella vera app Electron di sviluppo per macOS, versione 0.11.1, collegata al server locale con un profilo isolato.](/documentation/it/desktop-app-workflow.png)
