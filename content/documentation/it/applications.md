---
{
  "id": "applications",
  "locale": "it",
  "title": "App web, mobili e desktop",
  "summary": "Usa minddy nel browser, installa l’app web su telefono o tablet o l’app desktop e configura le notifiche del dispositivo.",
  "topic": "Account e applicazioni",
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
  "revision": 4,
  "sourceRevision": 4,
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
      "content/documentation/reviews/push-registration-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
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
    "Lavorare nel browser e su mobile",
    "Installare l’app web su telefono o tablet",
    "Installare e gestire l’app desktop",
    "Attivare notifiche su un dispositivo"
  ],
  "figures": [
    {
      "id": "web-and-mobile-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/web-and-mobile-workflow.png",
      "alt": "Pannello mobile di un ticket con titolo, descrizione, proprietà e campo per i commenti.",
      "caption": "Su uno schermo stretto, i dettagli della issue occupano un pannello adattabile. Usa il pulsante di chiusura per tornare al progetto; Numo resta accessibile dal pulsante mobile.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        390,
        844
      ],
      "theme": "dark"
    },
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/install-the-pwa-workflow.png",
      "alt": "Guida illustrata di minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.",
      "caption": "La guida pubblica illustra i tre passaggi di Safari e l’opzione Apri come app web da mantenere attiva. Sono illustrazioni didattiche mostrate da minddy, non schermate di un’installazione iOS completata.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    },
    {
      "id": "desktop-app-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/desktop-app-workflow.png",
      "alt": "Impostazioni desktop nella vera app Electron di sviluppo per macOS, versione 0.11.1, collegata al server locale con un profilo isolato.",
      "caption": "Impostazioni desktop nella vera app Electron di sviluppo per macOS, versione 0.11.1, collegata al server locale con un profilo isolato. La cattura non convalida release firmate né altri sistemi operativi.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        860
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/devices-and-notifications-workflow.png",
      "alt": "Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.",
      "caption": "Questo browser blocca le notifiche. Ripristina il permesso del sito prima di registrare il dispositivo.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/devices-and-notifications-registered.png",
      "alt": "Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.",
      "caption": "L’account ha un dispositivo browser registrato e attivo. L’elenco mostra la data di registrazione e quella dell’ultimo invio. La comparsa di un avviso dipende comunque dal permesso del browser e dalle impostazioni del sistema operativo.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
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

Puoi usare minddy nel browser, installare l’app web su un dispositivo mobile o usare l’app desktop. Installazione, aggiornamenti e notifiche dipendono dalla piattaforma; l’accesso offline e la consegna delle notifiche hanno i limiti descritti nelle rispettive sezioni.

## Lavorare nel browser e su mobile {#web-and-mobile}

Apri l’indirizzo della tua istanza e accedi a quella stessa istanza. Su uno schermo stretto, mostra la barra laterale per scegliere un progetto e apri un ticket dall’elenco o dalla board. Leggi i dettagli nel pannello adattato allo schermo, modifica il campo desiderato o aggiungi un commento e attendi l’esito del salvataggio prima di chiudere. Chiudi il pannello dei dettagli per tornare all’elenco; la sua presentazione mobile differisce da quella su uno schermo ampio.

Apri Numo tramite il pulsante flottante o un’azione contestuale del ticket. Controlla il contesto del ticket nel campo di composizione. Se un pannello copre il contenuto che ti serve, chiudilo prima di proseguire la navigazione. Sui dispositivi touch usa i pulsanti e i menu visibili, senza presumere che siano disponibili azioni al passaggio del mouse o scorciatoie desktop.

### Tastiera e connessione {#access}

Con la tastiera puoi spostare il focus sui controlli e usare la palette dei comandi per navigare ed eseguire le azioni comuni. Il pulsante di invio visibile rimane un’alternativa all’invio da tastiera. Segui la scorciatoia mostrata dall’applicazione per la tua piattaforma.

Il browser e l’app web installata richiedono una connessione di rete per consultare i dati dei progetti e salvare le modifiche. Il service worker gestisce le notifiche push senza fornire una cache di dati offline. Dopo un errore di connessione, verifica se la modifica è stata salvata prima di ripeterla. Installare la PWA non crea un account separato e non aggira i permessi dell’istanza.

![Pannello mobile di un ticket con titolo, descrizione, proprietà e campo per i commenti.](/documentation/it/web-and-mobile-workflow.png)

## Installare l’app web su telefono o tablet {#install-the-pwa}

Apri l’istanza minddy che vuoi usare in Safari su iPhone o iPad oppure in Chrome o in un altro browser Android compatibile. Se il link si è aperto all’interno di un’altra app, aprilo prima nel browser completo. Per un’istanza self-hosted, usa l’indirizzo del tuo server.

Su iOS, apri Condividi e scegli Aggiungi alla schermata Home. Lascia attiva l’opzione Apri come app web e tocca Aggiungi. A seconda dell’interfaccia di Safari, potrebbe essere necessario aprire Altro prima di Condividi. Se l’azione manca, controlla Modifica azioni.

Su Android, usa la proposta di installazione oppure scegli Installa l’app o Aggiungi alla schermata Home dal menu del browser e conferma Installa. I nomi dipendono dal browser. Apri la nuova icona e accedi con l’account di quell’istanza. Si tratta di una PWA installata dal browser; non esiste un’app nativa minddy nell’App Store di iOS o su Google Play.

### Aggiornamenti, accesso offline e notifiche {#operation}

L’installazione non crea una copia offline del progetto. Il service worker di minddy gestisce soltanto le notifiche push e non conserva le richieste dell’applicazione nella cache. Usa una connessione di rete e ricarica la pagina per ottenere i contenuti web aggiornati. Le notifiche richiedono anche un browser compatibile, il suo permesso e una configurazione push sul server. Su iOS, usa l’app installata quando il percorso lo richiede. Se l’opzione di installazione non compare, apri un browser completo compatibile e controlla se l’istanza è già installata.

![Guida illustrata di minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.](/documentation/it/install-the-pwa-workflow.png)

## Installare e gestire l’app desktop {#desktop-app}

Apri la pagina pubblica dei download. Su macOS, scegli il pacchetto per Apple silicon o Intel. Su Windows, installa l’app da Microsoft Store. Su Linux, scegli un’AppImage o un pacchetto deb/rpm firmato per x64 o ARM64. Segui la guida della piattaforma e le istruzioni di verifica del pacchetto. Windows non offre un installer exe.

Nel selettore del server, scegli minddy Cloud, l’origine di un server self-hosted o il runtime locale disponibile. Controlla la destinazione prima di accedere: gli account appartengono alle rispettive istanze. OAuth usa il browser di sistema e ritorna poi all’app desktop. Un runtime locale non significa che il worker di codice Numo lavori nel tuo checkout locale.

### Schede, chiusura e aggiornamenti {#desktop-app-operation}

Usa i controlli delle schede e la palette dei comandi per spostarti tra le attività. Segui le scorciatoie mostrate per la piattaforma: macOS usa Command dove Windows e Linux usano generalmente Control. Chiudere la finestra la nasconde e lascia l’app in esecuzione. Usa Esci per terminare l’applicazione; su macOS puoi anche usare Cmd+Q. Le notifiche in background dipendono dal pacchetto e dalle funzioni della piattaforma.

macOS e le AppImage portatili offrono aggiornamenti nell’app. Windows li installa tramite Microsoft Store. Per deb/rpm, installa il nuovo pacchetto verificato. Le impostazioni desktop dell’account mostrano il server collegato e i controlli di aggiornamento o assistenza disponibili. Dopo l’aggiornamento, controlla la versione desktop visualizzata e verifica che si apra ancora l’istanza desiderata.

![Impostazioni desktop nella vera app Electron di sviluppo per macOS, versione 0.11.1, collegata al server locale con un profilo isolato.](/documentation/it/desktop-app-workflow.png)

## Attivare notifiche su un dispositivo {#devices-and-notifications}

Apri le notifiche nelle impostazioni dell’account sul dispositivo che vuoi registrare. Attivale e accetta la richiesta di autorizzazione del browser o del sistema operativo. Se hai negato il permesso, devi modificarlo nelle impostazioni del browser o del sistema; azionare ripetutamente il controllo di minddy non può superare quel rifiuto. Su iOS, installa e apri prima l’app web quando l’interfaccia lo richiede.

Verifica che il dispositivo compaia nell’elenco e usa il suo comando di prova. Controlla le informazioni sull’ultima consegna. Puoi disattivare o rimuovere singole registrazioni senza eliminare l’account. Le preferenze della Posta in arrivo dell’app determinano quali eventi generano notifiche; la Posta in arrivo resta disponibile anche quando il push non funziona.

![Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.](/documentation/it/devices-and-notifications-workflow.png)

### Condizioni per piattaforma {#platforms}

Il push web richiede un browser supportato e un servizio push configurato sull’istanza. I banner nativi e la consegna in background dipendono dalla piattaforma. L’app macOS firmata e distribuita supporta APNs; il pacchetto Windows richiede il componente WNS opzionale per il trasporto in background. Linux utilizza la sessione in background dell’app distribuita, anziché APNs o WNS.

Controlla il permesso per le notifiche nel sistema operativo, lo stato di installazione nel browser e l’eventuale spiegazione che indica una funzione non configurata o non supportata. Una prova riuscita non garantisce la consegna senza rete o in presenza di tutte le restrizioni del sistema sul lavoro in background. Mantieni disponibile l’applicazione o il suo servizio in background configurato, secondo i requisiti della piattaforma.

![Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.](/documentation/it/devices-and-notifications-registered.png)
