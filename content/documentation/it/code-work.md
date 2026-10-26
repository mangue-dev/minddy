---
{
  "id": "code-work",
  "locale": "it",
  "title": "Lavoro sul codice e pull request",
  "summary": "Affida un ticket al tuo agente di codice con un prompt copiato e minddy MCP, poi rivedi e unisci la pull request collegata.",
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
  "revision": 20,
  "sourceRevision": 19,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/agent/use-agent-menu-actions.tsx",
      "components/agent/custom-prompt-dialog.tsx",
      "components/settings/account-preferences-section.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-unresolved-conversations.tsx",
      "lib/server/agent/pr-mention.ts",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/pr-context-menu.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/pull-requests/pr-link-issue.tsx",
      "components/pull-requests/pr-link-target-picker.tsx",
      "lib/bulk-pull-request-links.ts",
      "components/settings/account-issues-section.tsx",
      "components/markdown-image.tsx",
      "components/pull-requests/pr-image-diff.tsx",
      "components/image-viewer.tsx",
      "components/issue-card.tsx"
    ]
  },
  "review": {
    "revision": 20,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "issues",
    "minddy-mcp",
    "git"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Affidare un ticket a un agente di codice esterno",
    "Revisionare una pull request collegata"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/review-pull-requests-workflow.png",
      "alt": "Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.",
      "caption": "PR dimostrativa che rimane aperta, non unita. Il diff rimuove gli spazi intorno al nome e usa World quando il valore è vuoto. Questa istanza non può richiedere l’autorizzazione dell’utente su GitHub: lo stato di disponibilità non concede il permesso di unione né dimostra che la CI del fornitore sia riuscita.",
      "revision": 20,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "review-pull-requests-workflow"
  ]
}
---

Minddy tiene traccia del lavoro; il tuo agente di codice, come Claude Code, Codex o Cursor, modifica il codice. Copia un prompt dal ticket, lascia che l’agente legga e aggiorni il ticket tramite minddy MCP, poi rivedi in Minddy la pull request collegata prima dell’unione. Numo non scrive codice, non apre branch e non esegue test.

## Affidare un ticket a un agente di codice esterno {#external-coding-agents}

Collega prima il tuo agente a minddy MCP, così potrà leggere il piano e aggiornarne le attività; consulta [Collegare un assistente esterno a minddy MCP](/docs/minddy-mcp#external-minddy-mcp). L’agente viene eseguito sul tuo computer o nel suo servizio, con il suo abbonamento o i suoi costi API. Minddy non gli fornisce l’accesso al repository.

1. Apri il ticket e descrivi comportamento atteso, vincoli e verifiche di accettazione. Quando il lavoro comprende più passaggi, scrivi o rivedi il piano nella scheda Piano.
2. Apri il menu delle azioni del ticket e scegli **Copia come prompt**. Scegli **Genera un piano** (o **Rivedi il piano** se esiste già) per definire il lavoro senza scrivere codice, **Implementa il ticket** per avviare la modifica, **Verifica l'implementazione** per far controllare all’agente il lavoro concluso rispetto al piano e ai commenti, oppure **Personalizzato…** per scrivere un’istruzione tua.
3. Incolla il prompt nel tuo agente, nella copia di lavoro del repository. La copia non esegue alcun modello di IA e non consuma la quota di IA.
4. Segui l’avanzamento del piano nel ticket mentre l’agente ne aggiorna le attività tramite MCP. Rispondi alle sue domande nell’agente, oppure aggiungi le decisioni al ticket perché il prompt successivo le includa.

Quando il tuo agente ha commentato il ticket tramite MCP e dopo arrivano altri commenti, compresi quelli importati da una pull request collegata, sopra il campo del commento compare il pulsante **Copia il prompt per N nuovi commenti**. Il prompt chiede all’agente di leggere quei commenti tramite MCP e di gestirli uno per uno; non li copia. Su una board, la scheda del ticket mostra quanti commenti sono in attesa, un clic su quel numero copia lo stesso prompt e il menu del clic destro offre **Copia il prompt per i nuovi commenti**.

Il contenuto del prompt, il nome di branch suggerito e le regole di lingua sono descritti in [Copiare un prompt per un altro agente di codice](/docs/issues#copy-issue-prompt).

### Mantenere il lavoro collegato al ticket {#link-work}

Quando il repository è collegato al progetto, inserisci l’identificatore del ticket nel nome del branch, nel titolo della pull request o in una riga `Fixes MIN-42`. Minddy collega allora la pull request al ticket, e i prompt successivi chiedono all’agente di proseguire la pull request aperta sul suo branch. Per collegare un ticket a mano, usa **Collega un ticket** sulla pull request. La sua ricerca accetta un identificatore o parole del titolo, e una descrizione mostra anche ticket del progetto trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**.

Da una board, fai clic con il tasto destro su un ticket senza pull request aperta e scegli **Collega a una pull request** per selezionare una delle pull request aperte del suo progetto, bozze comprese. La voce compare solo quando quel progetto ha almeno una pull request da collegare. Con più ticket selezionati, **Azioni** offre la stessa scelta per l’intera selezione, e **Collega gli altri ticket a #N** quando alcuni hanno già la pull request N. **Collega a una pull request** non viene più proposto appena un ticket selezionato ha una pull request collegata; **Scollega N ticket dalle loro pull request** rimuove prima tutti i collegamenti della selezione, dopo la tua conferma. I collegamenti compaiono subito sulle schede, e un collegamento rifiutato scompare quando la board si aggiorna. Una scheda con una pull request aperta mostra il suo numero, colorato in base allo stato, e il suo stato di unione, lo stesso indicatore di **Revisione del codice**.

In **Impostazioni account → Ticket → Avviare un ticket**, **Avvia il ticket o l'attività quando ne copio il prompt** porta in corso un ticket o un’attività del taccuino non ancora avviati quando ne copi il prompt. Lascia l’opzione disattivata se copi i prompt solo per leggerli.

## Revisionare una pull request collegata {#review-pull-requests}

Apri la pull request collegata a un ticket, oppure cercala nell’elenco delle pull request. Serve comunque accesso al repository: essere membri del progetto non concede permessi sulla piattaforma Git.

Leggi descrizione e attività, quindi file modificati e blocchi del diff. Apri le conversazioni irrisolte e rispondi nel relativo thread anziché creare un commento scollegato. Per restituire al tuo agente i commenti ancora da risolvere, apri **Visualizza conversazioni**, poi **Correggi tutto** e **Copia prompt**. I contrassegni dei file letti registrano l’avanzamento della lettura, ma non costituiscono un’approvazione del fornitore. Controlla commit, risultati CI e ticket collegati per confermare che la modifica proposta copra il lavoro richiesto.

In una descrizione, in un commento o nel diff di un’immagine, fai clic su un’immagine per aprirla a tutta finestra; il diff di un’immagine apre separatamente i lati **Prima** e **Dopo**. Usa **Chiudi** o Esc per tornare alla pull request.

Menziona `@numo` in un commento della pull request per chiedere a Numo una revisione in sola lettura in una conversazione. Numo legge la pull request e risponde; non esegue push di commit. Una menzione scritta sulla piattaforma Git conta solo se il suo autore è collegato al proprietario o a un Membro (non a un lettore) di un progetto che collega il repository, e il relativo consumo viene addebitato al proprietario di quel progetto.

Ciò che viene scritto su una pull request o merge request collegata compare anche nei commenti di ogni ticket a cui è collegata: i commenti della conversazione, il messaggio di una revisione inviata e i commenti sul codice con il file, la riga e, su GitHub, l’estratto a cui si riferiscono, con le risposte raggruppate sotto. I commenti dei bot restano sulla pull request, tranne quelli sul codice. Una modifica aggiorna la copia, e un commento eliminato su GitHub appare come eliminato; GitLab non segnala le eliminazioni. Ogni volta che una pull request viene collegata a un ticket, a mano o perché il suo branch, il titolo o la descrizione nomina il ticket, i commenti che ha già vengono importati con la data in cui sono stati scritti, anche se precedente alla creazione del ticket. Rispondi sotto uno di questi commenti per rispondere sulla pull request con il tuo account Git, come nella vista della pull request; una conversazione sul codice mostra anche **Risolta** o **Obsoleto** e propone **Risolvi** o **Riapri**. Le copie in sé non si possono modificare in Minddy.

![Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.](/documentation/it/review-pull-requests-workflow.png)

### Revisione e unione {#decision}

Usa **Richiedi una revisione** per scegliere un reviewer quando serve un secondo controllo. Controlla stato di bozza o pronto per revisione, discussioni aperte, revisioni richieste e regole di unione del fornitore.

Esegui l’unione solo dopo i controlli e le revisioni richiesti, con un account del fornitore autorizzato. **Unisci con Numo** lascia a Numo la stesura del titolo e della descrizione del commit di unione a partire dalla pull request, poi esegue l’unione non appena sono pronti. Il fornitore può comunque rifiutare un’azione visibile. Se lo stato mostrato è obsoleto, aggiorna e controlla la piattaforma prima di ripetere un’azione. Un’anteprima collegata richiede un deployment reale del fornitore.

Fai clic con il tasto destro su una pull request dell’elenco per cambiarne lo stato, unirla o chiedere una correzione senza aprirla. Una pull request aperta offre **Converti in bozza** e **Chiudi pull request**, una bozza offre **Pronta per la revisione** e **Chiudi pull request**, e una chiusa offre **Riapri**; ogni cambio chiede una conferma. Una pull request unita non offre alcun cambio di stato. Le azioni di scrittura compaiono solo quando il tuo account del fornitore può scrivere nel repository e restano non disponibili finché il menu non ha riletto la pull request. **Unisci** compare quando la pull request è aperta, non è una bozza ed è pronta per l’unione; apre la pull request sulla sua consueta conferma di unione. **Copia prompt di correzione** e **Correggi con Numo** compaiono quando un controllo fallisce, una conversazione non è risolta, oppure il branch ha conflitti o non è aggiornato. **Correggi con Numo** invia quel prompt a Numo con la pull request come contesto. Numo può leggere la pull request, rispondere a una conversazione di revisione che non richiede modifiche al codice e risolvere le conversazioni già gestite dal branch, ma non modifica il codice e non esegue push di commit; per le modifiche al codice, usa **Copia prompt di correzione** e incollalo nel tuo agente di codice. Permessi e possibilità di unione vengono verificati di nuovo alla conferma.
