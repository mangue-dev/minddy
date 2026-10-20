---
{
  "id": "transfer-between-instances",
  "locale": "it",
  "title": "Trasferimento dei dati dell’account",
  "summary": "Esporta i dati del tuo account in un JSON privato, importali senza sostituire quelli esistenti e verifica conflitti ed esclusioni.",
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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-737 account settings reorganization",
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
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Privacy & data tab name; the retained screenshots predate the rename; no browser walkthrough, no new captures)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root (it MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Trasferire dati tra istanze"
  ],
  "figures": [
    {
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/transfer-between-instances-workflow.png",
      "alt": "Impostazioni di trasferimento con pulsante per importare un file.",
      "caption": "Scegli il JSON integro esportato dall’account di origine; controlla il risultato prima di chiudere.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/transfer-between-instances-export-workflow.png",
      "alt": "Controllo di esportazione dell’account.",
      "caption": "Controllo di esportazione dell’account. Il file esclude chiavi e token; la cattura mostra il pulsante prima del download.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
  ]
}
---

## Esportare e importare {#transfer-between-instances}

Accedi all’istanza di origine e apri la scheda **Privacy e dati** nelle impostazioni dell’account. Scegli **Scarica i miei dati** e conserva privatamente il file JSON: contiene dati dell’account e dei progetti, compresi i byte dei file. Crea il tuo account nell’istanza di destinazione oppure accedi a quello esistente, verifica l’indirizzo, apri la stessa scheda e scegli **Importa un file di trasferimento**. Seleziona il file esportato senza modificarlo e attendi il risultato prima di chiudere la pagina.

L’importazione aggiunge dati senza sostituire quelli della destinazione. Gli identificatori vengono conservati quando possono essere riutilizzati in sicurezza; in caso di conflitto ne vengono assegnati di nuovi. Il risultato indica gli identificatori rimappati e le appartenenze ai progetti ignorate. I riferimenti di appartenenza a progetti esistenti vengono ripristinati solo se il progetto di destinazione esiste già e il riferimento è autorizzato. Dopo il ricaricamento della pagina, controlla progetti, ticket, pagine e dati personali.

![Impostazioni di trasferimento con pulsante per importare un file.](/documentation/it/transfer-between-instances-workflow.png)

## Ricollegare servizi {#exclusions}

Password, chiavi API, token OAuth, credenziali dei repository e abbonamenti non vengono trasferiti. Configura e autorizza di nuovo i servizi necessari nella destinazione; un progetto esportato non dimostra che l’accesso al provider funzioni. Controlla le risorse file e la loro disponibilità: il JSON non è un backup operativo della base dati e dei byte di Storage. Un’esportazione creata da v0.11.0 o precedenti può contenere viste salvate della palette dei comandi e conversazioni dell’agente di codice; questa release non ha più queste funzionalità e le ignora durante l’importazione.

Mantieni l’istanza di origine finché non hai verificato il lavoro trasferito. Se l’importazione fallisce, conserva il messaggio d’errore e controlla lo stato della destinazione prima di ripetere l’operazione. Elimina o proteggi i file di trasferimento quando non servono più; non allegarli mai a una segnalazione pubblica.

![Controllo di esportazione dell’account.](/documentation/it/transfer-between-instances-export-workflow.png)

Il risultato rimane aperto finché non scegli Ricarica l’account o chiudi la finestra. Entrambe le azioni ricaricano l’account dopo che hai controllato i conteggi.
