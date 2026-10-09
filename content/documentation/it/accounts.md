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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "components/auth/signup-wizard.tsx",
      "lib/signup-wizard.ts",
      "lib/password-policy.ts",
      "app/(auth)/login/page.tsx",
      "app/auth/confirm/page.tsx",
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json",
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
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "alt": "Controlli del profilo per avatar, nome utente ed email di sola lettura.",
      "caption": "Salva le modifiche al profilo dopo la validazione; l’indirizzo email rimane di sola lettura.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        416
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/profile-and-preferences-preferences-workflow.png",
      "alt": "Selettore della lingua e controlli del tema chiaro, scuro e di sistema.",
      "caption": "La lingua dell’account e quella del sito pubblico si impostano separatamente.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        212
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        231
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

Apri la schermata di accesso o registrazione sull’istanza che vuoi usare. Cloud e un’altra istanza autonoma hanno account separati. I metodi di accesso disponibili e la possibilità di registrarsi dipendono dalla configurazione di autenticazione dell’istanza.

Per registrarti via email, inserisci il tuo indirizzo e prosegui al passaggio dedicato all’identità. Inserisci il nome completo; non può essere vuoto né contenere soltanto spazi. Puoi anche scegliere un avatar. Prosegui al passaggio della password e inseriscine una di almeno otto caratteri con una lettera minuscola (a–z), una maiuscola (A–Z) e una cifra. Ripetila nel campo di conferma. Invia quest’ultimo passaggio per creare l’account. Se abbandoni i passaggi precedenti, l’account non viene creato.

Quando è richiesta la conferma dell’email, apri il messaggio inviato dall’istanza. Segui il collegamento e premi il pulsante di conferma nella pagina. Aprire il collegamento non basta: minddy richiede questa azione esplicita prima di consumare il token email.

Torna all’applicazione prevista e accedi. Un account appena autenticato può creare il proprio progetto o accettare un invito a un progetto. Conoscere l’URL di un progetto non ne conferisce l’appartenenza.


### Uscire e controllare le email mancanti {#session-and-mail}

Apri il menu dell’account, scegli di uscire e conferma. Nell’app desktop, chiudere una scheda o una finestra non equivale a uscire dall’account. Usa il menu dell’account se vuoi terminare la sessione.

Se l’email non arriva, controlla indirizzo, cartella dello spam e identità dell’istanza. L’operatore di un’istanza autonoma deve aver configurato un invio email funzionante per Auth; le notifiche email opzionali dell’applicazione e la conferma di Auth sono funzioni distinte. Una pagina di conferma scaduta permette di tornare all’accesso per richiedere un nuovo collegamento. Non inoltrare collegamenti di conferma o recupero come prova diagnostica: autorizzano l’accesso all’account.


## Proteggere l’account con un secondo fattore {#account-security}

Apri la sezione Sicurezza nelle impostazioni dell’account e attiva l’autenticazione a due fattori. Questo secondo fattore viene richiesto anche quando accedi tramite Google o GitHub: l’autenticazione del provider non lo sostituisce.

1. Scansiona il codice QR con un’app di autenticazione TOTP oppure inserisci manualmente la chiave di configurazione mostrata. Non includere né il codice QR né la chiave in una schermata.
2. Inserisci il codice corrente di sei cifre e conferma. Se è scaduto, prova con il codice successivo; dopo troppi tentativi, attendi prima di riprovare.
3. Conserva i codici di recupero in un luogo protetto, accessibile anche senza il telefono. Ogni codice funziona una sola volta e l’elenco viene mostrato una sola volta. Prima di terminare, conferma di averlo salvato.

L’attivazione aggiorna la sessione corrente e tenta di disconnettere le altre sessioni. Se dopo l’accettazione del codice viene richiesta una nuova autenticazione, accedi di nuovo e segui le indicazioni visualizzate.

![Scheda di autenticazione a due fattori con pulsante di attivazione.](/documentation/it/account-security-workflow.png)

### Recupero e modifiche {#recovery}

Durante l’accesso, se non hai il telefono, usa uno dei codici di recupero che hai conservato. L’uso di un codice disattiva l’autenticazione a due fattori e invalida tutti i codici rimanenti. Dopo l’accesso, configura nuovamente l’app di autenticazione e conserva i nuovi codici di recupero. Questa procedura non garantisce il ripristino dell’account da parte dell’assistenza umana.

La sostituzione dei codici di recupero invalida l’elenco precedente. Sia la sostituzione sia la disattivazione volontaria richiedono i controlli di autenticazione recente del server. Leggi la conferma: disattivando la funzione, il fattore aggiuntivo non verrà più richiesto, neppure negli accessi tramite Google o GitHub.


## Recuperare l’accesso all’account {#account-recovery}

Nella schermata di accesso dell’istanza corretta, usa il recupero della password e inserisci l’email associata al tuo account. Apri il messaggio di reimpostazione, segui il collegamento e conferma l’azione. Inserisci la nuova password nella schermata di reimpostazione e inviala. Verifica poi di poter accedere sulla stessa istanza.

Un collegamento può scadere o non avere più una sessione attiva. La schermata di reimpostazione identifica questa condizione e permette di richiedere un altro collegamento. Riparti da un nuovo messaggio invece di riprovare un vecchio segnalibro. Non inviare collegamento, cookie o password all’assistenza.


### MFA e accesso ancora irrisolto {#mfa-recovery}

Se l’autenticazione a due fattori è attiva, reimpostare la password non rimuove questo requisito. Usa l’app di autenticazione. Puoi anche usare un codice di recupero salvato quando hai attivato MFA; usarlo disattiva MFA. Tratta i codici di recupero come segreti e configura nuovamente MFA nelle impostazioni di sicurezza dopo aver recuperato l’accesso.

Se non hai né il secondo fattore né un codice di recupero, contatta l’operatore dell’istanza attraverso il suo canale di assistenza. Indica l’indirizzo dell’istanza e il problema visualizzato, senza token di autenticazione o contenuti privati del progetto. Se manca l’email di recupero, chiedi all’operatore di verificare gli URL di reindirizzamento di Auth e l’invio SMTP. Non creare un secondo account pensando che erediterà progetti o connessioni dell’account originale.

## Modificare profilo e preferenze {#profile-and-preferences}

Apri le impostazioni dal menu dell’account. Nel profilo inserisci un nome non vuoto e salvalo. L’email è di sola lettura. Genera un nuovo avatar o carica un’immagine con i controlli dedicati. Attendi il risultato e verifica l’avatar in un commento o elenco membri; rimane lo stesso tra progetti e conversazioni. Se un file viene rifiutato, segui il messaggio di validazione invece di caricarlo ripetutamente.

L’immagine sorgente non deve superare 10 MiB. Il server verifica byte leggibili, applica orientamento e ritaglia al centro come avatar WebP di 256 × 256.

![Controlli del profilo per avatar, nome utente ed email di sola lettura.](/documentation/it/profile-and-preferences-workflow.png)

### Scegliere il comportamento {#preferences}

Nelle preferenze seleziona lingua e tema e controlla un’altra pagina. La lingua dell’account riguarda il prodotto autenticato; il sito pubblico ha un selettore separato. Il tema viene salvato nell’account su tutti i dispositivi.

Scegli la scorciatoia di invio nella sezione tastiera. Si applica a commenti e Numo. Usa il pulsante di invio quando la piattaforma intercetta la scorciatoia; i modificatori variano tra sistemi. Anche assegnazione automatica e stato dei ticket creati da Numo appartengono all’account, senza cambiare le preferenze degli altri membri.

![Selettore della lingua e controlli del tema chiaro, scuro e di sistema.](/documentation/it/profile-and-preferences-preferences-workflow.png)

## Gestire analisi e cancellazione dell’account {#privacy-and-account-deletion}

Quando il servizio di analisi è configurato, le impostazioni dell’account mostrano un interruttore per il consenso e un collegamento alla politica sui cookie. Disattivarlo cambia subito il consenso alle misurazioni su questo dispositivo e salva la scelta nell’account. La scelta locale già presente su un altro dispositivo può continuare a valere lì. Se non è configurato un servizio di analisi, la sezione non compare.

Il consenso è distinto dai dati necessari al funzionamento dell’account. Leggi la politica sulla privacy dell’istanza e verifica i provider esterni che hai abilitato. Nell’auto-hosting, configurazione e politiche dell’operatore determinano le destinazioni dei servizi; disattivare l’analisi non rimuove le integrazioni IA o Git.

![Anteprima di eliminazione con progetti posseduti, ticket e membri che perderanno l’accesso.](/documentation/it/privacy-and-account-deletion-workflow.png)

### Controllare la cancellazione {#deletion}

Prima di eliminare l’account, esporta dalla sezione Dati ciò che devi conservare. Leggi l’anteprima dei progetti di cui sei proprietario, dei membri coinvolti, dei ticket, dei commenti e dell’abbonamento attivo. Le conseguenze sui progetti posseduti riguardano altre persone: risolvile prima di confermare.

Apri la conferma di eliminazione soltanto quando sei pronto. Digita l’indirizzo email dell’account e, se l’account ha una password, anche la password. Gli account senza password richiedono un accesso recente. Segui le indicazioni di un eventuale rifiuto di autenticazione recente, senza riprovare alla cieca. Se l’eliminazione riesce, la sessione viene chiusa e si torna al sito pubblico. Non è uno spostamento nel cestino recuperabile. Mantieni private le esportazioni e gestisci eventuali questioni residue su abbonamenti o provider tramite i rispettivi controlli di fatturazione e servizio.
