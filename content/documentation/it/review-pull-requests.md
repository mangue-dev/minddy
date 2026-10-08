---
{
  "id": "review-pull-requests",
  "locale": "it",
  "title": "Revisionare una pull request collegata",
  "summary": "Esaminare file, discussioni e controlli prima di richiedere una revisione o un merge.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx",
      "content/knowledge/plans-and-agents.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/review-pull-requests-workflow.png",
      "alt": "Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.",
      "caption": "La PR effettivamente corretta rimane aperta, senza merge. Il diff rimuove gli spazi intorno al nome e usa World quando il valore è vuoto. Questa istanza non può richiedere l’autorizzazione dell’utente su GitHub: lo stato di disponibilità non concede il permesso di merge né dimostra che la CI del fornitore sia riuscita.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

## Esaminare la proposta {#review-pull-requests}
Apri la pull request collegata al ticket o all’esecuzione delegata. Serve comunque accesso al repository: essere membri del progetto non concede permessi sulla piattaforma Git.

Leggi descrizione e attività, quindi file modificati e blocchi del diff. Apri le conversazioni irrisolte e rispondi nel relativo thread. I contrassegni dei file letti registrano l’avanzamento, ma non costituiscono approvazione del fornitore. Controlla commit, risultati CI e ticket collegati rispetto al lavoro richiesto.

![Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.](/documentation/it/review-pull-requests-workflow.png)


## Revisione e merge {#decision}
Richiedi un reviewer quando serve un secondo controllo. Una revisione IA disponibile è un ulteriore parere, non dimostra che i test siano passati. Controlla stato di bozza o pronto per revisione, discussioni aperte, revisioni richieste e regole di merge.

Esegui il merge dopo i controlli e le revisioni richiesti, con un account autorizzato. Il fornitore può rifiutare un’azione visibile. Se lo stato è obsoleto, aggiorna e controlla la piattaforma prima di ripetere. Numo può leggere, commentare, cambiare disponibilità o eseguire il merge su autorizzazione; le modifiche al branch passano al worker. Un’anteprima richiede un deployment reale.
