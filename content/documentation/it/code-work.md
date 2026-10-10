---
{
  "id": "code-work",
  "locale": "it",
  "title": "Lavoro sul codice e pull request",
  "summary": "Delega l’implementazione di un ticket a un agente di codice, prosegui il lavoro e rivedi la pull request collegata.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "repository-skills"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Delegare un ticket al worker di codice",
    "Revisionare una pull request collegata"
  ],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/delegate-code-work-workflow.png",
      "alt": "Scheda del worker completato con modello, ragionamento leggero, due file modificati, branch, PR n. 1 e commit corretto.",
      "caption": "Scheda della correzione effettiva della PR esistente, con commit aggiornato e collegamento. Verifica diff e controlli prima del merge: lo stato completato da solo non dimostra che i criteri di accettazione siano soddisfatti.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        179
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/review-pull-requests-workflow.png",
      "alt": "Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.",
      "caption": "La PR effettivamente corretta rimane aperta, senza merge. Il diff rimuove gli spazi intorno al nome e usa World quando il valore è vuoto. Questa istanza non può richiedere l’autorizzazione dell’utente su GitHub: lo stato di disponibilità non concede il permesso di merge né dimostra che la CI del fornitore sia riuscita.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

Il lavoro sul codice parte da un ticket e dal repository collegato e viene eseguito da un worker in una sandbox del server. Segui l’avanzamento nella conversazione, verifica le modifiche e i controlli, poi esamina la pull request collegata prima di decidere il merge.

## Delegare un ticket al worker di codice {#delegate-code-work}

Servono un repository GitHub o GitLab collegato, autorizzazioni valide e una sandbox server configurata. Controlla modello e ragionamento del worker nelle impostazioni IA dell’account. Il modello della conversazione non sostituisce questi valori.

1. Apri il ticket e descrivi comportamento atteso, vincoli e verifiche di accettazione.
2. Apri Numo con quel contesto. Chiedi di ispezionare il repository prima del piano tecnico. Nomi di file e API non verificati non sono prove di implementazione.
3. Richiedi esplicitamente l’implementazione. Numo delega le modifiche del branch al worker, che clona il repository nella sandbox server.
4. Segui avanzamento, file, controlli e domande nella scheda del worker. Rispondi nella conversazione.
5. Apri la pull request collegata. Verifica diff e controlli rispetto ai criteri prima del merge. L’anteprima esiste solo se il fornitore di deployment l’ha prodotta.

![Scheda del worker completato con modello, ragionamento leggero, due file modificati, branch, PR n. 1 e commit corretto.](/documentation/it/delegate-code-work-workflow.png)

### Riprendere in sicurezza {#continuation}

Un checkpoint conservato può consentire la ripresa, senza garantire il completamento. Verifica branch e PR prima di ripetere un’esecuzione fallita. Mantieni attività completate e modifiche concorrenti del piano. I file solo locali non sono disponibili: esegui prima il push del codice o delle skill necessarie.

## Revisionare una pull request collegata {#review-pull-requests}

Apri la pull request collegata al ticket o all’esecuzione delegata. Serve comunque accesso al repository: essere membri del progetto non concede permessi sulla piattaforma Git.

Leggi descrizione e attività, quindi file modificati e blocchi del diff. Apri le conversazioni irrisolte e rispondi nel relativo thread. I contrassegni dei file letti registrano l’avanzamento, ma non costituiscono approvazione del fornitore. Controlla commit, risultati CI e ticket collegati rispetto al lavoro richiesto.

![Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.](/documentation/it/review-pull-requests-workflow.png)

### Revisione e merge {#decision}

Richiedi un reviewer quando serve un secondo controllo. Una revisione IA disponibile è un ulteriore parere, non dimostra che i test siano passati. Controlla stato di bozza o pronto per revisione, discussioni aperte, revisioni richieste e regole di merge.

Esegui il merge dopo i controlli e le revisioni richiesti, con un account autorizzato. Il fornitore può rifiutare un’azione visibile. Se lo stato è obsoleto, aggiorna e controlla la piattaforma prima di ripetere. Numo può leggere, commentare, cambiare disponibilità o eseguire il merge su autorizzazione; le modifiche al branch passano al worker. Un’anteprima richiede un deployment reale.
