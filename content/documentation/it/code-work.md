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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement; MIN-676 engine-specific native model and thinking controls; delegated worker reliability and card controls",
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
      "components/pull-requests/pr-reviews-details.tsx",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md",
      "lib/native-agent-models.ts",
      "components/settings/native-agent-model-preferences.tsx",
      "content/documentation/reviews/min-676-model-controls-2026-10-10.md",
      "content/documentation/reviews/agent-reliability-and-cards-2026-10-11.md"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (worker card, explicit validation, PR handoff and footer source/component review; no new provider execution)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale card controls and delivery wording review; not human acceptance)",
    "date": "2026-10-11"
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
      "alt": "Scheda di dimostrazione con stato, durata, Codex, modello, ragionamento, copia del ramo, pulsante PR e Visualizza lavoro.",
      "caption": "Scheda illustrativa del componente aggiornato con dati di dimostrazione. Le azioni aprono il pannello di lavoro, copiano il ramo o aprono la PR in Minddy. Questo esempio non dimostra l’esecuzione riuscita del fornitore né il superamento dei controlli.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        568,
        379
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/review-pull-requests-workflow.png",
      "alt": "Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.",
      "caption": "La PR effettivamente corretta rimane aperta, senza merge. Il diff rimuove gli spazi intorno al nome e usa World quando il valore è vuoto. Questa istanza non può richiedere l’autorizzazione dell’utente su GitHub: lo stato di disponibilità non concede il permesso di merge né dimostra che la CI del fornitore sia riuscita.",
      "revision": 8,
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

Servono un repository GitHub o GitLab collegato, autorizzazioni valide e una sandbox server configurata. Controlla **Agente di codice** nelle impostazioni IA dell’account. OpenCode richiede un modello di codice API compatibile; l’accesso limitato a Codex e Claude Code richiede la connessione dell’account personale selezionato. Imposta lì modello e ragionamento o mantieni **Automatico**. Queste scelte sono indipendenti dal modello di conversazione Numo. Se l’accesso nativo fallisce, ricollega l’account o scegli esplicitamente OpenCode; il lavoro non passa alla fatturazione API.

L’autenticazione Codex tramite abbonamento nei servizi ospitati non è disponibile per uso generale. OpenAI esclude esplicitamente l’autenticazione app-server da questi servizi e li indirizza a Sign in with ChatGPT. Minddy deve usare un’integrazione autorizzata prima del lancio. I test tecnici limitati non dimostrano l’autorizzazione del provider o il recupero dopo la scadenza naturale dei token. L’esecuzione a pagamento di Claude Code resta non testata. Rimuovere i badge dall’interfaccia non cambia queste condizioni. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

La scheda del lavoro delegato, i dettagli dell’agente e la sua conversazione mostrano il motore di quella esecuzione con il suo logo: **Codex**, **Claude Code** oppure **OpenCode**. Questa identità viene salvata all’avvio. Le modifiche alle impostazioni dell’account valgono per i nuovi agenti; non cambiano l’identificazione di un’esecuzione esistente. Le esecuzioni precedenti senza motore salvato mostrano un’etichetta generica di agente di codice.

La scheda verticale mostra lo stato attuale, il tempo di esecuzione, il motore, il modello, il ragionamento, i file modificati e il ramo. Il timer somma il lavoro ripreso e si ferma mentre attende la tua risposta. L’icona di copia permette di copiare il nome completo del ramo. Apri **Azioni dell’agente** e seleziona **Ferma**. **Visualizza lavoro** apre il pannello delle attività con le stesse informazioni. **Visualizza pull request** apre la PR collegata in Minddy.

L’implementazione viene consegnata tramite una pull request. Se la pubblicazione è bloccata, Numo segnala il mancato completamento della consegna. La verifica è separata dalla pubblicazione; i controlli non completati non sono considerati superati. La descrizione della PR in Minddy conserva il piè di pagina Numo con modello, ambiente e ragionamento.

1. Apri il ticket e descrivi comportamento atteso, vincoli e verifiche di accettazione.
2. Apri Numo con quel contesto. Chiedi di ispezionare il repository prima del piano tecnico. Nomi di file e API non verificati non sono prove di implementazione.
3. Richiedi esplicitamente l’implementazione. Numo delega le modifiche del branch al worker, che clona il repository nella sandbox server.
4. Segui avanzamento, file, controlli e domande nella scheda del worker. Rispondi nella conversazione.
5. Apri la pull request collegata. Verifica diff e controlli rispetto ai criteri prima del merge. L’anteprima esiste solo se il fornitore di deployment l’ha prodotta.

![Scheda di dimostrazione con stato, durata, Codex, modello, ragionamento, copia del ramo, pulsante PR e Visualizza lavoro.](/documentation/it/delegate-code-work-workflow.png)

### Riprendere in sicurezza {#continuation}

Un checkpoint conservato può consentire la ripresa, senza garantire il completamento. Verifica branch e PR prima di ripetere un’esecuzione fallita. Mantieni attività completate e modifiche concorrenti del piano. I file solo locali non sono disponibili: esegui prima il push del codice o delle skill necessarie.

## Revisionare una pull request collegata {#review-pull-requests}

Apri la pull request collegata al ticket o all’esecuzione delegata. Serve comunque accesso al repository: essere membri del progetto non concede permessi sulla piattaforma Git.

Leggi descrizione e attività, quindi file modificati e blocchi del diff. Apri le conversazioni irrisolte e rispondi nel relativo thread. I contrassegni dei file letti registrano l’avanzamento, ma non costituiscono approvazione del fornitore. Controlla commit, risultati CI e ticket collegati rispetto al lavoro richiesto.

![Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.](/documentation/it/review-pull-requests-workflow.png)

### Revisione e merge {#decision}

Richiedi un reviewer quando serve un secondo controllo. Una revisione IA disponibile è un ulteriore parere, non dimostra che i test siano passati. Controlla stato di bozza o pronto per revisione, discussioni aperte, revisioni richieste e regole di merge.

Esegui il merge dopo i controlli e le revisioni richiesti, con un account autorizzato. Il fornitore può rifiutare un’azione visibile. Se lo stato è obsoleto, aggiorna e controlla la piattaforma prima di ripetere. Numo può leggere, commentare, cambiare disponibilità o eseguire il merge su autorizzazione; le modifiche al branch passano al worker. Un’anteprima richiede un deployment reale.
