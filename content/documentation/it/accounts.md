---
{
  "id": "accounts",
  "locale": "it",
  "title": "Account",
  "summary": "Crea e proteggi il tuo account, recupera l’accesso, modifica le preferenze e comprendi le conseguenze della sua eliminazione.",
  "topic": "Primi passi",
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
      "app/(auth)/signup/page.tsx",
      "components/auth/auth-entry.tsx",
      "components/auth/auth-chrome.tsx",
      "lib/auth-entry.ts",
      "app/api/auth/lookup/route.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/profile-setup-screen.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/first-run.ts",
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
      "lib/server/apple-sign-in.ts",
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
      "lib/keyboard/shortcuts.ts",
      "desktop/src/local-installer.ts",
      "desktop/src/local-account.ts",
      "lib/week-start.ts",
      "components/settings/account-numo-section.tsx",
      "lib/use-onboarding.ts",
      "lib/onboarding.ts",
      "components/settings/account-mobile-section.tsx"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (MIN-973: Self-host minddy in the iOS app and the Mobile app card of Preferences; checked against components/auth/auth-chrome.tsx and components/settings/account-mobile-section.tsx; no figure affected); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 4 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:/root (MIN-765 desktop preview channel removal: source review of components/settings/account-desktop-section.tsx and desktop/src/menu.ts; the Desktop app card no longer lists a preview channel; unchanged evidence retained; no browser walkthrough, no new captures); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of account-security-workflow, profile-and-preferences-workflow, profile-and-preferences-preferences-workflow, privacy-and-account-deletion-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-781 self-hosting from the desktop app: source review of components/desktop/server-choice.tsx, desktop/src/local-installer.ts and desktop/src/local-account.ts; the account-access section now states that a local instance installed by the desktop app has no signup; no installation run, no screenshot recaptured, existing figures carried forward unchanged); agent:claude-code (MIN-881 first day of the week: source review of lib/week-start.ts, components/settings/account-preferences-section.tsx, components/calendar.tsx, lib/routine-schedule.ts, lib/routine-week-order.ts, components/stats/activity-heatmap.tsx and lib/mention-date.ts; new preferences paragraph; localized mention example checked against the parser; no browser walkthrough, no screenshot recaptured, existing figures carried forward unchanged); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 4 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-907 single sign-in and sign-up screen, first-run profile page and phone getting-started tour: checked against components/auth/auth-entry.tsx, components/auth/auth-chrome.tsx, lib/auth-entry.ts, app/api/auth/lookup/route.ts, components/first-run/first-run-gate.tsx, components/first-run/profile-setup-screen.tsx, components/first-run/onboarding-screen.tsx, lib/first-run.ts and messages/*.json; no browser walkthrough; existing figures do not show these screens and were kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 four-step tour: the cycles step left the getting-started steps (lib/onboarding.ts ONBOARDING_STEPS, components/sidebar-onboarding.tsx); the phone tour's Back and Skip row, Back from the first step returning to the profile page, and the skip confirmation checked against components/first-run/onboarding-screen.tsx and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-964 tour on every platform: the full-screen getting-started steps now also run on a computer, their actions open dialogs, the issue step offers the CSV import to a project owner on a computer, and the sidebar checklist is gone; checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx, components/app-sidebar.tsx and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept)",
    "language": "agent:claude-code (it MIN-973 iOS app sentence, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it MIN-765 removal edit; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-781 changed passages on local instances from the desktop app, with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-881 first-day-of-week paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 account-access section rewritten for the single sign-in and sign-up screen and the first-run screens, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 tour follow-up tour passage with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 four-step tour passage with Back and Skip, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-13"
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
    "Creare un account e accedere",
    "Proteggere l’account con un secondo fattore",
    "Recuperare l’accesso all’account",
    "Modificare profilo e preferenze",
    "Gestire analisi e cancellazione dell’account"
  ],
  "figures": [
    {
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/account-security-workflow.png",
      "alt": "Scheda di autenticazione a due fattori con pulsante di attivazione.",
      "caption": "Inizia qui, poi verifica l’autenticatore e conserva privatamente i codici di recupero.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "src": "/documentation/it/profile-and-preferences-workflow.png",
      "alt": "Intestazione del profilo con l’avatar e il suo badge di modifica, il nome e l’email di sola lettura.",
      "caption": "Seleziona l’avatar per generarne o caricarne uno, oppure il nome per cambiarlo; l’indirizzo email resta di sola lettura.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "src": "/documentation/it/profile-and-preferences-preferences-workflow.png",
      "alt": "Selettore della lingua, controlli del tema chiaro, scuro e di sistema, selettori di palette delle modalità chiara e scura e interruttore della trasparenza.",
      "caption": "La lingua dell’account e quella del sito pubblico si impostano separatamente.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        491
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/privacy-and-account-deletion-workflow.png",
      "alt": "Anteprima di eliminazione con progetti posseduti, ticket e membri che perderanno l’accesso.",
      "caption": "Leggi l’anteprima ed esporta i dati da conservare prima di aprire la conferma.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        251
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

L’account appartiene all’istanza su cui ti registri. Puoi gestire accesso, recupero, autenticazione a due fattori e preferenze personali. Prima di eliminarlo, esporta i dati da conservare e controlla le conseguenze sui progetti di cui sei proprietario.

## Creare un account e accedere {#account-access}

Apri la schermata di accesso dell’istanza che vuoi usare. **Accedi o registrati** è un’unica schermata per entrambe le cose, sia su `/login` sia su `/signup`. Cloud e un’altra istanza autonoma hanno account separati. I servizi di accesso disponibili e la possibilità di registrarsi dipendono dalla configurazione di autenticazione dell’istanza. Un’istanza locale installata dall’app desktop non prevede registrazione: l’app crea il tuo account e ti fa accedere. Consulta [Istanze locali](/it/documentazione/install-locally#install-locally).

La schermata inizia con il tuo indirizzo email e **Continua**. Sotto **oppure**, elenca i servizi di accesso offerti dall’istanza, in questo ordine: Apple, Google e GitHub. Nell’app desktop e nell’[app iOS](/it/documentazione/applications#ios-app) li segue **Ospita minddy in autonomia**. Dopo **Continua**, minddy verifica a cosa corrisponde l’indirizzo e mostra uno di questi passaggi. **Modifica**, accanto all’indirizzo, riporta a quest’ultimo.

- **Inserisci la password**: l’indirizzo ha un account con password. Inseriscila e scegli **Accedi**. **Hai dimenticato la password?** avvia il [recupero della password](#account-recovery).
- **Scegli una password**: l’indirizzo non ha ancora un account. Inserisci almeno otto caratteri con una lettera minuscola (a–z), una maiuscola (A–Z) e una cifra; i requisiti vengono controllati mentre scrivi. Scegli **Crea il mio account**. Questo passaggio non chiede né nome, né immagine, né conferma della password.
- **Questo account non ha una password**: l’account è stato creato con un servizio di accesso. Continua con lo stesso servizio, oppure scegli **Imposta una password**, che apre il recupero della password per questo indirizzo.
- **Le iscrizioni sono chiuse qui**: l’istanza di anteprima di minddy non crea account. Il suo pulsante porta all’iscrizione su minddy.app.

Quando è richiesta la conferma dell’email, dopo la creazione dell’account compare **Controlla la tua casella di posta**. Apri il messaggio inviato dall’istanza. Segui il collegamento e premi il pulsante di conferma nella pagina. Aprire il collegamento non basta: non conferma l’account e non consuma il token email. Poi torna all’applicazione prevista e accedi. Troppe verifiche di indirizzi in poco tempo vengono rifiutate per un po’: attendi prima di riprovare.

Dopo il primo accesso, un nuovo account si apre su **Come dovremmo chiamarti?** prima dell’app. Scegli **Carica immagine** o **Nuovo avatar di Lorelei** per la tua immagine, poi inserisci il tuo nome utente; il nome fornito da un servizio di accesso è già compilato. Scegli **Continua**. Questa pagina compare una sola volta, su tutte le piattaforme; gli account creati prima della sua introduzione non la vedono mai. Puoi cambiare entrambi in seguito nel tuo [profilo](#profile-and-preferences).

Un nuovo account segue poi i primi passi, sul telefono come sul computer, uno per pagina, con punti di avanzamento: **Crea o unisciti a un progetto**, **Aggiungi il tuo primo ticket**, **Scopri Numo** e **Collega un agente di codice**. Il pulsante di ogni passaggio apre sopra la pagina la stessa finestra di dialogo dell’app: creazione di un progetto o di un ticket, Numo o il collegamento dell’agente. Sul computer, il passaggio del ticket offre anche **Importa ticket** al proprietario di un progetto. Il passaggio del ticket è completato appena crei il ticket, anche se Smart Fill lo sta ancora compilando. Sotto i pulsanti del passaggio, **Indietro** mostra di nuovo il passaggio precedente; dal primo passaggio, torna a **Come dovremmo chiamarti?**, dove **Continua** ti riporta ai passaggi. **Salta** passa al passaggio successivo. **Salta l'onboarding** chiede prima una conferma, perché i passaggi saltati non tornano più: conferma con **Salta l'onboarding**. Dopo l’ultimo passaggio compare **Tutto pronto.** con una breve animazione di coriandoli, e **Continua** porta alla Home. Anche saltare il percorso porta alla Home.

Un account appena autenticato può creare il proprio progetto o accettare un invito a un progetto. Conoscere l’URL di un progetto non ne conferisce l’appartenenza.


### Uscire e controllare le email mancanti {#session-and-mail}

Apri il menu dell’account, scegli di uscire e conferma. Nell’app desktop, chiudere una scheda o una finestra non equivale a uscire dall’account. Usa il menu dell’account se vuoi terminare la sessione.

Una sessione resta attiva finché usi minddy, fino a un anno, e termina dopo 30 giorni di inutilizzo. Quando termina, o viene chiusa da un altro dispositivo, minddy torna alla schermata di accesso con un messaggio che indica che la sessione è scaduta. Accedi di nuovo per riprendere da dove eri rimasto.

Il gruppo **Sessioni** nella scheda **Sicurezza** delle impostazioni dell’account elenca i browser e le app desktop connessi al tuo account, segnala il dispositivo che stai usando e indica l’ultima attività di ciascuno degli altri. Per chiudere tutte le altre sessioni, per esempio su un portatile smarrito o un computer condiviso, scegli **Disconnetti tutto** nella riga **Disconnetti gli altri dispositivi** e conferma: ogni altro browser e app desktop connessi al tuo account torna alla schermata di accesso. Per chiudere una sola sessione, scegli **Disconnetti** nella sua riga e conferma; solo quel dispositivo torna alla schermata di accesso. In entrambi i casi, il dispositivo che stai usando resta connesso. Le app autorizzate in **MCP** → **App connesse** mantengono l’accesso finché non lo revochi da lì.

Se l’email non arriva, controlla indirizzo, cartella dello spam e identità dell’istanza. L’operatore di un’istanza autonoma deve aver configurato un invio email funzionante per Auth; le notifiche email opzionali dell’applicazione e la conferma di Auth sono funzioni distinte. Una pagina di conferma scaduta permette di tornare all’accesso per richiedere un nuovo collegamento. Non inoltrare collegamenti di conferma o recupero come prova diagnostica: autorizzano l’accesso all’account.


## Proteggere l’account con un secondo fattore {#account-security}

Apri la sezione Sicurezza nelle impostazioni dell’account e attiva l’autenticazione a due fattori. Questo secondo fattore viene richiesto anche quando accedi tramite Google, GitHub o Apple: l’autenticazione del provider non lo sostituisce.

1. Scansiona il codice QR con un’app di autenticazione TOTP oppure inserisci manualmente la chiave di configurazione mostrata. Non includere né il codice QR né la chiave in una schermata.
2. Inserisci il codice corrente di sei cifre e conferma. Se è scaduto, prova con il codice successivo; dopo troppi tentativi, attendi prima di riprovare.
3. Conserva i codici di recupero in un luogo protetto, accessibile anche senza il telefono. Ogni codice funziona una sola volta e l’elenco viene mostrato una sola volta. Prima di terminare, conferma di averlo salvato.

L’attivazione aggiorna la sessione corrente e tenta di disconnettere le altre sessioni. Se dopo l’accettazione del codice viene richiesta una nuova autenticazione, accedi di nuovo e segui le indicazioni visualizzate.

![Scheda di autenticazione a due fattori con pulsante di attivazione.](/documentation/it/account-security-workflow.png)

### Recupero e modifiche {#recovery}

Durante l’accesso, se non hai il telefono, usa uno dei codici di recupero che hai conservato. L’uso di un codice disattiva l’autenticazione a due fattori e invalida tutti i codici rimanenti. Dopo l’accesso, configura nuovamente l’app di autenticazione e conserva i nuovi codici di recupero. Questa procedura non garantisce il ripristino dell’account da parte dell’assistenza umana.

La sostituzione dei codici di recupero invalida l’elenco precedente. Sia la sostituzione sia la disattivazione volontaria richiedono i controlli di autenticazione recente del server. Leggi la conferma: disattivando la funzione, il fattore aggiuntivo non verrà più richiesto, neppure negli accessi tramite Google, GitHub o Apple.


## Recuperare l’accesso all’account {#account-recovery}

Nella schermata di accesso dell’istanza corretta, usa il recupero della password e inserisci l’email associata al tuo account. Apri il messaggio di reimpostazione, segui il collegamento e conferma l’azione. Inserisci la nuova password nella schermata di reimpostazione e inviala. Verifica poi di poter accedere sulla stessa istanza.

Un collegamento può scadere o non avere più una sessione attiva. La schermata di reimpostazione identifica questa condizione e permette di richiedere un altro collegamento. Riparti da un nuovo messaggio invece di riprovare un vecchio segnalibro. Non inviare collegamento, cookie o password all’assistenza.


### MFA e accesso ancora irrisolto {#mfa-recovery}

Se l’autenticazione a due fattori è attiva, reimpostare la password non rimuove questo requisito. Usa l’app di autenticazione. Puoi anche usare un codice di recupero salvato quando hai attivato MFA; usarlo disattiva MFA. Tratta i codici di recupero come segreti e configura nuovamente MFA nelle impostazioni di sicurezza dopo aver recuperato l’accesso.

Se non hai né il secondo fattore né un codice di recupero, contatta l’operatore dell’istanza attraverso il suo canale di assistenza. Indica l’indirizzo dell’istanza e il problema visualizzato, senza token di autenticazione o contenuti privati del progetto. Se manca l’email di recupero, chiedi all’operatore di verificare gli URL di reindirizzamento di Auth e l’invio SMTP. Non creare un secondo account pensando che erediterà progetti o connessioni dell’account originale.

## Modificare profilo e preferenze {#profile-and-preferences}

Scegli **Impostazioni account** dal menu dell’account, dal menu mobile o dalla palette dei comandi, oppure premi Command+virgola su macOS (Ctrl+virgola su Windows/Linux): le impostazioni dell’account si aprono sulla scheda **Preferenze**. Per aprire direttamente la scheda **Profilo**, scegli il tuo nome in cima al menu dell’account; puoi anche selezionare **Profilo** tra le schede delle impostazioni. Mostra avatar, nome ed email, seguiti dalle tue [statistiche personali](/docs/personal-statistics). Seleziona l’avatar e scegli **Nuovo avatar di Lorelei** o **Carica immagine**; la modifica si applica non appena riesce. Seleziona il tuo nome per cambiarlo: sul computer diventa un campo che Invio o un clic altrove salvano ed Esc annulla; sul telefono apre un pannello con **Nome utente** e **Salva**. Il nome non può essere vuoto. L’email è di sola lettura. Attendi il risultato e verifica l’avatar in un commento o elenco membri; rimane lo stesso tra progetti e conversazioni. Se un file viene rifiutato, segui il messaggio di validazione invece di caricarlo ripetutamente.

L’immagine sorgente non deve superare 10 MiB. Il server verifica byte leggibili, applica orientamento e ritaglia al centro come avatar WebP di 256 × 256.

![Intestazione del profilo con l’avatar e il suo badge di modifica, il nome e l’email di sola lettura.](/documentation/it/profile-and-preferences-workflow.png)

### Scegliere il comportamento {#preferences}

Nelle preferenze seleziona lingua e tema e controlla un’altra pagina. La lingua dell’account riguarda il prodotto autenticato; il sito pubblico ha un selettore separato. Il tema viene salvato nell’account su tutti i dispositivi.

Il tema sceglie la modalità chiara, scura o di sistema. **Palette modalità chiara** e **Palette modalità scura** impostano ciascuna i colori di una modalità. I **colori d'accento** mantengono i colori di minddy e ricolorano solo i pulsanti e l'anello di focus: minddy (lavanda), Nero in modalità chiara o Bianco in modalità scura, Blu, Verde, Arancione e Rosa; le **palette complete** (Solarized, Catppuccin, Nord) ricolorano tutte le superfici; **Contrasto elevato** si trova in Accessibilità. La palette della modalità visualizzata si applica subito; l’altra viene salvata e compare quando la sua modalità torna attiva, anche quando Sistema segue un cambio del sistema operativo. Contrasto elevato aumenta il contrasto di testo e bordi, contorna campi, menu, finestre di dialogo e schede, segnala la pagina corrente e l'elemento selezionato, mostra sempre il focus da tastiera e mantiene opachi i menu. Disattiva **Trasparenza** per rendere opachi, senza sfocatura, menu, popover e palette dei comandi. Palette e trasparenza vengono salvate nell’account; un altro dispositivo le applica al successivo caricamento di una pagina. Nell’app desktop su macOS e Windows 11, **Trasparenza dell’app desktop** lascia intravedere la scrivania, sfocata, dietro la barra laterale, le schede e i bordi della finestra, mentre il contenuto resta opaco. Vale solo per questo dispositivo e si applica subito. La finestra resta opaca con una palette ad alto contrasto, o quando l’impostazione «Riduci trasparenza» o il contrasto elevato del sistema è attiva; l’interruttore è allora disattivato. Windows 10 e Linux mantengono una finestra opaca e non mostrano l’interruttore.

**Primo giorno della settimana** stabilisce il giorno in cui iniziano le tue settimane. Il calendario del selettore di data, i giorni di una routine e il loro ordine in Routine, le righe della griglia delle attività nelle tue statistiche e una menzione di data come `@giovedì tra 2 settimane` lo seguono. **In base alla lingua** mantiene l’uso della lingua dell’interfaccia: domenica in inglese e portoghese brasiliano, lunedì nelle altre lingue. Scegli lunedì, domenica o sabato per fissarlo tu. La scelta viene salvata nell’account. I [cicli personali](/docs/personal-cycle) mantengono il proprio giorno di inizio.

Scegli la scorciatoia di invio nella sezione tastiera. Si applica a commenti, a Numo e a Invio nel titolo di un modulo di creazione; una descrizione mantiene Command/Ctrl+Invio, e Maiusc+Invio in un titolo passa sempre alla descrizione. Usa il pulsante di invio quando la piattaforma intercetta la scorciatoia; i modificatori variano tra sistemi. I progetti che hai nascosto sono elencati nella loro scheda **Progetti nascosti**, dove puoi mostrarli di nuovo. **Preferenze** contiene anche il riquadro **App desktop**: sul web rimanda al download dell’app desktop; nell’app desktop mostra il server collegato e la versione dell’app. Nell’app iOS il riquadro **App mobile** ne prende il posto, con gli interruttori **Vibrazione** e **Funzioni IA**; vedi [l’app iOS](/it/documentazione/applications#ios-app-operation). Anche le preferenze dei ticket appartengono all’account, senza cambiare quelle degli altri membri: l’assegnazione automatica è nella scheda **Ticket**, lo stato dei ticket creati da Numo in **Numo** → **Stato dei ticket creati da Numo**.

![Selettore della lingua, controlli del tema chiaro, scuro e di sistema, selettori di palette delle modalità chiara e scura e interruttore della trasparenza.](/documentation/it/profile-and-preferences-preferences-workflow.png)

## Gestire analisi e cancellazione dell’account {#privacy-and-account-deletion}

Quando il servizio di analisi è configurato, la scheda **Privacy e dati** delle impostazioni dell’account mostra un interruttore per il consenso e un collegamento alla politica sui cookie. Disattivarlo cambia subito il consenso alle misurazioni su questo dispositivo e salva la scelta nell’account. La scelta locale già presente su un altro dispositivo può continuare a valere lì. Se non è configurato un servizio di analisi, la sezione non compare.

Il consenso è distinto dai dati necessari al funzionamento dell’account. Leggi la politica sulla privacy dell’istanza e verifica i provider esterni che hai abilitato. Nell’auto-hosting, configurazione e politiche dell’operatore determinano le destinazioni dei servizi; disattivare l’analisi non rimuove le integrazioni IA o Git.

![Anteprima di eliminazione con progetti posseduti, ticket e membri che perderanno l’accesso.](/documentation/it/privacy-and-account-deletion-workflow.png)

### Controllare la cancellazione {#deletion}

Prima di eliminare l’account, esporta dalla scheda **Privacy e dati** ciò che devi conservare. Leggi l’anteprima dei progetti di cui sei proprietario, dei membri coinvolti, dei ticket, dei commenti e dell’abbonamento attivo. Le conseguenze sui progetti posseduti riguardano altre persone: risolvile prima di confermare.

Apri la conferma di eliminazione soltanto quando sei pronto. Digita l’indirizzo email dell’account e, se l’account ha una password, anche la password. Gli account senza password richiedono un accesso recente. Segui le indicazioni di un eventuale rifiuto di autenticazione recente, senza riprovare alla cieca. Se l’eliminazione riesce, la sessione viene chiusa e si torna al sito pubblico. Se l’account accede con Apple, l’eliminazione chiede anche ad Apple di revocare l’accesso di minddy al tuo Account Apple. Non è uno spostamento nel cestino recuperabile. Mantieni private le esportazioni e gestisci eventuali questioni residue su abbonamenti o provider tramite i rispettivi controlli di fatturazione e servizio.


## Configurare le routine {#routines}

Il lavoro automatico del progetto si configura in [Routine](/docs/scheduled-routines), dove il proprietario sceglie pianificazione, evento o arrivo in un database. I preset di automazione dell’account e i relativi interruttori di progetto sono rimossi. Leggi la [guida alla transizione](/docs/automation-settings) prima di attivare una proposta archiviata.
