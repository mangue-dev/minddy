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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
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
    "Comprendere i turni persistenti di Numo e il lavoro delegato",
    "Collegare un servizio MCP personale a Numo",
    "Riprendere il lavoro Numo interrotto o in attesa",
    "Comprendere turni duraturi Numo e lavoro delegato"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/work-with-numo-workflow.png",
      "alt": "Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.",
      "caption": "Conversazione dimostrativa esistente, tradotta per la visualizzazione. La risposta salvata cita AUR-11 e AUR-7; la cattura non attesta una nuova esecuzione.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/it/numo-permissions-and-approvals-workflow.svg",
      "alt": "Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.",
      "caption": "Accesso al progetto e richieste esplicite limitano le azioni di Numo; i contenuti esterni non concedono permessi.",
      "revision": 2,
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
      "alt": "Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere worker attuale se necessario. Riprodurre eventi e riconciliare scritture incerte.",
      "caption": "Segui le fasi in questo ordine. Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere worker attuale se necessario. Riprodurre eventi e riconciliare scritture incerte.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
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
            "title": "Attendere worker attuale se necessario"
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/numo-mcp-connections-config-workflow.png",
      "alt": "Modulo per un server MCP personalizzato con impostazioni avanzate di autenticazione, trasporto e header.",
      "caption": "Modulo per un server MCP personalizzato con impostazioni avanzate di autenticazione, trasporto e header. Non sono state inserite credenziali né contattati server.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        920
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/recover-numo-work-workflow.png",
      "alt": "Risposta di Numo che segnala codice e test locali, un push del branch non riuscito e nessuna pull request in quel momento.",
      "caption": "Risultato parziale iniziale di un’esecuzione dimostrativa reale, localizzato per la lettura. In quel momento il push era fallito e non esisteva alcuna PR. Verifica il branch salvato e i servizi esterni prima di continuare; la conversazione è poi ripresa e la PR è stata corretta.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        400
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow",
    "recover-numo-work-workflow"
  ]
}
---

Numo lavora nel contesto del tuo account e dei progetti accessibili. Qui trovi conversazioni, autorizzazioni, esecuzione persistente, connessioni MCP personali e ripresa del lavoro. Il lavoro sul codice delegato usa una sandbox del server; le routine usano connessioni e budget del proprietario.

## Completare un’attività del progetto con Numo {#work-with-numo}

Apri il ticket o il progetto interessato e usa il pulsante flottante di Numo. La pagina corrente diventa il contesto. Le azioni contestuali che affidano lavoro a Numo aprono lo stesso pannello. Servono accesso al progetto e budget IA disponibile oppure una chiave personale compatibile.

1. Controlla il contesto nell’area di scrittura. Specifica il ticket quando sono coinvolti più elementi.
2. Scegli modello e livello di ragionamento della conversazione. Il worker di codice usa impostazioni dell’account separate.
3. Invia una richiesta circoscritta, per esempio: «Leggi questo ticket e proponi criteri di accettazione. Non modificarne lo stato».
4. Leggi la risposta e apri i collegamenti ai ticket o alle fonti. Se hai chiesto una modifica, verifica l’oggetto aggiornato.

![Conversazione dimostrativa Numo con contesto, cambio di priorità e risposta salvata.](/documentation/it/work-with-numo-workflow.png)

### Continuare o delegare {#continue}

L’elenco conserva le conversazioni precedenti. Continua quella che contiene le decisioni utili. Per modificare un repository, Numo delega a un worker in una sandbox del server e mostra avanzamento, file, controlli e pull request. Non lavora nella tua cartella locale.

Se Numo richiede informazioni, invia la scelta prima di attendere il proseguimento delle attività dipendenti. Una scheda di consumo o errore spiega l’interruzione. Verifica ogni scrittura esterna prima di chiedere di ripeterla.

## Capire i permessi di Numo {#numo-permissions-and-approvals}

Numo agisce entro i diritti dell’utente corrente. Una richiesta in chat non concede a un membro le impostazioni riservate al proprietario. Il proprietario gestisce membri, integrazioni, repository e impostazioni dei feedback. Le preferenze personali appartengono all’account corrente.

Numo può modificare le preferenze supportate e le impostazioni del progetto autorizzate al proprietario. Credenziali dei fornitori, connessioni Git, secondo fattore e file dell’avatar restano da configurare personalmente. Modello e ragionamento del worker di codice si cambiano solo nelle impostazioni IA dell’account.

### Autorizzare l’azione {#authorization}

Specifica modifica e ambito. Leggere una richiesta non autorizza una risposta pubblica: Numo risponde pubblicamente ai feedback solo su richiesta esplicita. Istruzioni o risultati di un MCP remoto non autorizzano altre azioni. Collega solo servizi a cui affidi le informazioni e le azioni previste.

Una richiesta può raggiungere un fornitore esterno. Disabilitare la connessione impedisce nuove chiamate, ma non ritira quelle inviate. Controlla una scrittura scaduta presso il destinatario prima di ripeterla.

### Contesto personale e pianificato {#context}

Le conversazioni non usano le connessioni MCP personali di altri membri. Le routine usano connessioni e budget del proprietario. Dopo un cambio di proprietario, avvia una nuova esecuzione con quello corrente: le precedenti non conservano le vecchie credenziali. La sandbox del server non eredita file o sessioni del tuo computer.

![Matrice dei permessi Numo per azioni del progetto, connessioni personali e routine.](/documentation/it/numo-permissions-and-approvals-workflow.svg)

## Comprendere i turni persistenti di Numo e il lavoro delegato {#numo-execution-model}

Messaggi, azioni e routine alimentano le conversazioni Numo. Modello e livello di ragionamento della conversazione si scelgono nel composer; il lavoro sul codice delegato usa il modello di codice e il livello di ragionamento predefiniti dell’account. Gli strumenti diretti non richiedono un repository. Una sandbox server del repository collegato viene aperta solo quando serve lavorare sul codice. Una routine crea una nuova conversazione con le istruzioni e il contesto del proprietario e del progetto. Non è necessario mantenere il desktop online.

![Schema: Persistire intento, messaggio e UUID. Acquisire turno, salvare tool e risultati. Attendere worker attuale se necessario. Riprodurre eventi e riconciliare scritture incerte.](/documentation/it/numo-execution-model-flow.svg)

### Separare esecuzione e visualizzazione {#state}

L’intenzione viene registrata in un turno duraturo con UUID e messaggio. Il turno passa da queued a running, quindi a completed, waiting_input o waiting_work. stopping e stopped indicano un arresto; retryable e failed indicano un errore. Il flusso SSE mostra l’attività, ma non governa l’esecuzione. Dopo una riconnessione, il client legge gli eventi successivi alla sequenza già ricevuta. La conclusione di un worker riprende solo il turno padre dell’esecuzione corrente; notifiche duplicate o tardive non avviano altro lavoro. Il contesto non concede accesso: gli oggetti privati rimangono privati.

### Gestire modifiche incerte {#mutations}

Prima di una modifica, il sistema registra l’operazione e il relativo checkpoint; riutilizza i risultati già completati. Una lettura interrotta può essere ripetuta, mentre una modifica con esito incerto entra in reconciling senza un nuovo tentativo automatico. Controlla la destinazione prima di scrivere ancora. Le routine rispettano proprietà, budget e protezioni di costo; un altro membro non eredita la precedente connessione MCP personale. Arrestare il turno padre interrompe la delega, ma un’azione esterna già inviata può comunque terminare.

## Collegare un servizio MCP personale a Numo {#numo-mcp-connections}

Apri MCP per Numo nelle impostazioni dell’account. Scegli un servizio o aggiungi un server MCP HTTPS pubblico. Catalogo e registro non aggirano registrazioni o approvazioni del fornitore. Numo può preparare una connessione in una conversazione interattiva, ma non in una routine autonoma.

Usa OAuth oppure impostazioni avanzate per token bearer, nessuna autenticazione o header cifrati. Streamable HTTP è predefinito; è supportato anche SSE precedente. Inserisci segreti nelle credenziali o negli header, mai nell’URL. Comandi locali e reti private non sono supportati. Per un’app OAuth esistente, registra l’URL di callback mostrato e inserisci ID e segreto. Su desktop OAuth apre il browser di sistema e torna all’app.

![Impostazioni MCP personali, elenco vuoto e pulsante per aggiungere un server.](/documentation/it/numo-mcp-connections-workflow.png)

### Verificare e gestire {#manage}

Il menu consente test, modifica, riconnessione, disabilitazione e rimozione. Un avviso arancione richiede la riconnessione. Campi credenziali vuoti conservano i valori; cambiare URL elimina credenziali e header. Rimuovi il token bearer con il controllo dedicato; `{}` cancella gli header.

Disabilitare blocca nuove chiamate, non quelle inviate. Limiti: 30 secondi, 1 MiB di trasporto e 64 KB di risultato. Verifica scritture scadute sul destinatario prima di ripetere. Le routine usano connessioni del proprietario, senza prestarle agli altri membri.

![Modulo per un server MCP personalizzato con impostazioni avanzate di autenticazione, trasporto e header.](/documentation/it/numo-mcp-connections-config-workflow.png)

## Riprendere il lavoro Numo interrotto o in attesa {#recover-numo-work}

Torna alla conversazione esistente e leggi ultimi messaggi e scheda del worker. Distingui richieste di informazioni, limite dell’account, tetto della routine, allocazione dell’operazione esaurita ed errore tecnico. Chiudere il pannello non dimostra che il lavoro si sia fermato.

In una scheda attiva, rispondi a tutte le domande richieste e invia il gruppo. Le schede precedenti sono registrazioni senza possibilità di inviare una nuova risposta. Saltare non fornisce le informazioni mancanti né autorizza modifiche dipendenti.

### Budget ed errori {#recovery}

La scheda del limite dell’account mostra la data di ripristino del limite, quando è nota, e può proporre piano o chiave personale. Quella della routine apre la gestione: verifica il tetto per esecuzione. L’allocazione riguarda quella singola operazione. Ripetere la richiesta non elimina il limite. Le chiavi personali non rendono gratuito il calcolo della sandbox.

La ripresa da checkpoint è possibile solo se questo è stato conservato. Verifica ticket, branch, PR e servizi esterni prima di ripetere: una scrittura può riuscire anche se la risposta si perde. Descrivi ciò che resta e chiedi di continuare. Senza checkpoint recuperabile, passa lo stato verificato a una nuova richiesta. Segnala errori persistenti indicando la conversazione, senza credenziali.

![Risposta di Numo che segnala codice e test locali, un push del branch non riuscito e nessuna pull request in quel momento.](/documentation/it/recover-numo-work-workflow.png)
