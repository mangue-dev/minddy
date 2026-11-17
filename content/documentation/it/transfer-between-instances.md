---
{
  "id": "transfer-between-instances",
  "locale": "it",
  "title": "Trasferimento dei dati dell’account",
  "summary": "Sposta i dati del tuo account tra istanze minddy: esporta un file JSON privato, importalo in modo additivo, poi verifica i conflitti e ricollega i servizi.",
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
  "revision": 10,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-17",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog review recapture of transfer-between-instances-workflow, transfer-between-instances-export-workflow on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (0.30.0 release review, MIN-794: source audit of the article against the v0.20.0..0.30.0 delta of its evidence files, no correction needed; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-673: summary lengthened for the page description from facts stated in the article sections; body unchanged; no screenshot in scope)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it figure update after the catalog review; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-673 summary translated from the English revision with the locale glossary and register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-17"
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
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
