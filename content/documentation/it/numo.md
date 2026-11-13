---
{
  "id": "numo",
  "locale": "it",
  "title": "Numo",
  "summary": "Lavora con Numo, comprendi autorizzazioni ed esecuzione, collega servizi MCP e riprendi il lavoro in attesa o interrotto.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 38,
  "sourceRevision": 38,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-11",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "app/(app)/home/page.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts",
      "lib/server/numo-notes.ts",
      "lib/server/numo/memory-prompt.ts",
      "components/settings/account-numo-memory-section.tsx",
      "lib/server/assistant/long-message.ts",
      "lib/server/assistant/create-page-database.ts",
      "lib/server/numo/journal-content.ts",
      "lib/server/numo/journal-prompt.ts",
      "lib/server/numo/wake.ts",
      "lib/server/assistant/proactive-guard.ts",
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts",
      "lib/numo-watches.ts",
      "lib/server/numo/watch-proposal.ts",
      "components/assistant/watch-proposal-card.tsx",
      "lib/server/numo/watch-prompt.ts",
      "lib/server/assistant/context-compaction.ts",
      "lib/server/assistant/conversation-config.ts",
      "components/assistant/conversation-settings.tsx",
      "components/settings/account-numo-section.tsx",
      "components/assistant/numo-intro.tsx"
    ]
  },
  "review": {
    "revision": 38,
    "fact": "agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-946: AI budget warning sentence of #home-word, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-953: recurring reminders section and the last paragraph of #reminders, source audit against lib/numo-watches.ts, lib/server/numo/watches.ts, watch-clock.ts, watch-proposal.ts, lib/server/assistant/proactive-guard.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: step 2 of #work-with-numo, the default-model paragraph, the compaction paragraph of #continue and the model sentence of #numo-execution-model, source audit against lib/server/assistant/conversation-config.ts, lib/server/assistant/context-compaction.ts, components/assistant/conversation-settings.tsx and messages/*.json; no browser walkthrough; no figure shows the model control or the compaction step; existing figures kept, not recaptured); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-955: the paragraph on what Numo can change in #numo-permissions-and-approvals, source audit against lib/server/assistant/settings-coverage.ts, lib/server/account-settings.ts and the update_member_role tool; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-956: search in earlier conversations paragraph and memory switch sentence of #memory, source audit against lib/server/numo/conversation-search.ts, lib/server/numo/turns.ts, lib/server/assistant/execute-tool.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-907 Numo introduction: the message shown on Home and in an empty Numo panel when there is no summary, checked against components/assistant/numo-intro.tsx, app/(app)/home/page.tsx, components/assistant-panel.tsx, components/assistant/assistant-shell.tsx and messages/*.json; no browser walkthrough; no figure shows Home without a summary; existing figures kept, not recaptured)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-915 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-927 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-923 passage with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-930 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-946 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-953 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-954 settings paths with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-955 passage translated from en; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-907 Numo introduction paragraph, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-11"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Completare un’attività del progetto con Numo",
    "Capire i permessi di Numo",
    "Comprendere i turni persistenti di Numo",
    "Collegare un servizio MCP personale a Numo",
    "Riprendere il lavoro Numo interrotto o in attesa",
    "Comprendere turni duraturi Numo"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/work-with-numo-workflow.png",
      "alt": "Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.",
      "caption": "Conversazione dimostrativa esistente, tradotta per la visualizzazione. La risposta salvata cita AUR-11 e AUR-7; la cattura non attesta una nuova esecuzione.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/it/numo-permissions-and-approvals-workflow.svg",
      "alt": "Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.",
      "caption": "Accesso al progetto e richieste esplicite limitano le azioni di Numo; i contenuti esterni non concedono permessi.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo: accesso e autorizzazione",
        "headers": [
          "Azione o contesto",
          "Chi autorizza",
          "Limite"
        ],
        "rows": [
          [
            "Lavoro del progetto",
            "Membro con accesso al progetto",
            "Restano validi i permessi del progetto"
          ],
          [
            "Impostazioni del proprietario",
            "Proprietario del progetto",
            "Membri, repository e impostazioni feedback"
          ],
          [
            "Credenziali e sicurezza",
            "Titolare dell’account, nelle impostazioni",
            "Configurare direttamente chiavi, Git e secondo fattore"
          ],
          [
            "Risposta pubblica a un feedback",
            "Richiesta esplicita dell’utente",
            "Leggere una richiesta non autorizza una risposta pubblica"
          ],
          [
            "MCP personale",
            "Autore della conversazione",
            "Nessuna connessione personale di altri membri"
          ],
          [
            "Routine pianificata",
            "Proprietario attuale del progetto",
            "Connessioni e budget IA del proprietario"
          ],
          [
            "Risultato MCP remoto",
            "Contenuto esterno non affidabile",
            "Non può autorizzare altre azioni"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/it/numo-execution-model-flow.svg",
      "alt": "Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere la tua risposta se serve un input. Riprodurre eventi e riconciliare scritture incerte.",
      "caption": "Segui le fasi in questo ordine. Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere la tua risposta se serve un input. Riprodurre eventi e riconciliare scritture incerte.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Persistire intento, messaggio e UUID"
          },
          {
            "title": "Acquisire turno, salvare tool e risultati"
          },
          {
            "title": "Attendere la tua risposta se serve un input"
          },
          {
            "title": "Riprodurre eventi e riconciliare scritture incerte"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/numo-mcp-connections-workflow.png",
      "alt": "Impostazioni MCP personali, elenco vuoto e pulsante per aggiungere un server.",
      "caption": "Le connessioni di Numo sono personali; le routine usano quelle del proprietario del progetto.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/numo-mcp-connections-config-workflow.png",
      "alt": "Procedura di collegamento a Notion con il metodo di accesso noto dal catalogo.",
      "caption": "Passaggio di accesso di un servizio del catalogo. Non sono state inserite credenziali né contattati server.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        560,
        354
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

Numo usa il contesto della conversazione e i permessi del tuo account. Inizia con una richiesta circoscritta e verifica il risultato. Le routine usano connessioni e budget del proprietario. Se un turno resta in attesa o fallisce, controlla lo stato salvato prima di ripetere la richiesta.

## Completare un’attività del progetto con Numo {#work-with-numo}

Apri il ticket o il progetto interessato e usa il pulsante flottante di Numo. La pagina corrente diventa il contesto. Le azioni contestuali che affidano lavoro a Numo aprono lo stesso pannello. Servono accesso al progetto e budget IA disponibile oppure una chiave personale compatibile.

1. Controlla il contesto nell’area di scrittura. Specifica il ticket quando sono coinvolti più elementi. Per aggiungere un ticket come contesto, digita `@` nell’area di scrittura o usa **Aggiungi contesto**, che raggruppa il contesto nelle stesse sezioni del menu `@`, i ticket sotto **Ticket** e i tuoi server MCP collegati sotto **Server MCP**; una descrizione mostra anche ticket trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**.
2. Su minddy Cloud, Numo usa il modello e il livello di ragionamento scelti dall’amministrazione della tua istanza, come Smart Fill e Smart Assign, e il composer non mostra alcun controllo del modello. Con una chiave personale per Numo, il logo del fornitore accanto al microfono sceglie fornitore, modello e livello di ragionamento della conversazione; passandoci sopra vedi il modello attuale. Se il modello non offre il controllo del ragionamento, il cursore resta su **Nessun ragionamento**; su un modello che ragiona sempre, **Nessun ragionamento** usa il suo livello più leggero. Lo stesso logo riporta la conversazione su **minddy Cloud**.
3. Invia una richiesta circoscritta, per esempio: «Leggi questo ticket e proponi criteri di accettazione. Non modificarne lo stato».
4. Leggi la risposta e apri i collegamenti ai ticket o alle fonti. Se hai chiesto una modifica, verifica l’oggetto aggiornato. Ticket, obiettivi, progetti, pagine e membri trovati da Numo compaiono nella risposta come menzioni a pillola: ognuna apre il proprio elemento, e una che non puoi vedere appare come **Non disponibile**. Numo scrive queste menzioni anche in ciò che redige, come descrizioni e piani dei ticket, descrizioni degli obiettivi, commenti, pagine e taccuino, solo per gli elementi che ha identificato; un membro menzionato lì riceve una notifica come per qualsiasi menzione.

In una conversazione nuova e vuota, quattro righe di suggerimenti sopra il campo di scrittura propongono richieste adatte alla pagina corrente, per esempio **Riassumere questo ticket** o **Scrivere un piano di implementazione** quando un ticket è aperto nel pannello laterale. Scegliere una riga compila il campo senza inviarlo, così puoi prima modificare la richiesta. Le righe scompaiono non appena il campo contiene del testo e tornano quando lo svuoti. Compaiono nel layout desktop, non su un telefono. Il campo di scrittura in fondo alla **Home** mostra le stesse righe, con suggerimenti come **Scegliere su cosa concentrarmi oggi** o **Trovare ciò che è in ritardo**. La **Home** è essa stessa una conversazione con Numo, uguale al pannello senza la sua intestazione: ogni visita ne apre una nuova, a meno che una risposta sia ancora in corso, ed è separata da quella aperta nel pannello; quella precedente resta nella cronologia, e il pulsante **Nuova conversazione** in alto a destra ne avvia un'altra. Quando Numo ha scritto il suo riepilogo, le righe della **Home** sono i suggerimenti scritti con esso ([il riepilogo di Numo nella Home](#home-word)).

Nella **Home**, e nel pannello di Numo quando è ingrandito o ha il focus, puoi iniziare a scrivere senza fare clic sul campo di scrittura: una rapida raffica di tasti digitata fuori da un campo di testo finisce nel campo di scrittura, che prende il focus. Un singolo tasto esegue ancora la sua scorciatoia da tastiera, per esempio C per creare un ticket, circa 0,2 secondi dopo su quelle schermate. G seguito da un tasto resta una sequenza di navigazione; un terzo tasto nella raffica la trasforma in testo.

Per chiedere a Numo di un passaggio, selezionalo in un editor, come una pagina o la descrizione di un ticket, poi scegli **Chiedi a Numo** nella barra degli strumenti di selezione, su computer. Il pannello si apre senza inviare nulla: accanto alla pagina o al ticket da cui proviene, il passaggio compare come una pillola di contesto con le sue prime parole, e passando il cursore sulla pillola vedi il passaggio intero. Scrivi la tua domanda, per esempio «Riscrivilo in modo più conciso» o «Crea dei ticket da questo», e inviala. Il passaggio accompagna solo quel messaggio. Per escluderlo, rimuovi la sua pillola con la sua croce.

Numo può anche guardare le immagini nella descrizione di un ticket o di un obiettivo, in un piano, in un commento, in una pagina o nel tuo taccuino quando il modello della conversazione accetta immagini. Senza questa capacità, Numo dice di non aver potuto vedere l’immagine invece di descriverla.

Numo può anche scrivere un file da scaricare: un report o un documento in PDF, un’esportazione in CSV, oppure un file di testo, Markdown, HTML, JSON, XML, SVG o di calendario. Chiedilo nella tua richiesta; Numo può costruirlo a partire dai file che hai aggiunto alla conversazione. Il file compare come scheda sotto la sua risposta: selezionando la scheda si apre l’anteprima quando il formato lo consente, **Scarica** lo salva e il menu accanto offre **Anteprima** e **Copia il contenuto**. Il file resta nello spazio privato della tua conversazione; per condividerlo con il progetto, chiedi a Numo di allegarlo a un ticket, a un obiettivo o a un commento che vi pubblica. Un PDF usa i font standard: i caratteri fuori dagli alfabeti dell’Europa occidentale e le emoji non compaiono.

Se incolli nel composer un testo di oltre 12.000 caratteri, ad esempio dei log, viene allegato al tuo messaggio come **Testo incollato** invece di riempire il composer. Numo legge tutto il file prima di basarsi su di esso, quindi un CSV ricavato dai tuoi log include ogni riga. Un messaggio lungo che arriva a Numo per un’altra via viene allegato allo stesso modo: il messaggio conserva le prime righe e indica il file.

Quando chiedi qualcosa da tenere sotto controllo, o un elenco di elementi con campi in comune, come candidature con azienda, stato e data, Numo crea un [database](/docs/databases) con quelle colonne e le prime voci invece di una pagina.

Con una chiave personale, il modello predefinito di Numo si configura in **Impostazioni account → IA → Numo → Conversazioni**, salvato per quel fornitore: il valore dell’app o un modello a tua scelta. La scelta propria di una conversazione ha la precedenza. Su minddy Cloud non c’è un modello da scegliere. Consulta [le impostazioni IA e l’utilizzo](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.](/documentation/it/work-with-numo-workflow.png)

### Continuare una conversazione {#continue}

L’elenco conserva le conversazioni precedenti. Continua quella che contiene le decisioni utili. Numo organizza e segue il lavoro: legge e aggiorna ticket, piani, pagine e altri contenuti minddy, e può leggere le pull request collegate. Su tua richiesta può anche commentare una pull request, risolvere le conversazioni di revisione già gestite ed eseguirne l’unione. Quando Numo cerca ticket, le corrispondenze testuali e gli identificativi esatti vengono per primi; una ricerca descrittiva può aggiungere ticket dello stesso progetto trovati per significato, che Numo deve verificare prima di farvi affidamento. Non scrive codice e non esegue push di commit. Per far scrivere il codice, copia il prompt del ticket per il tuo agente di codice; consulta [Lavoro sul codice e pull request](/docs/code-work#external-coding-agents).

Quando una conversazione diventa troppo lunga per essere rinviata a basso costo, circa 90.000 token o tre quarti di ciò che il modello può leggere se è meno, Numo la compatta prima della chiamata successiva: la risposta mostra **Compattazione del contesto…**, poi **Contesto compattato**. Numo riassume i messaggi e i risultati degli strumenti meno recenti e conserva alla lettera il tuo ultimo messaggio e gli ultimi scambi; le risposte successive ripartono da quel riassunto. Il riassunto conta nell’utilizzo IA come il resto della risposta. Se non riesce, il passaggio indica **Impossibile compattare il contesto** e Numo risponde con l’intera conversazione.

Se Numo richiede informazioni, invia la scelta prima di attendere il proseguimento delle attività dipendenti. Una scheda di consumo o errore spiega l’interruzione. Verifica ogni scrittura esterna prima di chiedere di ripeterla.

## Capire i permessi di Numo {#numo-permissions-and-approvals}

Numo agisce entro i diritti e il ruolo dell’utente corrente. Una richiesta in chat non concede a un membro le impostazioni riservate al proprietario. Il Numo di un lettore, in chat o tramite `@Numo` in un commento che può pubblicare, usa solo strumenti di lettura e viene addebitato al lettore. Il proprietario gestisce membri, integrazioni, repository e impostazioni dei feedback. Le preferenze personali appartengono all’account corrente.

Numo può modificare le preferenze del tuo account, nascondere o mostrare di nuovo i progetti per te e, quando un progetto è tuo, le sue impostazioni, i membri e i loro ruoli. Alcune azioni restano tue: le chiavi dei fornitori e i modelli di IA, le connessioni Git, l’accesso, il secondo fattore e le app collegate, l’avatar e l’icona del progetto, il trasferimento della proprietà, l’esportazione dei dati e l’eliminazione dell’account.

### Autorizzare l’azione {#authorization}

Specifica modifica e ambito. Leggere una richiesta non autorizza una risposta pubblica: Numo risponde pubblicamente ai feedback solo su richiesta esplicita. Istruzioni o risultati di un MCP remoto non autorizzano altre azioni. Collega solo servizi a cui affidi le informazioni e le azioni previste.

Una richiesta può raggiungere un fornitore esterno. Disabilitare la connessione impedisce nuove chiamate, ma non ritira quelle inviate. Controlla una scrittura scaduta presso il destinatario prima di ripeterla.

### Contesto personale e pianificato {#context}

Le conversazioni non usano le connessioni MCP personali di altri membri. Le routine usano connessioni e budget del proprietario. Dopo un trasferimento della proprietà, le routine dell’ex proprietario nel progetto vengono sospese; il nuovo proprietario crea le routine che devono proseguire. Un’esecuzione precedente non può continuare a usare le credenziali dell’ex proprietario. Numo viene eseguito sul server: non legge i file del tuo computer e non usa le tue sessioni personali.

Numo può lasciare un messaggio nella tua Posta in arrivo, con un avviso push, quando una routine trova qualcosa che richiede la tua attenzione o quando gli chiedi di avvisarti più tardi. Il messaggio arriva solo all’account per cui Numo lavora, che in una routine è il suo proprietario. L’interruttore Messaggi di Numo nelle [preferenze di notifica](/docs/notifications-and-inbox#notification-preferences) disattiva questi messaggi.

![Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.](/documentation/it/numo-permissions-and-approvals-workflow.svg)

### Memoria di Numo {#memory}

Numo conserva brevi ricordi su di te, così non devi ripeterti: una preferenza come «scrivi i titoli dei miei ticket in inglese», un fatto come «il progetto Mobile è in pausa fino a gennaio» o un'istruzione permanente. Ne salva uno quando glielo chiedi («ricorda che…») o quando esprimi una preferenza che chiaramente vuoi applicata la prossima volta, e lo dice nella risposta. Da quel momento i tuoi ricordi valgono in ogni conversazione.

Un ricordo vale per tutti i tuoi progetti o per uno solo; quando non sa quale, Numo te lo chiede. Un ricordo di progetto viene usato nelle conversazioni di quel progetto e quando Numo lavora su quel progetto da un'altra conversazione. I tuoi ricordi sono solo tuoi: gli altri membri non li vedono e il loro Numo non li usa. Le routine e `@Numo` in un commento leggono i tuoi ricordi, ma non possono modificarli. Puoi conservare fino a 100 ricordi di 1.000 caratteri ciascuno; al limite, Numo ti chiede quale sostituire.

Numo può anche cercare nelle tue conversazioni precedenti con lui. Quando ti riferisci a qualcosa di già detto che non è né nella conversazione attuale né nei tuoi ricordi («come abbiamo deciso la settimana scorsa», «trova la conversazione sui prezzi»), cerca in ciò che hai scritto e in ciò che ha risposto, legge la conversazione che corrisponde e ti dice a quale si riferisce. Cerca solo nelle tue conversazioni, comprese quelle archiviate: le 100 attive più di recente, o quelle di un periodo che indichi. Ciò che hanno restituito i suoi strumenti non viene cercato. Le routine, `@Numo` in un commento e Numo in background non cercano nelle tue conversazioni, e le loro conversazioni non vengono cercate.

**Impostazioni account → Numo → Ricordi** elenca ogni ricordo con il progetto a cui si applica. **Modifica** cambia il testo, **Elimina** lo rimuove e **Dimentica tutto** li rimuove tutti; un'eliminazione non si può annullare. Puoi anche chiedere a Numo di dimenticare qualcosa. **Memoria di Numo**, nel riquadro **Numo** qui sopra, disattiva la memoria: Numo non legge né salva ricordi e non cerca nelle tue conversazioni precedenti; i ricordi salvati vengono conservati.

### Diario di Numo {#journal}

Numo tiene un diario di ciò che ti aspetta e di ciò che ha fatto per te mentre non guardavi: «la PR #12 aspetta la tua revisione da 3 giorni», «ho fatto la ricerca web richiesta in MIN-42». Scrive una voce quando gli chiedi di tenere traccia di qualcosa («annota che aspetto la risposta del cliente») e, in una routine o in un commento `@Numo`, quando modifica i tuoi contenuti. Chiude la voce quando la questione è risolta. La conversazione mostra allora **Annotato nel diario** o **Voce del diario chiusa**. Il diario è solo tuo, non invia notifiche e le voci chiuse vengono eliminate entro 180 giorni. La **Home** lo riassume ([il riepilogo di Numo nella Home](#home-word)); per vedere ogni voce, chiedila a Numo in una conversazione, o chiedigli di chiuderne una.

### Il riepilogo di Numo nella Home {#home-word}

Quando la **Home** apre la sua nuova conversazione, Numo scrive per primo, sotto il saluto: poche frasi che riassumono il suo diario, con prima ciò che ti aspetta, poi ciò che ha fatto e che riguarda i tuoi contenuti, poi ciò che si offre di fare da solo. Gli elementi che cita, come un ticket o una pagina, si aprono con un clic. Quando Numo ha preparato qualcosa per te, come un riepilogo dei tuoi progetti o una ricerca, il riepilogo ne riporta l'essenziale e le cifre invece di rimandarti a una conversazione. Numo riscrive il riepilogo in background dopo ogni turno che scrive o chiude una voce del diario, quindi è aggiornato prima che tu apra la **Home**, e aprire la pagina non chiama l'IA. Se nel frattempo una voce che copre viene risolta, la **Home** nasconde il riepilogo finché Numo non ha scritto il successivo. Mostrare il riepilogo segna come viste le voci che copre: un riepilogo successivo tralascia ciò che è stato risolto e torna a citare solo ciò che ti aspetta ancora. Quando il tuo budget IA sta per esaurirsi prima del rinnovo, il riepilogo comincia da lì: il giorno in cui si esaurirà al ritmo attuale e la quota già consumata, in percentuale. Quando nel diario non c'è nulla di aperto o non visto e il budget basta, non c'è riepilogo.

Quando non c'è riepilogo, Numo si presenta al suo posto sotto il saluto: un breve messaggio che ti nomina, cita il primo progetto in cui puoi creare ticket e dice cosa Numo può farci. Senza un progetto del genere, dice cosa farà Numo appena ne avrai uno. Un pannello di Numo vuoto si apre con la stessa presentazione. minddy la scrive senza chiamare l'IA e non la salva mai: scompare quando invii il primo messaggio, e il riepilogo la sostituisce appena Numo ne scrive uno.

Appena scrivi, il saluto e il riepilogo restano in cima alla conversazione che inizi sotto di essi nella **Home**, il riepilogo come primo messaggio di Numo; senza riepilogo, la conversazione inizia con il tuo messaggio. Viene salvato come primo messaggio di Numo in quella conversazione: Numo lo legge quando risponde, come seguito di ciò che ha detto, e anche il pannello e la cronologia lo mostrano. Sopra il campo di scrittura, fino a quattro suggerimenti scritti con il riepilogo sostituiscono le righe abituali, o nessuno quando niente di preciso è adatto. Servono anche come risposte rapide, per esempio **Sì, fallo da solo d'ora in poi**, e ciascuno è una richiesta completa. Sceglierne uno compila il campo senza inviarlo. Con Numo in background disattivato, la **Home** si apre con il saluto, la presentazione di Numo e le righe abituali, senza riepilogo. Su un'istanza senza IA non c'è conversazione: la **Home** mostra il saluto e gli avvisi del tuo account, come gli inviti in sospeso o l'app desktop.

### Numo in background {#background}

**Impostazioni account → Numo → Numo in background** è attivo per impostazione predefinita: Numo lavora per te mentre sei via. Quando nei tuoi progetti succede qualcosa che ti riguarda, come un ticket assegnato a te, una menzione o una routine fallita, o che corrisponde a ciò che uno dei tuoi ricordi gli chiede di tenere d'occhio, Numo si risveglia qualche minuto dopo e agisce con gli stessi strumenti e lo stesso modello di una conversazione. Con il ricordo «per ogni nuovo ticket di MIN che richiede una ricerca web, falla e pubblica il risultato come commento», fa la ricerca su ogni nuovo ticket, pubblica il commento e lo annota nel suo diario, dove scrive cosa ha fatto e cosa ti aspetta. La **Home** riassume cosa ha annotato. L'interruttore richiede la memoria di Numo: finché la memoria è disattivata, anche Numo in background lo è, e torna attivo con lei.

In un progetto condiviso, Numo modifica solo ciò che è tuo: i ticket assegnati a te o creati da te, gli obiettivi che guidi, le pagine che hai creato. Creare contenuti lì, o modificare altro, richiede un ricordo che lo chieda. In tutti i progetti, anche in quelli in cui lavori da solo, non sposta nulla nel Cestino e non ripristina nulla, non agisce su nessuna pull request, non chiama strumenti MCP esterni, non amministra il progetto (impostazioni, membri, integrazioni), non modifica le impostazioni del tuo account e non risponde pubblicamente ai feedback, a meno che uno dei tuoi ricordi non consenta quell'azione. Il server verifica che il ricordo esista, sia tuo e valga per il progetto toccato dall'azione. Numo ti lascia un messaggio nella Posta in arrivo solo quando un ricordo lo chiede, o per qualcosa di urgente, e in quel caso al massimo due volte in 24 ore.

Se sei amministratore dell'istanza e hai attivato l'autenticazione a due fattori, Numo in background può anche [amministrare l'istanza](/docs/instance-administration#numo). Legge da solo la configurazione dei modelli IA e i costi IA, quindi puoi dargli un ricordo come «tieni d'occhio i modelli IA configurati sull'istanza e avvisami quando ne basta uno più economico». Modificare o importare la configurazione dei modelli, cercare un account o cambiarne il piano richiede un ricordo che consenta quell'azione; senza, Numo chiede nel suo diario e la **Home** mostra la domanda. Il tuo account viene verificato prima di ognuna di queste azioni: appena perde il ruolo di amministratore o l'autenticazione a due fattori, Numo li perde a sua volta.

Quando un'azione richiede un permesso che non ha, Numo lo chiede nel suo diario e si offre di farla da solo la prossima volta. Per consentirla, dillo a Numo in una conversazione, per esempio «sì, fallo sempre»: salva un ricordo e lo usa al risveglio successivo. Per limitare Numo, dagli un ricordo come «nel progetto Design, annota solo nel diario», modifica o elimina il ricordo che consentiva un'azione, oppure disattiva l'interruttore: un risveglio non ancora iniziato viene annullato, e uno già in corso arriva alla fine. L'analisi dei tuoi eventi, ogni risveglio e il riepilogo di Numo nella **Home** contano nel tuo utilizzo dell'IA, e un amministratore stabilisce quanti risvegli riceve ogni membro in 24 ore, 20 per impostazione predefinita. Ogni risveglio si svolge in una conversazione a parte, che non compare nell'elenco delle tue conversazioni e viene eliminata dopo 30 giorni.

### Promemoria di Numo {#reminders}

Chiedi a Numo in una conversazione di pensare a qualcosa per te più avanti: «quando MIN-42 è completato, ricordami di avvisare il cliente», «quando l'obiettivo 0.40 è completato, crea il ticket del rilascio» o «ricordami venerdì alle 9:00 di inviare la fattura». Numo crea un promemoria su un ticket (uno stato, o un commento di un'altra persona), un obiettivo (uno stato) o una data, e la conversazione mostra **Promemoria creato**. Finché la condizione non si verifica, non viene eseguito nulla e nulla conta nel tuo utilizzo dell'IA: minddy la controlla ogni cinque minuti.

Quando la condizione si verifica, il promemoria scatta una sola volta. Per qualcosa che farai tu, ricevi un messaggio di Numo nella Posta in arrivo con la tua istruzione. Per qualcosa che hai chiesto a Numo, il messaggio dice che Numo se ne sta occupando, e Numo esegue l'istruzione nella conversazione in cui hai creato il promemoria (in una nuova se quella è stata eliminata o è occupata), con gli strumenti e i permessi che hai in quel momento; quel turno conta nel tuo utilizzo dell'IA. Nessuno segue quel turno: Numo non fa domande, non modifica la sua memoria e non sposta nulla nel cestino, non fa merge e non amministra nulla; nella risposta dice cosa ha lasciato a te. Se hai raggiunto il limite di utilizzo, o se il turno non va a buon fine, ricevi un messaggio e Numo non agisce. Con **Messaggi di Numo** disattivato non arriva nessun messaggio. Quando Numo ha modificato qualcosa con un promemoria, per esempio un ticket, una pagina o un commento, annota nel suo diario cosa ha fatto, e [il riepilogo di Numo nella Home](#home-word) te lo racconta. Un promemoria che ti invia solo un messaggio non compare lì.

Un promemoria la cui condizione non si verifica mai scade dopo 90 giorni, e puoi averne 20 alla volta. Finché il suo ticket o obiettivo è nel cestino, il promemoria aspetta; viene annullato quando l'elemento è eliminato definitivamente o quando perdi l'accesso al suo progetto.

Un promemoria singolo scatta una volta, per un ticket, un obiettivo o una data; per qualcosa che ritorna, crea un [promemoria ricorrente](#recurring-reminders). Solo tu crei un promemoria, in una conversazione con Numo: le routine, le menzioni `@Numo`, Numo in background e l'esecuzione di un promemoria non possono crearne, modificarne né annullarne. **Impostazioni account → Numo → Promemoria** elenca i promemoria che conservi, e **Annulla promemoria** ne rimuove uno. Per modificarne uno, chiedilo a Numo.

### Promemoria ricorrenti {#recurring-reminders}

Un promemoria può anche tornare a cadenza regolare: «ogni sera alle 19:00, fai il punto sui miei ticket e prepara la giornata di domani», oppure «ogni lunedì alle 9:00, controlla i costi dei modelli e avvisami se sfuggono di mano». Numo lo imposta per ogni giorno, dal lunedì al venerdì, un giorno alla settimana o un giorno al mese, a un'ora del tuo fuso orario, che mantiene al cambio dell'ora. Un mese più corto del giorno scelto usa il suo ultimo giorno. Un promemoria ricorrente non scade, e puoi averne 5 attivi tra i tuoi 20.

A ogni esecuzione, Numo esegue l'istruzione in una nuova conversazione, che prende il nome dal promemoria e dal giorno, con gli strumenti e i permessi che hai in quel momento; quell'esecuzione conta nel tuo utilizzo dell'IA. Nessuno la segue: Numo non fa domande, non modifica la sua memoria e rispetta i limiti di [Numo in background](#background): in un progetto condiviso modifica solo ciò che è tuo, e non compie nessuna azione sensibile. I tuoi ricordi non tolgono questi limiti qui; lo fanno solo i permessi del promemoria. Numo annota il risultato nel suo diario, e [il riepilogo di Numo nella Home](#home-word) te lo riporta. Nessun messaggio annuncia ogni esecuzione.

Perché un promemoria ricorrente possa fare di più, chiedilo quando lo crei. Può essere autorizzato a inviarti notifiche anche non urgenti, modificare contenuti non tuoi in un progetto condiviso, agire sulle pull request, chiamare i tuoi strumenti MCP esterni, rispondere pubblicamente ai feedback, usare il Cestino, rimuovere membri, inviti e integrazioni, modificare le impostazioni del tuo account, oppure amministrare i tuoi progetti e, per un amministratore, l'istanza. In quel caso Numo non salva nulla da solo: la conversazione mostra una scheda che elenca ciò che il promemoria potrà fare, e **Consenti e crea** lo salva. I tuoi permessi vengono verificati di nuovo a ogni esecuzione: un promemoria autorizzato ad amministrare l'istanza non riceve nessuno strumento di amministrazione quando il tuo account non è più amministratore, e un promemoria viene annullato quando perdi l'accesso al suo progetto. Numo non può aggiungere un permesso a un promemoria né riformularne uno che ha dei permessi: propone una sostituzione, che confermi su una nuova scheda.

Un'esecuzione che minddy ha mancato di oltre sei ore viene saltata. Quando un'esecuzione non viene completata, o hai raggiunto il limite di utilizzo, ricevi un messaggio. Dopo 3 esecuzioni di fila non completate, il promemoria viene messo in pausa e un messaggio te lo dice. **Impostazioni account → Numo → Promemoria** mostra, per ogni promemoria ricorrente, la sua cadenza, la prossima esecuzione, ciò che può fare e l'ultima esecuzione, con un link a quella conversazione. **Metti in pausa il promemoria** lo ferma e **Riprendi promemoria** lo riavvia alla prossima esecuzione.

Un promemoria ricorrente è tuo; una routine appartiene a un progetto. Solo tu vedi il tuo promemoria e le sue conversazioni, viene eseguito con i tuoi permessi e sul tuo utilizzo dell'IA, e può avere dei permessi propri. Tutti i membri del progetto vedono una routine e le sue esecuzioni, viene eseguita sull'utilizzo e sulle connessioni del proprietario del progetto, può partire anche da un evento, e non arriva mai all'amministrazione dell'istanza. Usa un promemoria ricorrente per le tue abitudini e una routine per il lavoro che il team condivide.

## Comprendere i turni persistenti di Numo {#numo-execution-model}

Messaggi interattivi, azioni contestuali e routine entrano nelle conversazioni Numo. Con una chiave personale, modello e ragionamento della conversazione si scelgono nel composer; su minddy Cloud li stabilisce l’istanza. Numo agisce tramite i suoi strumenti minddy e le eventuali connessioni MCP personali che hai aggiunto; non ha bisogno di un repository. Una routine crea una nuova conversazione con istruzioni salvate e contesto di proprietario e progetto. Non serve mantenere il desktop online.

![Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere la tua risposta se serve un input. Riprodurre eventi e riconciliare scritture incerte.](/documentation/it/numo-execution-model-flow.svg)

### Separare esecuzione e visualizzazione {#state}

L’intenzione viene registrata in un turno duraturo con UUID e messaggio. Il turno passa da `queued` a `running`, quindi a `completed` o `waiting_input`. `stopping` e `stopped` indicano un arresto; `retryable` e `failed` indicano un errore. Il flusso SSE mostra l’attività, ma non governa l’esecuzione. Dopo una riconnessione, il client legge gli eventi successivi alla sequenza già ricevuta. Notifiche duplicate o tardive non avviano altro lavoro. Il contesto non concede accesso: gli oggetti privati rimangono privati.

### Gestire modifiche incerte {#mutations}

Prima di una modifica, il sistema registra l’operazione e il relativo checkpoint; riutilizza i risultati già completati. Una lettura interrotta può essere ripetuta, mentre una modifica con esito incerto entra in `reconciling` senza un nuovo tentativo automatico. Controlla la destinazione prima di scrivere ancora. Le routine rispettano proprietà, budget e protezioni di costo; un altro membro non eredita la precedente connessione MCP personale.

Arrestare Numo termina il suo turno. Un’azione esterna già inviata può comunque terminare. Una conversazione che attendeva lavoro sul codice di una versione precedente viene arrestata automaticamente e torna inattiva.

## Collegare un servizio MCP personale a Numo {#numo-mcp-connections}

Nelle impostazioni dell’account, apri **MCP** e usa il riquadro **MCP per Numo**. I link alla vecchia scheda MCP per Numo portano lì. Scegli un servizio o aggiungi un server MCP HTTPS pubblico. Catalogo e registro non aggirano registrazioni o approvazioni del fornitore. Numo può preparare una connessione in una conversazione interattiva, ma non in una routine autonoma.

Il collegamento avviene in una procedura guidata. Un server personalizzato o trovato nel registro chiede prima nome e indirizzo HTTPS; un servizio del catalogo si apre direttamente sul passaggio di accesso. Un servizio del catalogo, una connessione salvata o una voce del registro che dichiara un token conosce già il proprio metodo di accesso: il passaggio lo mostra e **Usa un altro metodo** permette di cambiarlo. Altrimenti scegli **Accedi con OAuth**, **Token Bearer** o **Nessuna autenticazione**. Le **Impostazioni avanzate** contengono il trasporto (Streamable HTTP predefinito, supportato anche SSE precedente) e gli header cifrati. Inserisci segreti nelle credenziali o negli header, mai nell’URL. Comandi locali e reti private non sono supportati. Per un’app OAuth esistente, registra l’URL di callback mostrato e inserisci ID e segreto. Dopo il salvataggio, l’ultimo passaggio attende l’accesso, poi verifica la connessione e mostra quanti strumenti ha trovato Numo. Su desktop, nel browser di sistema si apre solo la pagina di accesso del fornitore: lì non serve aver effettuato l’accesso a minddy, e l’app completa la connessione al tuo ritorno.

![Impostazioni MCP personali, elenco vuoto e pulsante per aggiungere un server.](/documentation/it/numo-mcp-connections-workflow.png)

### Verificare e gestire {#manage}

Il menu consente test, modifica, riconnessione, disabilitazione e rimozione. Un avviso arancione richiede la riconnessione. Campi credenziali vuoti conservano i valori; cambiare URL elimina credenziali e header. Rimuovi il token bearer con il controllo dedicato; `{}` cancella gli header.

Disabilitare blocca nuove chiamate, non quelle inviate. Limiti: 30 secondi, 1 MiB di trasporto e 64 KB di risultato. Verifica scritture scadute sul destinatario prima di ripetere. Le routine usano connessioni del proprietario, senza prestarle agli altri membri.

![Procedura di collegamento a Notion con il metodo di accesso noto dal catalogo.](/documentation/it/numo-mcp-connections-config-workflow.png)

## Riprendere il lavoro Numo interrotto o in attesa {#recover-numo-work}

Torna alla conversazione esistente e leggi gli ultimi messaggi e le schede. Distingui richieste di informazioni, limite dell’account, tetto della routine ed errore tecnico. Chiudere il pannello non dimostra che il lavoro si sia fermato.

Se la connessione a minddy si interrompe prima che Numo risponda, per esempio quando l’app sul telefono passa in background, la conversazione mostra una scheda di connessione. Appena torni online o nell’app, minddy controlla se il tuo messaggio è arrivato. Se è arrivato, il lavoro di Numo riprende o compare la sua risposta. Altrimenti il messaggio esce dalla conversazione e **Invia di nuovo** lo rimanda. **Riprova** controlla subito.

In una scheda attiva, rispondi a tutte le domande richieste e invia il gruppo. Le schede precedenti sono registrazioni senza possibilità di inviare una nuova risposta. Saltare non fornisce le informazioni mancanti né autorizza modifiche dipendenti.

### Budget ed errori {#recovery}

La scheda del limite dell’account mostra la data di ripristino del limite, quando è nota, e può proporre piano o chiave personale. Quella della routine apre la gestione: verifica il tetto per esecuzione. Più conversazioni possono essere eseguite contemporaneamente e condividono il budget dell’account. Ripetere la richiesta non elimina il limite.

La ripresa da checkpoint è possibile solo se questo è stato conservato. Verifica modifiche ai ticket, pagine e servizi esterni prima di ripetere: una scrittura può riuscire anche se la risposta si perde. Descrivi ciò che resta e chiedi di continuare. Senza checkpoint recuperabile, passa lo stato verificato a una nuova richiesta. Segnala errori persistenti indicando la conversazione, senza credenziali.

## Scegliere un obiettivo per un feedback {#feedback-objectives}

Gli obiettivi dei feedback richiedono una scelta esplicita. Chiedi a Numo di collegare una richiesta a un obiettivo del progetto o rimuovere il collegamento; Numo risolve richiesta e obiettivo prima della modifica. Una revisione o categorizzazione generale non autorizza l’assegnazione di obiettivi. Un’integrazione può fornire l’obiettivo scelto dal proprietario. La conversione eredita obiettivo e categorie; senza una scelta, l’obiettivo resta vuoto.
