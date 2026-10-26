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
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; 3 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (it/es catalog review recapture of web-and-mobile-workflow, devices-and-notifications-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, components/auth/auth-chrome.tsx, desktop/src/main.ts, desktop/src/menu.ts and lib/desktop/server-choice.ts; no desktop walkthrough, no screenshot recaptured)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (it figure update after the catalog review; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-781 translation on self-hosting from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance)",
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
      "caption": "Su uno schermo stretto, i dettagli del ticket occupano un pannello adattabile. Usa il pulsante di chiusura per tornare al progetto; Numo resta accessibile dal pulsante mobile.",
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
      "src": "/documentation/it/install-the-pwa-workflow.png",
      "alt": "Guida illustrata di minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.",
      "caption": "La guida pubblica illustra i tre passaggi di Safari e l’opzione Apri come app web da mantenere attiva. Sono illustrazioni didattiche mostrate da minddy, non schermate di un’installazione iOS completata.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1488,
        759
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/devices-and-notifications-workflow.png",
      "alt": "Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.",
      "caption": "Questo browser blocca le notifiche. Ripristina il permesso del sito prima di registrare il dispositivo.",
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
      "src": "/documentation/it/devices-and-notifications-registered.png",
      "alt": "Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.",
      "caption": "L’account ha un dispositivo browser registrato e attivo. L’elenco mostra la data di registrazione e quella dell’ultimo invio. La comparsa di un avviso dipende comunque dal permesso del browser e dalle impostazioni del sistema operativo.",
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
      "src": "/documentation/it/desktop-renderer-recovery.png",
      "alt": "Pagina locale di ripristino dopo un arresto forzato del processo di rendering, con i controlli Reload window e Check server settings.",
      "caption": "Pagina di ripristino nell’app di sviluppo per macOS, con un profilo isolato e un server dimostrativo. L’interfaccia nativa usa etichette in inglese in tutte le lingue.",
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

Puoi accedere alla stessa istanza minddy dal browser, dall’app web installata o dall’app desktop. Segui la procedura per il tuo dispositivo e controlla i requisiti di connessione, gli aggiornamenti e i permessi di notifica della piattaforma.

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

Apri la pagina pubblica dei download. Su macOS, scegli il pacchetto per Apple silicon o Intel. Su Windows, installa l’app da Microsoft Store. Su Linux, scegli un’AppImage o un pacchetto `deb`/`rpm` firmato per x64 o ARM64. Segui la guida della piattaforma e le istruzioni di verifica del pacchetto. Windows non offre un installer `exe`. L’app per macOS richiede macOS 13 (Ventura) o versioni successive; su una versione precedente, un’app già installata mantiene la versione attuale e non riceve altri aggiornamenti.

Al primo avvio, l’app apre la schermata di registrazione di minddy Cloud, dove crei il tuo account. Per usare invece una tua istanza, fai clic su **Ospita minddy in autonomia**, in fondo alle schermate di accesso e di registrazione. Si apre **Ospita minddy in autonomia**, con tre scelte: **Installa su questo computer** prepara un’[istanza locale](/it/documentazione/install-locally#install-locally), **Installa su un server** apre nel browser la guida pubblica per installare un server, e **Usa un’installazione esistente** apre una schermata che raccoglie le installazioni che hai già. Lì, **Su questo computer** apre una cartella di minddy già presente su questo computer e l’app la avvia; sotto, **Indirizzo del server** con **Connetti** ti collega a un server che gestisci. I server remoti richiedono HTTPS; `localhost` può usare HTTP.

Per cambiare server in seguito, scegli **Connect to a Server…** nel menu nativo minddy (il menu nativo è in inglese; su Windows e Linux premi Alt per mostrare la barra dei menu), **Cambia…** accanto a **Server connesso** in **Impostazioni account** → **Preferenze** → **App desktop**, oppure **Ospita minddy in autonomia** in fondo alle schermate di accesso e di registrazione. Ognuno porta la finestra dell’app su **Ospita minddy in autonomia**; quando è connesso un server self-hosted, **Usa minddy Cloud**, in **Usa un’installazione esistente**, riporta a Cloud. Il percorso in alto nella pagina riporta a ogni passaggio e il logo di minddy riporta all’app. Questa schermata è integrata nell’app desktop e si apre senza connessione a Internet. Controlla la destinazione prima di accedere: gli account appartengono alle rispettive istanze. OAuth usa il browser di sistema e ritorna poi all’app desktop.

### Schede, chiusura e aggiornamenti {#desktop-app-operation}

Usa i controlli delle schede e la palette dei comandi per spostarti tra le attività. Segui le scorciatoie mostrate per la piattaforma: macOS usa Command dove Windows e Linux usano generalmente Control. Chiudere la finestra la nasconde e lascia l’app in esecuzione. Usa Esci per terminare l’applicazione; su macOS puoi anche usare Cmd+Q. Le notifiche in background dipendono dal pacchetto e dalle funzioni della piattaforma.

macOS e le AppImage portatili offrono aggiornamenti nell’app. Windows li installa tramite Microsoft Store. Per `deb`/`rpm`, installa il nuovo pacchetto verificato. Nell’app desktop, **Impostazioni account** → **Preferenze** → **App desktop** mostra il server collegato e la versione dell’app, con un controllo degli aggiornamenti quando il pacchetto lo supporta. Sul web, lo stesso riquadro rimanda alla pagina di download. Dopo l’aggiornamento, controlla la versione desktop visualizzata e verifica che si apra ancora l’istanza desiderata.

### Ripristinare una finestra dopo un arresto anomalo {#desktop-renderer-recovery}

Se una finestra desktop si arresta in modo anomalo, una pagina locale di ripristino offre **Reload window**. Usa questo pulsante per riaprire l’ultima schermata sul server attualmente selezionato. Le modifiche non salvate potrebbero andare perse. L’app attende la tua azione invece di ricaricare ripetutamente la pagina che non funziona. Se anche la pagina di ripristino non funziona, il messaggio nativo chiede di chiudere e riaprire minddy. Questi controlli nativi di ripristino usano attualmente etichette in inglese.

Se una pagina è ancora in caricamento dopo 30 secondi, oppure una finestra non risponde per cinque secondi da quando l’app desktop rileva il blocco, una finestra di dialogo nativa propone **Wait** e **Recover window**. **Wait** è la scelta predefinita e mantiene il lavoro e la richiesta in corso. La finestra di dialogo si chiude quando il caricamento termina o la finestra torna a rispondere. Il recupero può perdere modifiche non salvate: scegli **Recover window** per aprire la pagina locale di recupero, poi **Reload window** per tornare all’ultima schermata.

La cache delle query salvata, che è facoltativa, può contenere fino a 2 MiB di dati. Se l’intera cache è troppo grande, minddy conserva i risultati completi delle query che possono essere salvati, dando priorità, quando necessario, alle viste correnti e alle schede presenti nella barra. Se anche questa selezione supera il limite, la precedente istantanea locale viene rimossa. I dati esclusi dalla cache salvata restano in memoria durante la sessione e vengono recuperati di nuovo quando servono dopo un riavvio. Le bozze salvate separatamente non sono interessate. Questa cache non è un backup del tuo lavoro.

Per ridurre l’uso della memoria nelle sessioni lunghe, i dettagli delle PR, i diff di commit e i contenuti delle pagine inattivi vengono rilasciati dopo un minuto e ricaricati quando servono. Le query attive vengono conservate. Le etichette delle schede mantengono solo informazioni leggere sulle PR: lasciare una scheda aperta non trattiene quindi le sue patch.

![Pagina locale di ripristino dopo un arresto forzato del processo di rendering, con i controlli Reload window e Check server settings.](/documentation/it/desktop-renderer-recovery.png)

## Attivare notifiche su un dispositivo {#devices-and-notifications}

Apri le notifiche nelle impostazioni dell’account sul dispositivo che vuoi registrare. Attivale e accetta la richiesta di autorizzazione del browser o del sistema operativo. Se hai negato il permesso, devi modificarlo nelle impostazioni del browser o del sistema; azionare ripetutamente il controllo di minddy non può superare quel rifiuto. Su iOS, installa e apri prima l’app web quando l’interfaccia lo richiede.

Verifica che il dispositivo compaia nell’elenco e usa il suo comando di prova. Controlla le informazioni sull’ultima consegna. Puoi disattivare o rimuovere singole registrazioni senza eliminare l’account. Le categorie di **Impostazioni account** → **Notifiche** determinano quali eventi generano notifiche; la Posta in arrivo resta disponibile anche quando il push non funziona.

![Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.](/documentation/it/devices-and-notifications-workflow.png)

### Condizioni per piattaforma {#platforms}

Il push web richiede un browser supportato e un servizio push configurato sull’istanza. I banner nativi e la consegna in background dipendono dalla piattaforma. L’app macOS firmata e distribuita supporta APNs; il pacchetto Windows richiede il componente WNS opzionale per il trasporto in background. Linux utilizza la sessione in background dell’app distribuita, anziché APNs o WNS.

Se il server selezionato non ha una configurazione APNs o WNS, l’app desktop usa notifiche native locali finché rimane aperta o nascosta. Questo metodo non consegna notifiche dopo la chiusura completa dell’app.

Controlla il permesso per le notifiche nel sistema operativo, lo stato di installazione nel browser e l’eventuale spiegazione che indica una funzione non configurata o non supportata. Una prova riuscita non garantisce la consegna senza rete o in presenza di tutte le restrizioni del sistema sul lavoro in background. Mantieni disponibile l’applicazione o il suo servizio in background configurato, secondo i requisiti della piattaforma.

![Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.](/documentation/it/devices-and-notifications-registered.png)
