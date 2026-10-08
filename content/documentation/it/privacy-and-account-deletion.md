---
{
  "id": "privacy-and-account-deletion",
  "locale": "it",
  "title": "Gestire analisi e cancellazione dell’account",
  "summary": "Verificare destinazioni e conseguenze prima di una richiesta irreversibile.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A09"
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
      "components/settings/account-analytics-section.tsx",
      "components/settings/account-data-section.tsx",
      "app/api/account/deletion-preview/route.ts",
      "app/api/account/route.ts"
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
      "id": "privacy-and-account-deletion-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/privacy-and-account-deletion-workflow.png",
      "alt": "Anteprima di eliminazione con progetti posseduti, ticket e membri che perderanno l’accesso.",
      "caption": "Leggi l’anteprima ed esporta i dati da conservare prima di aprire la conferma.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "privacy-and-account-deletion-workflow"
  ]
}
---

## Consenso alle analisi {#privacy-and-account-deletion}

Quando il servizio di analisi è configurato, le impostazioni dell’account mostrano un interruttore per il consenso e un collegamento alla politica sui cookie. Disattivarlo cambia subito il consenso alle misurazioni su questo dispositivo e salva la scelta nell’account. La scelta locale già presente su un altro dispositivo può continuare a valere lì. Se non è configurato un servizio di analisi, la sezione non compare.

Il consenso è distinto dai dati necessari al funzionamento dell’account. Leggi la politica sulla privacy dell’istanza e verifica i provider esterni che hai abilitato. Nell’auto-hosting, configurazione e politiche dell’operatore determinano le destinazioni dei servizi; disattivare l’analisi non rimuove le integrazioni IA o Git.

![Anteprima di eliminazione con progetti posseduti, ticket e membri che perderanno l’accesso.](/documentation/it/privacy-and-account-deletion-workflow.png)


## Controllare la cancellazione {#deletion}

Prima di eliminare l’account, esporta dalla sezione Dati ciò che devi conservare. Leggi l’anteprima dei progetti di cui sei proprietario, dei membri coinvolti, dei ticket, dei commenti e dell’abbonamento attivo. Le conseguenze sui progetti posseduti riguardano altre persone: risolvile prima di confermare.

Apri la conferma di eliminazione soltanto quando sei pronto. Digita l’indirizzo email dell’account e, se l’account ha una password, anche la password. Gli account senza password richiedono un accesso recente. Segui le indicazioni di un eventuale rifiuto di autenticazione recente, senza riprovare alla cieca. Se l’eliminazione riesce, la sessione viene chiusa e si torna al sito pubblico. Non è uno spostamento nel cestino recuperabile. Mantieni private le esportazioni e gestisci eventuali questioni residue su abbonamenti o provider tramite i rispettivi controlli di fatturazione e servizio.
