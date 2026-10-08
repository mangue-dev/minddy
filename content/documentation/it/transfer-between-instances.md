---
{
  "id": "transfer-between-instances",
  "locale": "it",
  "title": "Trasferire dati tra istanze",
  "summary": "Esportare JSON privato, importare in aggiunta e verificare conflitti ed esclusioni.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A07"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/account-transfer-execution.json"
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
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/transfer-between-instances-workflow.png",
      "alt": "Impostazioni di trasferimento con pulsante per importare un file.",
      "caption": "Scegli il JSON integro esportato dall’account di origine; controlla il risultato prima di chiudere.",
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
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/transfer-between-instances-export-workflow.png",
      "alt": "Controllo di esportazione dell’account.",
      "caption": "Controllo di esportazione dell’account. Il file esclude chiavi e token; la cattura mostra il pulsante prima del download.",
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
      "id": "transfer-between-instances-result-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/transfer-between-instances-result.png",
      "alt": "Risultato dell’importazione con zero identificativi riassegnati e zero iscrizioni escluse.",
      "caption": "Questa importazione reale di dati personali non presenta conflitti di identificativi né iscrizioni escluse. Controlla i conteggi, poi scegli Ricarica l’account o chiudi la finestra per ricaricarlo.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow",
    "transfer-between-instances-result-workflow"
  ]
}
---

## Esportare e importare {#transfer-between-instances}

Accedi all’istanza di origine e apri la sezione Dati nelle impostazioni dell’account. Scarica l’esportazione JSON e conservala privatamente: contiene dati dell’account e dei progetti. Crea il tuo account nell’istanza di destinazione oppure accedi a quello esistente, verifica l’indirizzo e scegli lì il comando di importazione. Seleziona il file esportato senza modificarlo e attendi il risultato prima di chiudere la pagina.

L’importazione aggiunge dati senza sostituire quelli della destinazione. Gli identificatori vengono conservati quando possono essere riutilizzati in sicurezza; in caso di conflitto ne vengono assegnati di nuovi. Il risultato indica gli identificatori rimappati e le appartenenze ai progetti ignorate. I riferimenti di appartenenza a progetti esistenti vengono ripristinati solo se il progetto di destinazione esiste già e il riferimento è autorizzato. Dopo il ricaricamento della pagina, controlla progetti, ticket, pagine e dati personali.

![Impostazioni di trasferimento con pulsante per importare un file.](/documentation/it/transfer-between-instances-workflow.png)


## Ricollegare servizi {#exclusions}

Password, chiavi API, token OAuth, credenziali dei repository e abbonamenti non vengono trasferiti. Configura e autorizza di nuovo i servizi necessari nella destinazione; un progetto esportato non dimostra che l’accesso al provider funzioni. Controlla le risorse file e la loro disponibilità: il JSON non è un backup operativo della base dati e dei byte di Storage.

Mantieni l’istanza di origine finché non hai verificato il lavoro trasferito. Se l’importazione fallisce, conserva il messaggio d’errore e controlla lo stato della destinazione prima di ripetere l’operazione. Elimina o proteggi i file di trasferimento quando non servono più; non allegarli mai a una segnalazione pubblica.

![Controllo di esportazione dell’account.](/documentation/it/transfer-between-instances-export-workflow.png)

Il risultato rimane aperto finché non scegli Ricarica l’account o chiudi la finestra. Entrambe le azioni ricaricano l’account dopo che hai controllato i conteggi.

![Risultato dell’importazione con zero identificativi riassegnati e zero iscrizioni escluse.](/documentation/it/transfer-between-instances-result.png)
