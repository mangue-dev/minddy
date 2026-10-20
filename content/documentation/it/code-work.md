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
  "revision": 17,
  "sourceRevision": 17,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-721 removal of Numo code work (copied prompts and MCP for external agents, pull request review and merge retained); MIN-685 sidebar context menus; MIN-693 project roles; MIN-718 hybrid issue search; MIN-737 account settings reorganization; MIN-686 shared reader for pull request images; UI/UX refinements batch: Link to a pull request offered only with a linkable pull request",
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
    "revision": 17,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (worker card, explicit validation, PR handoff and footer source/component review; no new provider execution); agent:/root/min721_docs (MIN-721 source review inherited from en revision 9; it translation of removal edits; no operational rerun); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 10; it translation of added passages; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (board pull request linking and card merge readiness: source and unit-test review of use-issue-menu-actions, pr-link-target-picker, bulk-pull-request-links and issue-pr-context; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (bulk link rule, unlink from all pull requests and optimistic links: source and unit-test review of bulk-pull-request-links and use-link-issues-to-pull-request; no browser walkthrough with live pull requests; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: source review of the Starting an issue card in components/settings/account-issues-section.tsx; unchanged evidence retained; no browser walkthrough, no new captures); agent:/root (MIN-686 pull request images: source and unit-test review of MarkdownImage and PrImageDiff opening the shared reader, Close and Escape dismissal; no browser walkthrough with a live pull request, no new captures; unchanged evidence retained); agent:/root (UI/UX refinements batch: source review of LinkablePullRequestsProbe in components/pull-requests/pr-link-target-picker.tsx (open pull requests, drafts included) and the gated board-card menu entry in components/issue-card.tsx; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale card controls and delivery wording review; not human acceptance); agent:/root/min721_it (it translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance); agent:/root (it translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min693_it with agent:/root (it MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (it translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (it board pull request linking paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (it added sentences, catalog UI labels and retained-meaning self-review; agent review, not human acceptance); agent:/root (it MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (it MIN-686 added sentence with catalog UI labels; agent review, not human acceptance); agent:/root (it translation of the Link to a pull request entry changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "caption": "PR dimostrativa che rimane aperta, senza merge. Il diff rimuove gli spazi intorno al nome e usa World quando il valore è vuoto. Questa istanza non può richiedere l’autorizzazione dell’utente su GitHub: lo stato di disponibilità non concede il permesso di merge né dimostra che la CI del fornitore sia riuscita.",
      "revision": 17,
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
    "review-pull-requests-workflow"
  ]
}
---

Minddy tiene traccia del lavoro; il tuo agente di codice, come Claude Code, Codex o Cursor, modifica il codice. Copia un prompt dal ticket, lascia che l’agente legga e aggiorni il ticket tramite minddy MCP, poi rivedi in Minddy la pull request collegata prima del merge. Numo non scrive codice, non apre branch e non esegue test.

## Affidare un ticket a un agente di codice esterno {#external-coding-agents}

Collega prima il tuo agente a minddy MCP, così potrà leggere il piano e aggiornarne le attività; consulta [Collegare un assistente esterno a minddy MCP](/docs/minddy-mcp#external-minddy-mcp). L’agente viene eseguito sul tuo computer o nel suo servizio, con il suo abbonamento o i suoi costi API. Minddy non gli fornisce l’accesso al repository.

1. Apri il ticket e descrivi comportamento atteso, vincoli e verifiche di accettazione. Quando il lavoro comprende più passaggi, scrivi o rivedi il piano nella scheda Piano.
2. Apri il menu delle azioni del ticket e scegli **Copia come prompt**. Scegli **Generare un piano** (o **Rivedere il piano** se esiste già) per definire il lavoro senza scrivere codice, **Implementa il ticket** per avviare la modifica, **Verificare l'attuazione** per far controllare all’agente il lavoro concluso rispetto al piano e ai commenti, oppure **Personalizzato...** per scrivere un’istruzione tua.
3. Incolla il prompt nel tuo agente, nella copia di lavoro del repository. La copia non esegue alcun modello di IA e non consuma la quota di IA.
4. Segui l’avanzamento del piano nel ticket mentre l’agente ne aggiorna le attività tramite MCP. Rispondi alle sue domande nell’agente, oppure aggiungi le decisioni al ticket perché il prompt successivo le includa.

Il contenuto del prompt, il nome di branch suggerito e le regole di lingua sono descritti in [Copiare un prompt per un altro agente di codice](/docs/issues#copy-issue-prompt).

### Mantenere il lavoro collegato al ticket {#link-work}

Quando il repository è collegato al progetto, inserisci l’identificatore del ticket nel nome del branch, nel titolo della pull request o in una riga `Fixes MIN-42`. Minddy collega allora la pull request al ticket, e i prompt successivi chiedono all’agente di proseguire la pull request aperta sul suo branch. Per collegare un ticket a mano, usa **Collega un ticket** sulla pull request. La sua ricerca accetta un identificatore o parole del titolo, e una descrizione mostra anche ticket del progetto trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**.

Da una board, fai clic con il tasto destro su un ticket senza pull request aperta e scegli **Collega a una pull request** per selezionare una delle pull request aperte del suo progetto, bozze comprese. La voce compare solo quando quel progetto ha almeno una pull request da collegare. Con più ticket selezionati, **Azioni** offre la stessa scelta per l’intera selezione, e **Collega gli altri ticket a #N** quando alcuni hanno già la pull request N. **Collega a una pull request** non viene più proposto appena un ticket selezionato ha una pull request collegata; **Scollega N ticket dalle loro pull request** rimuove prima tutti i collegamenti della selezione, dopo la tua conferma. I collegamenti compaiono subito sulle schede, e un collegamento rifiutato scompare quando la board si aggiorna. Una scheda con una pull request aperta mostra il suo numero, colorato in base allo stato, e il suo stato di unione, lo stesso indicatore di **Revisione del codice**.

In **Impostazioni account → Ticket → Avviare un ticket**, **Avvia il ticket o l'attività quando copi il prompt** porta in corso un ticket o un’attività del taccuino non ancora avviati quando ne copi il prompt. Lascia l’opzione disattivata se copi i prompt solo per leggerli.

## Revisionare una pull request collegata {#review-pull-requests}

Apri la pull request collegata a un ticket, oppure cercala nell’elenco delle pull request. Serve comunque accesso al repository: essere membri del progetto non concede permessi sulla piattaforma Git.

Leggi descrizione e attività, quindi file modificati e blocchi del diff. Apri le conversazioni irrisolte e rispondi nel relativo thread anziché creare un commento scollegato. Per restituire al tuo agente i commenti ancora da risolvere, apri **Visualizza conversazioni**, poi **Correggi tutto** e **Copia prompt**. I contrassegni dei file letti registrano l’avanzamento della lettura, ma non costituiscono un’approvazione del fornitore. Controlla commit, risultati CI e ticket collegati per confermare che la modifica proposta copra il lavoro richiesto.

In una descrizione, in un commento o nel diff di un’immagine, fai clic su un’immagine per aprirla a tutta finestra; il diff di un’immagine apre separatamente i lati **Prima** e **Dopo**. Usa **Chiudi** o Esc per tornare alla pull request.

Menziona `@numo` in un commento della pull request per chiedere a Numo una revisione in sola lettura in una conversazione. Numo legge la pull request e risponde; non esegue push di commit. Una menzione scritta sulla piattaforma Git conta solo se il suo autore è collegato al proprietario o a un Membro (non a un lettore) di un progetto che collega il repository, e il relativo consumo viene addebitato al proprietario di quel progetto.

![Scheda Modifiche della PR dimostrativa aperta, con il diff di greeting e l’avviso di autorizzazione GitHub non disponibile.](/documentation/it/review-pull-requests-workflow.png)

### Revisione e merge {#decision}

Usa **Richiedi una revisione** per scegliere un reviewer quando serve un secondo controllo. Controlla stato di bozza o pronto per revisione, discussioni aperte, revisioni richieste e regole di merge del fornitore.

Esegui il merge solo dopo i controlli e le revisioni richiesti, con un account del fornitore autorizzato. **Unisci con Numo** lascia a Numo la stesura del titolo e della descrizione del commit di merge a partire dalla pull request, poi esegue il merge non appena sono pronti. Il fornitore può comunque rifiutare un’azione visibile. Se lo stato mostrato è obsoleto, aggiorna e controlla la piattaforma prima di ripetere un’azione. Un’anteprima collegata richiede un deployment reale del fornitore.

Fai clic con il tasto destro su una pull request dell’elenco per cambiarne lo stato, unirla o chiedere una correzione senza aprirla. Una pull request aperta offre **Converti in bozza** e **Chiudi pull request**, una bozza offre **Pronta per la revisione** e **Chiudi pull request**, e una chiusa offre **Riapri**; ogni cambio chiede una conferma. Una pull request unita non offre alcun cambio di stato. Le azioni di scrittura compaiono solo quando il tuo account del fornitore può scrivere nel repository e restano non disponibili finché il menu non ha riletto la pull request. **Unisci** compare quando la pull request è aperta, non è una bozza ed è pronta per il merge; apre la pull request sulla sua consueta conferma di merge. **Copia prompt di correzione** e **Correggi con Numo** compaiono quando un controllo fallisce, una conversazione non è risolta, oppure il branch ha conflitti o non è aggiornato. **Correggi con Numo** invia quel prompt a Numo con la pull request come contesto. Numo può leggere la pull request, rispondere a una conversazione di revisione che non richiede modifiche al codice e risolvere le conversazioni già gestite dal branch, ma non modifica il codice e non esegue push di commit; per le modifiche al codice, usa **Copia prompt di correzione** e incollalo nel tuo agente di codice. Permessi e possibilità di merge vengono verificati di nuovo alla conferma.
