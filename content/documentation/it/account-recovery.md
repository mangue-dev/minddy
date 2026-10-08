---
{
  "id": "account-recovery",
  "locale": "it",
  "title": "Recuperare l’accesso all’account",
  "summary": "Reimposta la password in sicurezza e riconosci quando servono ancora MFA o l’assistenza dell’istanza.",
  "topic": "Primi passi",
  "type": "troubleshooting",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "app/(auth)/reset-password/page.tsx",
      "components/settings/account-security-section.tsx",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-access",
    "account-security",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "account-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/it/auth-recovery.png",
      "alt": "Modulo di recupero della password con un indirizzo di esempio e il pulsante per inviare il collegamento.",
      "caption": "Inserisci qui l’email del tuo account. L’indirizzo di esempio non è stato inviato; l’immagine non dimostra la consegna del messaggio né un recupero riuscito.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        380,
        278
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "account-recovery-steps"
  ]
}
---

## Richiedere un nuovo collegamento di reimpostazione {#account-recovery}

Nella schermata di accesso dell’istanza corretta, usa il recupero della password e inserisci l’email associata al tuo account. Apri il messaggio di reimpostazione, segui il collegamento e conferma l’azione. Inserisci la nuova password nella schermata di reimpostazione e inviala. Verifica poi di poter accedere sulla stessa istanza.

Un collegamento può scadere o non avere più una sessione attiva. La schermata di reimpostazione identifica questa condizione e permette di richiedere un altro collegamento. Riparti da un nuovo messaggio invece di riprovare un vecchio segnalibro. Non inviare collegamento, cookie o password all’assistenza.


![Modulo di recupero della password con un indirizzo di esempio e il pulsante per inviare il collegamento.](/documentation/it/auth-recovery.png)

## MFA e accesso ancora irrisolto {#mfa-recovery}

Se l’autenticazione a due fattori è attiva, reimpostare la password non rimuove questo requisito. Usa l’app di autenticazione. Puoi anche usare un codice di recupero salvato quando hai attivato MFA; usarlo disattiva MFA. Tratta i codici di recupero come segreti e configura nuovamente MFA nelle impostazioni di sicurezza dopo aver recuperato l’accesso.

Se non hai né il secondo fattore né un codice di recupero, contatta l’operatore dell’istanza attraverso il suo canale di assistenza. Indica l’indirizzo dell’istanza e il problema visualizzato, senza token di autenticazione o contenuti privati del progetto. Se manca l’email di recupero, chiedi all’operatore di verificare gli URL di reindirizzamento di Auth e l’invio SMTP. Non creare un secondo account pensando che erediterà progetti o connessioni dell’account originale.
