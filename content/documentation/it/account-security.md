---
{
  "id": "account-security",
  "locale": "it",
  "title": "Proteggere l’account con un secondo fattore",
  "summary": "Verificare un autenticatore e conservare i codici di recupero prima di concludere.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A02"
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
      "components/settings/account-security-section.tsx",
      "app/api/account/mfa/route.ts",
      "app/api/account/mfa/recovery-codes/route.ts",
      "app/api/account/mfa/recover/route.ts",
      "lib/server/mfa.ts",
      "content/documentation/reviews/mfa-enrollment-capture-candidates.json"
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
      "id": "account-security-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/account-security-workflow.png",
      "alt": "Scheda di autenticazione a due fattori con pulsante di attivazione.",
      "caption": "Inizia qui, poi verifica l’autenticatore e conserva privatamente i codici di recupero.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "account-security-enrollment-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/account-security-enrollment-workflow.png",
      "alt": "Configurazione dell’autenticatore prima della verifica del codice.",
      "caption": "Configurazione dell’autenticatore prima della verifica del codice. Il QR reale e il segreto manuale sono oscurati; questo fattore temporaneo non verificato è stato annullato e rimosso.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1200
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-security-workflow",
    "account-security-enrollment-workflow"
  ]
}
---

## Attivare e verificare {#account-security}

Apri la sezione Sicurezza nelle impostazioni dell’account e attiva l’autenticazione a due fattori. Questo secondo fattore viene richiesto anche quando accedi tramite Google o GitHub: l’autenticazione del provider non lo sostituisce.

1. Scansiona il codice QR con un’app di autenticazione TOTP oppure inserisci manualmente la chiave di configurazione mostrata. Non includere né il codice QR né la chiave in una schermata.
2. Inserisci il codice corrente di sei cifre e conferma. Se è scaduto, prova con il codice successivo; dopo troppi tentativi, attendi prima di riprovare.
3. Conserva i codici di recupero in un luogo protetto, accessibile anche senza il telefono. Ogni codice funziona una sola volta e l’elenco viene mostrato una sola volta. Prima di terminare, conferma di averlo salvato.

L’attivazione aggiorna la sessione corrente e tenta di disconnettere le altre sessioni. Se dopo l’accettazione del codice viene richiesta una nuova autenticazione, accedi di nuovo e segui le indicazioni visualizzate.

![Scheda di autenticazione a due fattori con pulsante di attivazione.](/documentation/it/account-security-workflow.png)


## Recupero e modifiche {#recovery}

Durante l’accesso, se non hai il telefono, usa uno dei codici di recupero che hai conservato. L’uso di un codice disattiva l’autenticazione a due fattori e invalida tutti i codici rimanenti. Dopo l’accesso, configura nuovamente l’app di autenticazione e conserva i nuovi codici di recupero. Questa procedura non garantisce il ripristino dell’account da parte dell’assistenza umana.

La sostituzione dei codici di recupero invalida l’elenco precedente. Sia la sostituzione sia la disattivazione volontaria richiedono i controlli di autenticazione recente del server. Leggi la conferma: disattivando la funzione, il fattore aggiuntivo non verrà più richiesto, neppure negli accessi tramite Google o GitHub.

![Configurazione dell’autenticatore prima della verifica del codice.](/documentation/it/account-security-enrollment-workflow.png)
