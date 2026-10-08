---
{
  "id": "permissions-and-public-links",
  "locale": "it",
  "title": "Comprendere permessi e link pubblici",
  "summary": "Il server verifica l’accesso al progetto per ogni operazione.",
  "topic": "Concetti tecnici",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "share-a-view",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/it/permissions-and-public-links-flow.svg",
      "alt": "Schema: Permessi account e progetto. Oggetto privato o pubblicazione esplicita. Solo insieme pubblicato e file firmati. Revocare link; file scadono successivamente.",
      "caption": "Questi componenti hanno responsabilità distinte. Permessi account e progetto. Oggetto privato o pubblicazione esplicita. Solo insieme pubblicato e file firmati. Revocare link; file scadono successivamente.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Comprendere permessi e link pubblici {#permissions-and-public-links}

Il server verifica l’accesso al progetto per ogni operazione. Il proprietario gestisce le impostazioni riservate, i membri e le integrazioni; i membri lavorano su ticket e pagine secondo i permessi applicabili. Nascondere un controllo nell’interfaccia non concede alcuna autorizzazione. Preferenze personali, quaderno e conversazioni private non diventano condivisi quando aggiungi contesto di progetto. MCP opera con l’account che lo ha autorizzato e ricontrolla l’appartenenza al progetto; non attribuisce privilegi di amministratore all’agente.

![Schema: Permessi account e progetto. Oggetto privato o pubblicazione esplicita. Solo insieme pubblicato e file firmati. Revocare link; file scadono successivamente.](/documentation/it/permissions-and-public-links-flow.svg)

## Comprendere cosa viene pubblicato {#publication}

Una pagina pubblicata o una vista condivisa usa un link opaco, eventualmente protetto da password. Chi possiede il link e, quando richiesta, la password può accedere al contenuto pubblicato. Revoca il link quando non serve più. Le sottopagine vengono risolte solo all’interno dell’insieme pubblicato, senza mostrare i titoli delle pagine escluse. Le URL firmate dei file riguardano solo le pagine incluse; i bucket e le route private rimangono protetti. Le menzioni possono restare testo senza un profilo accessibile. Un database pubblico mostra soltanto le voci del ramo pubblicato.

## Provare pubblicazione e revoca {#revocation}

Apri il link in una sessione separata senza login e controlla contenuti, file ed esclusioni. Revocalo e ripeti la prova. Non puoi richiamare le copie già scaricate; le URL firmate dei file rimangono valide fino alla scadenza, pari a 24 ore per le pagine. I link segreti conservano noindex, a differenza del centro di documentazione indicizzabile. noindex è un’indicazione per i crawler, non un controllo di accesso. Non inserire link privati in rapporti o esempi pubblici.
