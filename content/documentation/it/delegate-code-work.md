---
{
  "id": "delegate-code-work",
  "locale": "it",
  "title": "Delegare un ticket al worker di codice",
  "summary": "Preparare l’accesso al repository, seguire l’esecuzione e verificare la pull request collegata.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03"
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "review-pull-requests",
    "recover-numo-work",
    "repository-skills"
  ],
  "aliases": [
    "plans-and-agents"
  ],
  "tags": [],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/delegate-code-work-workflow.png",
      "alt": "Scheda del worker completato con modello, ragionamento leggero, due file modificati, branch, PR n. 1 e commit corretto.",
      "caption": "Scheda della correzione effettiva della PR esistente, con commit aggiornato e collegamento. Verifica diff e controlli prima del merge: lo stato completato da solo non dimostra che i criteri di accettazione siano soddisfatti.",
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
    "delegate-code-work-workflow"
  ]
}
---

## Delimitare l’implementazione {#delegate-code-work}
Servono un repository GitHub o GitLab collegato, autorizzazioni valide e una sandbox server configurata. Controlla modello e ragionamento del worker nelle impostazioni IA dell’account. Il modello della conversazione non sostituisce questi valori.

1. Apri il ticket e descrivi comportamento atteso, vincoli e verifiche di accettazione.
2. Apri Numo con quel contesto. Chiedi di ispezionare il repository prima del piano tecnico. Nomi di file e API non verificati non sono prove di implementazione.
3. Richiedi esplicitamente l’implementazione. Numo delega le modifiche del branch al worker, che clona il repository nella sandbox server.
4. Segui avanzamento, file, controlli e domande nella scheda del worker. Rispondi nella conversazione.
5. Apri la pull request collegata. Verifica diff e controlli rispetto ai criteri prima del merge. L’anteprima esiste solo se il fornitore di deployment l’ha prodotta.

![Scheda del worker completato con modello, ragionamento leggero, due file modificati, branch, PR n. 1 e commit corretto.](/documentation/it/delegate-code-work-workflow.png)


## Riprendere in sicurezza {#continuation}
Un checkpoint conservato può consentire la ripresa, senza garantire il completamento. Verifica branch e PR prima di ripetere un’esecuzione fallita. Mantieni attività completate e modifiche concorrenti del piano. I file solo locali non sono disponibili: esegui prima il push del codice o delle skill necessarie.
