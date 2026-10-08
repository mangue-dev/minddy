---
{
  "id": "triage-incoming-work",
  "locale": "it",
  "title": "Valutare il lavoro in arrivo nel triage",
  "summary": "Chiarisci le nuove richieste prima di aggiungerle al lavoro pianificato.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "W03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "create-an-issue",
    "feedback-to-issue"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/it/triage-incoming.png",
      "alt": "Ticket dimostrativo DOC-11 in arrivo con segnalazione, proprietà e comandi per duplicato, Rifiuta e Accetta.",
      "caption": "Leggi la segnalazione ricevuta prima di accettarla, rifiutarla o collegare un duplicato.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "triage-incoming-work-steps"
  ]
}
---

## Valutare le richieste in arrivo {#triage-incoming-work}

Apri la destinazione Triaggio del progetto. Leggi il ticket in arrivo e il contesto della sua origine prima di accettarlo nel lavoro pianificato. Controlla se un ticket esistente rappresenta già la richiesta. Chiarisci risultato previsto, progetto, assegnatario, priorità e sforzo secondo necessità.

Scegli Accetta e conferma per spostare nel Backlog un ticket da mantenere. Scegli Rifiuta e conferma per impostarlo su Annullata. Se è un duplicato, usa il selettore dei duplicati per scegliere il ticket da mantenere. Il ticket in arrivo assume lo stato Duplicato e rimanda a quello scelto. Quando un elemento esce dal triage, viene selezionato il successivo. Verifica lo stato risultante o il collegamento al duplicato nel ticket stesso. Passare da una scheda all’altra senza eseguire una di queste azioni non chiude il ticket.

## Ordinamento e limiti {#triage-order}

Smart Triage usa regole di ordinamento deterministiche.

All’interno di ogni colonna di stato, i ticket aperti che bloccano altro lavoro aperto vengono prima dei ticket senza blocchi. I ticket bloccati da lavoro aperto vengono ultimi, anche quando bloccano a loro volta altri ticket. Gli estremi chiusi non generano più questa priorità. All’interno di ciascun livello, priorità più alta, impegno minore e scadenze superate o vicine fanno avanzare il lavoro. Nello stesso livello di blocco, i ticket di un obiettivo rimangono insieme e il gruppo viene ordinato in base al suo ticket meglio posizionato. A parità di posizione, contano la scadenza, la data di creazione più vecchia, la posizione manuale e infine l’identificativo, che garantisce un ordine stabile. Una relazione di collegamento non influisce su questo ordinamento. Non è una modalità sperimentale di triage con IA. L’ordine aiuta a scegliere quali elementi esaminare prima; non dimostra la verità di una descrizione, non risolve automaticamente i duplicati e non concede permessi.

Se manca l’elemento previsto, controlla progetto attivo, stato e filtri, poi cerca il suo identificativo. Il lavoro importato o sincronizzato dall’esterno può arrivare nel triage; controlla la fonte originale e la mappatura dell’integrazione prima di cambiare campi sincronizzati. Una richiesta collegata dal feedback resta un oggetto di feedback distinto con una propria discussione pubblica.


![Ticket dimostrativo DOC-11 in arrivo con segnalazione, proprietà e comandi per duplicato, Rifiuta e Accetta.](/documentation/it/triage-incoming.png)
