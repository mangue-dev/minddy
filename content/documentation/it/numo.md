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
  "revision": 21,
  "sourceRevision": 20,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-25",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx"
    ]
  },
  "review": {
    "revision": 21,
    "fact": "agent:MIN-793 (Numo writes downloadable files: added passage checked against lib/server/assistant/tools.ts, conversation-attachments.ts, markdown-pdf.ts and components/assistant/generated-file-cards.tsx; no figure recaptured; earlier evidence retained in git history)",
    "language": "agent:MIN-793 (it translation of the added passage with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-25"
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 21,
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
      "revision": 21,
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 21,
      "reviewed": true,
      "capturedAt": "2026-10-21",
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

1. Controlla il contesto nell’area di scrittura. Specifica il ticket quando sono coinvolti più elementi. Per aggiungere un ticket come contesto, digita `@` nell’area di scrittura o usa **Aggiungi contesto** → **Ticket**; una descrizione mostra anche ticket trovati [per significato](/docs/navigation#search-by-meaning) sotto **Correlati per significato**.
2. Scegli modello e livello di ragionamento della conversazione. Queste scelte valgono per la conversazione.
3. Invia una richiesta circoscritta, per esempio: «Leggi questo ticket e proponi criteri di accettazione. Non modificarne lo stato».
4. Leggi la risposta e apri i collegamenti ai ticket o alle fonti. Se hai chiesto una modifica, verifica l’oggetto aggiornato.

In una conversazione nuova e vuota, quattro righe di suggerimenti sopra il campo di scrittura propongono richieste adatte alla pagina corrente, per esempio **Riassumere questo ticket** o **Scrivere un piano di implementazione** quando un ticket è aperto nel pannello laterale. Scegliere una riga compila il campo senza inviarlo, così puoi prima modificare la richiesta. Le righe scompaiono non appena il campo contiene del testo e tornano quando lo svuoti. Compaiono nel layout desktop, non su un telefono.

Numo può anche guardare le immagini nella descrizione di un ticket o di un obiettivo, in un piano, in un commento, in una pagina o nel tuo taccuino quando il modello della conversazione accetta immagini. Senza questa capacità, Numo dice di non aver potuto vedere l’immagine invece di descriverla.

Numo può anche scrivere un file da scaricare: un report o un documento in PDF, un’esportazione in CSV, oppure un file di testo, Markdown, HTML, JSON, XML, SVG o di calendario. Chiedilo nella tua richiesta; Numo può costruirlo a partire dai file che hai aggiunto alla conversazione. Il file compare come scheda sotto la sua risposta: selezionando la scheda si apre l’anteprima quando il formato lo consente, **Scarica** lo salva e il menu accanto offre **Anteprima** e **Copia il contenuto**. Il file resta nello spazio privato della tua conversazione; per condividerlo con il progetto, chiedi a Numo di allegarlo a un ticket, a un obiettivo o a un commento che vi pubblica. Un PDF usa i font standard: i caratteri fuori dagli alfabeti dell’Europa occidentale e le emoji non compaiono.

Il modello predefinito di Numo si configura in **Impostazioni account → IA e Numo → Modello predefinito di Numo**: il valore dell’app o un modello personale del fornitore attivo. Una scelta esplicita nella conversazione ha la precedenza. Consulta [le impostazioni IA e l’utilizzo](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.](/documentation/it/work-with-numo-workflow.png)

### Continuare una conversazione {#continue}

L’elenco conserva le conversazioni precedenti. Continua quella che contiene le decisioni utili. Numo organizza e segue il lavoro: legge e aggiorna ticket, piani, pagine e altri contenuti Minddy, e può leggere le pull request collegate. Su tua richiesta può anche commentare una pull request, risolvere le conversazioni di revisione già gestite ed eseguirne l’unione. Quando Numo cerca ticket, le corrispondenze testuali e gli identificativi esatti vengono per primi; una ricerca descrittiva può aggiungere ticket dello stesso progetto trovati per significato, che Numo deve verificare prima di farvi affidamento. Non scrive codice e non esegue push di commit. Per far scrivere il codice, copia il prompt del ticket per il tuo agente di codice; consulta [Lavoro sul codice e pull request](/docs/code-work#external-coding-agents).

Se Numo richiede informazioni, invia la scelta prima di attendere il proseguimento delle attività dipendenti. Una scheda di consumo o errore spiega l’interruzione. Verifica ogni scrittura esterna prima di chiedere di ripeterla.

## Capire i permessi di Numo {#numo-permissions-and-approvals}

Numo agisce entro i diritti e il ruolo dell’utente corrente. Una richiesta in chat non concede a un membro le impostazioni riservate al proprietario. Il Numo di un lettore, in chat o tramite `@Numo` in un commento che può pubblicare, usa solo strumenti di lettura e viene addebitato al lettore. Il proprietario gestisce membri, integrazioni, repository e impostazioni dei feedback. Le preferenze personali appartengono all’account corrente.

Numo può modificare le preferenze supportate e le impostazioni del progetto autorizzate al proprietario. Credenziali dei fornitori, connessioni Git, secondo fattore e file dell’avatar restano da configurare personalmente.

### Autorizzare l’azione {#authorization}

Specifica modifica e ambito. Leggere una richiesta non autorizza una risposta pubblica: Numo risponde pubblicamente ai feedback solo su richiesta esplicita. Istruzioni o risultati di un MCP remoto non autorizzano altre azioni. Collega solo servizi a cui affidi le informazioni e le azioni previste.

Una richiesta può raggiungere un fornitore esterno. Disabilitare la connessione impedisce nuove chiamate, ma non ritira quelle inviate. Controlla una scrittura scaduta presso il destinatario prima di ripeterla.

### Contesto personale e pianificato {#context}

Le conversazioni non usano le connessioni MCP personali di altri membri. Le routine usano connessioni e budget del proprietario. Dopo un trasferimento della proprietà, le routine dell’ex proprietario nel progetto vengono sospese; il nuovo proprietario crea le routine che devono proseguire. Un’esecuzione precedente non può continuare a usare le credenziali dell’ex proprietario. Numo viene eseguito sul server: non legge i file del tuo computer e non usa le tue sessioni personali.

![Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.](/documentation/it/numo-permissions-and-approvals-workflow.svg)

## Comprendere i turni persistenti di Numo {#numo-execution-model}

Messaggi interattivi, azioni contestuali e routine entrano nelle conversazioni Numo. Modello e ragionamento della conversazione si scelgono nel composer. Numo agisce tramite i suoi strumenti Minddy e le eventuali connessioni MCP personali che hai aggiunto; non ha bisogno di un repository. Una routine crea una nuova conversazione con istruzioni salvate e contesto di proprietario e progetto. Non serve mantenere il desktop online.

![Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere la tua risposta se serve un input. Riprodurre eventi e riconciliare scritture incerte.](/documentation/it/numo-execution-model-flow.svg)

### Separare esecuzione e visualizzazione {#state}

L’intenzione viene registrata in un turno duraturo con UUID e messaggio. Il turno passa da `queued` a `running`, quindi a `completed` o `waiting_input`. `stopping` e `stopped` indicano un arresto; `retryable` e `failed` indicano un errore. Il flusso SSE mostra l’attività, ma non governa l’esecuzione. Dopo una riconnessione, il client legge gli eventi successivi alla sequenza già ricevuta. Notifiche duplicate o tardive non avviano altro lavoro. Il contesto non concede accesso: gli oggetti privati rimangono privati.

### Gestire modifiche incerte {#mutations}

Prima di una modifica, il sistema registra l’operazione e il relativo checkpoint; riutilizza i risultati già completati. Una lettura interrotta può essere ripetuta, mentre una modifica con esito incerto entra in `reconciling` senza un nuovo tentativo automatico. Controlla la destinazione prima di scrivere ancora. Le routine rispettano proprietà, budget e protezioni di costo; un altro membro non eredita la precedente connessione MCP personale.

Arrestare Numo termina il suo turno. Un’azione esterna già inviata può comunque terminare. Una conversazione che attendeva lavoro sul codice di una versione precedente viene arrestata automaticamente e torna inattiva.

## Collegare un servizio MCP personale a Numo {#numo-mcp-connections}

Nelle impostazioni dell’account, apri **IA e Numo** e usa il riquadro **MCP per Numo**. I link alla vecchia scheda MCP per Numo portano lì. Scegli un servizio o aggiungi un server MCP HTTPS pubblico. Catalogo e registro non aggirano registrazioni o approvazioni del fornitore. Numo può preparare una connessione in una conversazione interattiva, ma non in una routine autonoma.

Il collegamento avviene in una procedura guidata. Un server personalizzato o trovato nel registro chiede prima nome e indirizzo HTTPS; un servizio del catalogo si apre direttamente sul passaggio di accesso. Un servizio del catalogo, una connessione salvata o una voce del registro che dichiara un token conosce già il proprio metodo di accesso: il passaggio lo mostra e **Usa un altro metodo** permette di cambiarlo. Altrimenti scegli **Accedi con OAuth**, **Token Bearer** o **Nessuna autenticazione**. Le **Impostazioni avanzate** contengono il trasporto (Streamable HTTP predefinito, supportato anche SSE precedente) e gli header cifrati. Inserisci segreti nelle credenziali o negli header, mai nell’URL. Comandi locali e reti private non sono supportati. Per un’app OAuth esistente, registra l’URL di callback mostrato e inserisci ID e segreto. Dopo il salvataggio, l’ultimo passaggio attende l’accesso, poi verifica la connessione e mostra quanti strumenti ha trovato Numo. Su desktop OAuth apre il browser di sistema e torna all’app.

![Impostazioni MCP personali, elenco vuoto e pulsante per aggiungere un server.](/documentation/it/numo-mcp-connections-workflow.png)

### Verificare e gestire {#manage}

Il menu consente test, modifica, riconnessione, disabilitazione e rimozione. Un avviso arancione richiede la riconnessione. Campi credenziali vuoti conservano i valori; cambiare URL elimina credenziali e header. Rimuovi il token bearer con il controllo dedicato; `{}` cancella gli header.

Disabilitare blocca nuove chiamate, non quelle inviate. Limiti: 30 secondi, 1 MiB di trasporto e 64 KB di risultato. Verifica scritture scadute sul destinatario prima di ripetere. Le routine usano connessioni del proprietario, senza prestarle agli altri membri.

![Procedura di collegamento a Notion con il metodo di accesso noto dal catalogo.](/documentation/it/numo-mcp-connections-config-workflow.png)

## Riprendere il lavoro Numo interrotto o in attesa {#recover-numo-work}

Torna alla conversazione esistente e leggi gli ultimi messaggi e le schede. Distingui richieste di informazioni, limite dell’account, tetto della routine, allocazione dell’operazione esaurita ed errore tecnico. Chiudere il pannello non dimostra che il lavoro si sia fermato.

In una scheda attiva, rispondi a tutte le domande richieste e invia il gruppo. Le schede precedenti sono registrazioni senza possibilità di inviare una nuova risposta. Saltare non fornisce le informazioni mancanti né autorizza modifiche dipendenti.

### Budget ed errori {#recovery}

La scheda del limite dell’account mostra la data di ripristino del limite, quando è nota, e può proporre piano o chiave personale. Quella della routine apre la gestione: verifica il tetto per esecuzione. L’allocazione riguarda quella singola operazione. Ripetere la richiesta non elimina il limite.

La ripresa da checkpoint è possibile solo se questo è stato conservato. Verifica modifiche ai ticket, pagine e servizi esterni prima di ripetere: una scrittura può riuscire anche se la risposta si perde. Descrivi ciò che resta e chiedi di continuare. Senza checkpoint recuperabile, passa lo stato verificato a una nuova richiesta. Segnala errori persistenti indicando la conversazione, senza credenziali.

## Scegliere un obiettivo per un feedback {#feedback-objectives}

Gli obiettivi dei feedback richiedono una scelta esplicita. Chiedi a Numo di collegare una richiesta a un obiettivo del progetto o rimuovere il collegamento; Numo risolve richiesta e obiettivo prima della modifica. Una revisione o categorizzazione generale non autorizza l’assegnazione di obiettivi. Un’integrazione può fornire l’obiettivo scelto dal proprietario. La conversione eredita obiettivo e categorie; senza una scelta, l’obiettivo resta vuoto.
