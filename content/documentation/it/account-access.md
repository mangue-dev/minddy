---
{
  "id": "account-access",
  "locale": "it",
  "title": "Creare un account e accedere",
  "summary": "Usa l’istanza corretta, conferma l’email e termina la sessione con l’azione prevista.",
  "topic": "Primi passi",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/auth/confirm/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "choose-an-instance",
    "account-recovery",
    "project-members"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-access-steps",
      "kind": "screenshot",
      "src": "/documentation/it/auth-signup.png",
      "alt": "Registrazione tramite email, con i pulsanti dei provider e il primo passaggio della procedura in tre passaggi.",
      "caption": "Inizia sull’istanza corretta. Dopo l’email vengono l’identità e la password; in questa schermata non è stata inviata alcuna registrazione.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        454
      ],
      "theme": "light"
    },
    {
      "id": "account-access-login",
      "kind": "screenshot",
      "src": "/documentation/it/auth-login.png",
      "alt": "Modulo di accesso con il collegamento al recupero sotto il campo della password.",
      "caption": "Avvia il recupero sull’istanza del tuo account. Il modulo è mostrato senza credenziali inviate.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        540
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-access-steps"
  ]
}
---

## Registrarsi e confermare l’account {#account-access}

Apri la schermata di accesso o registrazione sull’istanza che vuoi usare. Cloud e un’altra istanza autonoma hanno account separati. I metodi di accesso disponibili e la possibilità di registrarsi dipendono dalla configurazione di autenticazione dell’istanza.

Per registrarti via email, inserisci il tuo indirizzo e prosegui al passaggio dedicato all’identità. Inserisci il nome completo; non può essere vuoto né contenere soltanto spazi. Puoi anche scegliere un avatar. Prosegui al passaggio della password e inseriscine una di almeno otto caratteri con una lettera minuscola (a–z), una maiuscola (A–Z) e una cifra. Ripetila nel campo di conferma. Invia quest’ultimo passaggio per creare l’account. Se abbandoni i passaggi precedenti, l’account non viene creato. Quando è richiesta la conferma dell’email, apri il messaggio inviato dall’istanza. Segui il collegamento e premi il pulsante di conferma nella pagina. Aprire il collegamento non basta: Minddy richiede questa azione esplicita prima di consumare il token email.

Torna all’applicazione prevista e accedi. Un account appena autenticato può creare il proprio progetto o accettare un invito a un progetto. Conoscere l’URL di un progetto non ne conferisce l’appartenenza.


![Registrazione tramite email, con i pulsanti dei provider e il primo passaggio della procedura in tre passaggi.](/documentation/it/auth-signup.png)

## Uscire e controllare le email mancanti {#session-and-mail}

Apri il menu dell’account, scegli di uscire e conferma. Nell’app desktop, chiudere una scheda o una finestra non equivale a uscire dall’account. Usa il menu dell’account se vuoi terminare la sessione.

Se l’email non arriva, controlla indirizzo, cartella dello spam e identità dell’istanza. L’operatore di un’istanza autonoma deve aver configurato un invio email funzionante per Auth; le notifiche email opzionali dell’applicazione e la conferma di Auth sono funzioni distinte. Una pagina di conferma scaduta permette di tornare all’accesso per richiedere un nuovo collegamento. Non inoltrare collegamenti di conferma o recupero come prova diagnostica: autorizzano l’accesso all’account.

![Modulo di accesso con il collegamento al recupero sotto il campo della password.](/documentation/it/auth-login.png)
