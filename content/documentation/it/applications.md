---
{
  "id": "applications",
  "locale": "it",
  "title": "App web, mobili e desktop",
  "summary": "Usare minddy nel browser, installare l’app iOS, l’app web o l’app desktop e configurare le notifiche del dispositivo.",
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
    "language": "agent:claude-code (it MIN-973 iOS app section and passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it changed passage on closing bottom sheets, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 phone menu and desktop first-launch passages, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 browser-install sentence, in the locale's register; self-reviewed; agent review, not human acceptance)",
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
    "Lavorare nel browser e su mobile",
    "Installare l’app iOS",
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
      "src": "/documentation/it/ios-app-sign-in.png",
      "alt": "La schermata Accedi o registrati dell’app iOS, con il campo email, i pulsanti Apple, Google e GitHub e Ospita minddy in autonomia.",
      "caption": "Nell’app iOS, Ospita minddy in autonomia segue i servizi di accesso. Le finestre di accesso di Apple e del sistema non compaiono in questa schermata.",
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
      "src": "/documentation/it/ios-app-ai-consent.png",
      "alt": "La finestra Usare le funzioni IA? dell’app iOS, con Non ora e Consenti.",
      "caption": "La domanda posta una volta su ogni dispositivo prima di qualsiasi funzione IA. Non ora lascia le funzioni IA disattivate nell’app.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-13",
      "viewport": [
        442,
        493
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "ios-app-mobile-preferences",
      "kind": "screenshot",
      "src": "/documentation/it/ios-app-mobile-preferences.png",
      "alt": "Il gruppo App mobile delle preferenze dell’app iOS, con gli interruttori Vibrazione e Funzioni IA.",
      "caption": "Questo gruppo compare solo nell’app iOS. Funzioni IA cambia la risposta data alla domanda del primo avvio.",
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
      "src": "/documentation/it/install-the-pwa-workflow.png",
      "alt": "Guida illustrata di minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.",
      "caption": "La guida pubblica illustra i tre passaggi di Safari e l’opzione Apri come app web da mantenere attiva. Sono illustrazioni didattiche mostrate da minddy, non schermate di un’installazione iOS completata.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "src": "/documentation/it/devices-and-notifications-registered.png",
      "alt": "Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.",
      "caption": "L’account ha un dispositivo browser registrato e attivo. L’elenco mostra la data di registrazione e quella dell’ultimo invio. La comparsa di un avviso dipende comunque dal permesso del browser e dalle impostazioni del sistema operativo.",
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
      "src": "/documentation/it/desktop-renderer-recovery.png",
      "alt": "Pagina locale di ripristino dopo un arresto forzato del processo di rendering, con i controlli Reload window e Check server settings.",
      "caption": "Pagina di ripristino nell’app di sviluppo per macOS, con un profilo isolato e un server dimostrativo. L’interfaccia nativa usa etichette in inglese in tutte le lingue.",
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

Puoi accedere alla stessa istanza minddy dal browser, dall’app iOS, dall’app web installata o dall’app desktop. Segui la procedura per il tuo dispositivo e controlla i requisiti di connessione, gli aggiornamenti e i permessi di notifica della piattaforma.

## Lavorare nel browser e su mobile {#web-and-mobile}

Apri l’indirizzo della tua istanza e accedi a quella stessa istanza. Su uno schermo stretto, apri il menu, a sinistra della barra in fondo allo schermo, per scegliere un progetto e apri un ticket dall’elenco o dalla board. Leggi i dettagli nel pannello adattato allo schermo, modifica il campo desiderato o aggiungi un commento e attendi l’esito del salvataggio prima di chiudere. Chiudi il pannello dei dettagli per tornare all’elenco; la sua presentazione mobile differisce da quella su uno schermo ampio.

Sul telefono, menu, selettori e finestre di dialogo si aprono in un pannello inferiore. Chiudilo con il suo pulsante di chiusura o trascinandolo verso il basso; se il suo elenco è stato fatto scorrere, il gesto lo riporta prima in cima.

Apri Numo tramite il pulsante flottante o un’azione contestuale del ticket. Controlla il contesto del ticket nel campo di composizione. Se un pannello copre il contenuto che ti serve, chiudilo prima di proseguire la navigazione. Sui dispositivi touch usa i pulsanti e i menu visibili, senza presumere che siano disponibili azioni al passaggio del mouse o scorciatoie desktop.

### Tastiera e connessione {#access}

Con la tastiera puoi spostare il focus sui controlli e usare la palette dei comandi per navigare ed eseguire le azioni comuni. Il pulsante di invio visibile rimane un’alternativa all’invio da tastiera. Segui la scorciatoia mostrata dall’applicazione per la tua piattaforma.

Il browser e l’app web installata richiedono una connessione di rete per consultare i dati dei progetti e salvare le modifiche. Il service worker gestisce le notifiche push senza fornire una cache di dati offline. Dopo un errore di connessione, verifica se la modifica è stata salvata prima di ripeterla. Installare la PWA non crea un account separato e non aggira i permessi dell’istanza.

![Pannello mobile di un ticket con titolo, descrizione, proprietà e campo per i commenti.](/documentation/it/web-and-mobile-workflow.png)

## Installare l’app iOS {#ios-app}

Su iPhone e iPad, installa minddy dall’App Store. L’app richiede iOS 15 o versioni successive. Mostra l’interfaccia del server a cui è collegata, minddy Cloud o la tua istanza, quindi le nuove funzioni di minddy arrivano senza aggiornare l’app.

Al primo avvio, alcune schermate presentano minddy; **Inizia** porta a **Accedi o registrati**. Inserisci il tuo indirizzo email e scegli **Continua**, oppure usa **Continua con Apple**, **Continua con Google** o **Continua con GitHub**. Apple apre la propria finestra di accesso; Google e GitHub aprono la finestra di accesso del sistema sopra l’app e tornano all’app al termine. Il resto segue gli stessi passaggi del web; vedi [Creare un account e accedere](/it/documentazione/accounts#account-access).

Per usare un’istanza ospitata in autonomia, tocca **Ospita minddy in autonomia** sotto le opzioni di accesso. In **Connettiti al tuo server**, inserisci l’indirizzo dell’istanza in **Indirizzo del server** e tocca **Connetti**. I server remoti richiedono HTTPS; un indirizzo scritto senza schema usa HTTPS. **Indietro** torna alla schermata di accesso e, quando l’app è su un server ospitato in autonomia, **Usa minddy Cloud** torna a Cloud. Gli account appartengono alla loro istanza: accedi con l’account del server scelto. **Ospita minddy in autonomia** compare solo nella schermata di accesso, quindi esci prima per cambiare server.

Se il server non risponde, l’app mostra **Impossibile connettersi al server**, oppure **Sei offline** quando il dispositivo non ha rete. **Riprova** ricarica la pagina, e l’app riprova anche da sola quando torna la rete. **Cambia server** apre **Connettiti al tuo server**.

![La schermata Accedi o registrati dell’app iOS, con il campo email, i pulsanti Apple, Google e GitHub e Ospita minddy in autonomia.](/documentation/it/ios-app-sign-in.png)

### Link, notifiche, vibrazione e fatturazione {#ios-app-operation}

Un link a `www.minddy.app` toccato in Mail, Messaggi o Note apre l’app su quella pagina, che fosse aperta o no: un ticket, un progetto, una pagina o un link email che conferma il tuo account, reimposta la password o accetta un invito. I link alla fatturazione, al sito pubblico, a questo manuale e i link di condivisione pubblici si aprono ancora nel browser. I link a un’istanza ospitata in autonomia si aprono nel browser e, finché l’app è collegata a un server ospitato in autonomia, un link di minddy Cloud si apre in Safari. Nell’app, i link al sito pubblico, come i prezzi, il manuale o le pagine legali, si aprono in una finestra di Safari sopra l’app.

Per ricevere le notifiche push, apri **Impostazioni account** → **Notifiche** nell’app e attiva **Avvisa questo dispositivo**. iOS chiede il permesso la prima volta; poi le notifiche arrivano anche quando l’app è chiusa. Toccarne una apre il ticket, la pagina o l’elemento a cui si riferisce. Se iOS blocca le notifiche, **Apri Impostazioni** apre le impostazioni di notifica di minddy nell’app Impostazioni. Vedi [Attivare notifiche su un dispositivo](#devices-and-notifications).

L’app vibra leggermente quando scegli un’opzione, attivi un interruttore o copi qualcosa, e più forte quando crei un ticket o un obiettivo, completi un ticket o invii un commento. Per disattivarla, apri **Impostazioni account** → **Preferenze** → **App mobile** e disattiva **Vibrazione**. L’impostazione appartiene al tuo account, quindi ti segue sugli altri telefoni.

L’app non vende nulla. Non mostra la pagina di fatturazione, i piani né i pulsanti per passare a un piano superiore, e una funzione non inclusa nel tuo piano lo segnala senza proporre un upgrade. Gestisci l’abbonamento in un browser, sul sito di minddy; l’app riconosce il tuo piano appena accedi.

### Consentire o rifiutare le funzioni IA {#ios-app-ai}

Numo, Smart Fill, la dettatura e la ricerca inviano il contenuto su cui lavorano (testo dei ticket, commenti, pagine, registrazioni) al provider del modello IA usato dall’istanza. Prima della prima di queste richieste, l’app chiede **Usare le funzioni IA?** una volta su ogni dispositivo, dopo l’accesso e i primi passi. L’informativa sulla privacy, collegata dalla finestra, indica i provider. Scegli **Consenti** per usare le funzioni IA, oppure **Non ora** per lasciarle disattivate in questa app. Se chiudi la finestra senza scegliere, la domanda torna al prossimo avvio. L’uscita dall’account cancella la risposta, quindi il prossimo account che accede sul dispositivo riceve di nuovo la domanda.

Se rifiuti, l’app non avvia alcun lavoro IA: inviare un messaggio a Numo, dettare o usare un’altra funzione IA mostra di nuovo la finestra, così puoi consentirlo da lì. Un nuovo ticket viene creato senza Smart Fill, la ricerca dei ticket li trova solo per le loro parole, senza la [ricerca per significato](/it/documentazione/navigation#search-by-meaning), e una menzione di Numo in un commento resta senza risposta. Il resto di minddy funziona normalmente. Il web e l’app desktop non pongono mai questa domanda, e rifiutare nell’app non limita ciò che fai lì. La tua ultima risposta vale però per il lavoro IA che minddy svolge in background per il tuo account: dopo **Non ora**, Smart Assign e Smart Fill nei progetti di cui sei proprietario, le tue routine pianificate e i promemoria di Numo non usano più l’IA.

Per cambiare risposta, apri **Impostazioni account** → **Preferenze** → **App mobile** e attiva o disattiva **Funzioni IA**.

![La finestra Usare le funzioni IA? dell’app iOS, con Non ora e Consenti.](/documentation/it/ios-app-ai-consent.png)

![Il gruppo App mobile delle preferenze dell’app iOS, con gli interruttori Vibrazione e Funzioni IA.](/documentation/it/ios-app-mobile-preferences.png)

## Installare l’app web su telefono o tablet {#install-the-pwa}

Su iPhone e iPad, l’[app iOS](#ios-app) è la scelta abituale. L’app web installata resta disponibile su Android e per chi preferisce il browser.

Apri l’istanza minddy che vuoi usare in Safari su iPhone o iPad oppure in Chrome o in un altro browser Android compatibile. Se il link si è aperto all’interno di un’altra app, aprilo prima nel browser completo. Per un’istanza self-hosted, usa l’indirizzo del tuo server.

Su iOS, apri Condividi e scegli Aggiungi alla schermata Home. Lascia attiva l’opzione Apri come app web e tocca Aggiungi. A seconda dell’interfaccia di Safari, potrebbe essere necessario aprire Altro prima di Condividi. Se l’azione manca, controlla Modifica azioni.

Su Android, usa la proposta di installazione oppure scegli Installa l’app o Aggiungi alla schermata Home dal menu del browser e conferma Installa. I nomi dipendono dal browser. Apri la nuova icona e accedi con l’account di quell’istanza. Così il browser installa minddy come app web.

### Aggiornamenti, accesso offline e notifiche {#operation}

L’installazione non crea una copia offline del progetto. Il service worker di minddy gestisce soltanto le notifiche push e non conserva le richieste dell’applicazione nella cache. Usa una connessione di rete e ricarica la pagina per ottenere i contenuti web aggiornati. Le notifiche richiedono anche un browser compatibile, il suo permesso e una configurazione push sul server. Su iOS, usa l’app installata quando il percorso lo richiede. Se l’opzione di installazione non compare, apri un browser completo compatibile e controlla se l’istanza è già installata.

![Guida illustrata di minddy per l’installazione da Safari: Condividi, aggiungi alla schermata Home e conferma.](/documentation/it/install-the-pwa-workflow.png)

## Installare e gestire l’app desktop {#desktop-app}

Apri la pagina pubblica dei download. Su macOS, scegli il pacchetto per Apple silicon o Intel. Su Windows, installa l’app da Microsoft Store. Su Linux, scegli un’AppImage o un pacchetto `deb`/`rpm` firmato per x64 o ARM64. Segui la guida della piattaforma e le istruzioni di verifica del pacchetto. Windows non offre un installer `exe`. L’app per macOS richiede macOS 13 (Ventura) o versioni successive; su una versione precedente, un’app già installata mantiene la versione attuale e non riceve altri aggiornamenti.

Al primo avvio, l’app apre la schermata **Accedi o registrati** di minddy Cloud, dove accedi o crei il tuo account. Per usare invece una tua istanza, fai clic su **Ospita minddy in autonomia**, in fondo a questa schermata. Si apre **Ospita minddy in autonomia**, con tre scelte: **Installa su questo computer** prepara un’[istanza locale](/it/documentazione/install-locally#install-locally), **Installa su un server** apre nel browser la guida pubblica per installare un server, e **Usa un’installazione esistente** apre una schermata che raccoglie le installazioni che hai già. Lì, **Su questo computer** apre una cartella di minddy già presente su questo computer e l’app la avvia; sotto, **Indirizzo del server** con **Connetti** ti collega a un server che gestisci. I server remoti richiedono HTTPS; `localhost` può usare HTTP.

Per cambiare server in seguito, scegli **Connect to a Server…** nel menu nativo minddy (il menu nativo è in inglese; su Windows e Linux premi Alt per mostrare la barra dei menu), **Cambia…** accanto a **Server connesso** in **Impostazioni account** → **Preferenze** → **App desktop**, oppure **Ospita minddy in autonomia** in fondo alla schermata **Accedi o registrati**. Ognuno porta la finestra dell’app su **Ospita minddy in autonomia**; quando è connesso un server self-hosted, **Usa minddy Cloud**, in **Usa un’installazione esistente**, riporta a Cloud. Il percorso in alto nella pagina riporta a ogni passaggio e il logo di minddy riporta all’app. Questa schermata è integrata nell’app desktop e si apre senza connessione a Internet. Controlla la destinazione prima di accedere: gli account appartengono alle rispettive istanze. OAuth usa il browser di sistema e ritorna poi all’app desktop.

Su macOS e Windows 11, la barra laterale, le schede e i bordi della finestra lasciano intravedere la scrivania, sfocata, dietro il contenuto opaco. Una finestra a schermo intero resta opaca, e la trasparenza torna quando esce dallo schermo intero. Per mantenere la finestra opaca su questo dispositivo, disattiva **Trasparenza dell’app desktop** in **Impostazioni account** → **Preferenze** → [Aspetto](/docs/accounts#preferences).

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

Apri le notifiche nelle impostazioni dell’account sul dispositivo che vuoi registrare. Attivale e accetta la richiesta di autorizzazione del browser o del sistema operativo. Se hai negato il permesso, devi modificarlo nelle impostazioni del browser o del sistema; azionare ripetutamente il controllo di minddy non può superare quel rifiuto. L’[app iOS](#ios-app-operation) si registra direttamente. In Safari su iPhone o iPad, installa e apri prima l’app web quando l’interfaccia lo richiede.

Verifica che il dispositivo compaia nell’elenco e usa il suo comando di prova. Controlla le informazioni sull’ultima consegna. Puoi disattivare o rimuovere singole registrazioni senza eliminare l’account. Le categorie di **Impostazioni account** → **Notifiche** determinano quali eventi generano notifiche; la Posta in arrivo resta disponibile anche quando il push non funziona.

![Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.](/documentation/it/devices-and-notifications-workflow.png)

### Condizioni per piattaforma {#platforms}

Il push web richiede un browser supportato e un servizio push configurato sull’istanza. I banner nativi e la consegna in background dipendono dalla piattaforma. L’app iOS riceve le notifiche tramite APNs, anche quando è chiusa. L’app macOS firmata e distribuita supporta APNs; il pacchetto Windows richiede il componente WNS opzionale per il trasporto in background. Linux utilizza la sessione in background dell’app distribuita, anziché APNs o WNS.

Se il server selezionato non ha una configurazione APNs o WNS, l’app desktop usa notifiche native locali finché rimane aperta o nascosta. Questo metodo non consegna notifiche dopo la chiusura completa dell’app.

Controlla il permesso per le notifiche nel sistema operativo, lo stato di installazione nel browser e l’eventuale spiegazione che indica una funzione non configurata o non supportata. Una prova riuscita non garantisce la consegna senza rete o in presenza di tutte le restrizioni del sistema sul lavoro in background. Mantieni disponibile l’applicazione o il suo servizio in background configurato, secondo i requisiti della piattaforma.

![Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.](/documentation/it/devices-and-notifications-registered.png)
