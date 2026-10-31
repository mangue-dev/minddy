---
{
  "id": "minddy-mcp",
  "locale": "it",
  "title": "MCP di minddy",
  "summary": "Collega un assistente esterno a minddy, controlla gli accessi e scopri gli strumenti MCP disponibili e le procedure di modifica sicure.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "integrator",
    "member"
  ],
  "workflows": [
    "N09",
    "T06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 17,
  "sourceRevision": 16,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-31",
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
      "app/(marketing)/mcp/page.tsx",
      "app/api/mcp/route.ts",
      "lib/site.ts",
      "components/settings/mcp-connect-panel.tsx",
      "components/settings/account-connected-apps-section.tsx",
      "lib/server/mcp/catalog.ts",
      "lib/server/mcp/tools.ts",
      "lib/server/mcp/page-tools.ts",
      "lib/server/mcp/auth.ts",
      "app/llms-full.txt/route.ts",
      "lib/server/app-origin.ts",
      "lib/server/oauth/issuer.ts",
      "app/api/oauth/register/route.ts",
      "lib/server/oauth/metadata.ts",
      "lib/server/database-tool-schema.ts",
      "lib/server/page-databases.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/server/project-stats.ts",
      "lib/project-stats.ts"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:claude (MIN-878: minddy_get_project_stats paragraph checked against lib/server/mcp/tools.ts, lib/server/project-stats.ts and lib/project-stats.ts; existing figures unaffected and kept)",
    "language": "agent:claude (it paragraph translated from en revision 16 with the glossary register; agent self-review, not human acceptance)",
    "date": "2026-10-31"
  },
  "related": [
    "numo",
    "integration-troubleshooting"
  ],
  "aliases": [
    "external-minddy-mcp",
    "mcp-tool-reference"
  ],
  "tags": [
    "Collegare un assistente esterno a minddy MCP",
    "Usare minddy MCP e scoprire gli strumenti attuali",
    "Collegare un assistente esterno al MCP minddy",
    "Usare minddy MCP e scoprire i tool attuali"
  ],
  "figures": [
    {
      "id": "external-minddy-mcp-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-workflow.png",
      "alt": "Selettore dei client MCP minddy con Claude, Codex e altri assistenti.",
      "caption": "Scegli il client per visualizzare il comando o la configurazione di installazione.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        252
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "external-minddy-mcp-install-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/external-minddy-mcp-install-workflow.png",
      "alt": "Passaggio di installazione di Codex nella procedura di collegamento al MCP di minddy, con l’endpoint minddy Cloud.",
      "caption": "Questo esempio si connette a minddy Cloud. Per un’istanza autogestita, usa l’origine della tua istanza; il comando mostrato non è stato eseguito per questa cattura.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        288
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "external-minddy-mcp-workflow",
    "external-minddy-mcp-install-workflow"
  ]
}
---

minddy MCP permette a un assistente esterno di leggere e modificare il lavoro entro i permessi del tuo account. Collega il client tramite OAuth, controlla gli accessi e usa gli schemi correnti degli strumenti prima di intervenire. Le connessioni MCP di Numo verso altri servizi sono una funzione distinta.

## Collegare un assistente esterno a minddy MCP {#external-minddy-mcp}

Apri la pagina pubblica MCP dell’istanza e scegli le istruzioni del client. Usa l’endpoint mostrato, che termina con `/api/mcp`. In self-hosted usa la tua origine, non Cloud. Il client deve supportare MCP remoto e il flusso OAuth descritto.

Accedi nel browser e verifica l’autorizzazione prima di concederla. La connessione agisce come il tuo account minddy senza accedere a progetti esclusi dai tuoi permessi. Inizia leggendo un ticket già accessibile e controlla il progetto restituito.

Nelle impostazioni dell’account, la sezione MCP di minddy apre una procedura guidata in due passaggi per ogni client: copia il comando di installazione, la configurazione o l’URL del server, poi autorizza l’accesso del client. Il secondo passaggio indica quando minddy riceve questo accesso; fino ad allora, chiuderlo rimanda soltanto l’accesso.

![Selettore dei client MCP minddy con Claude, Codex e altri assistenti.](/documentation/it/external-minddy-mcp-workflow.png)

### Disponibilità di MCP e accesso alla rete {#network-access}

MCP è incluso in minddy self-hosted e si avvia con l’applicazione. Funziona subito su `/api/mcp`, all’origine dell’istanza configurata con `MINDDY_PUBLIC_APP_URL`. Include il rilevamento OAuth e la registrazione dinamica dei client: non servono un server MCP separato, un’applicazione OAuth dedicata o un proxy di minddy Cloud. Collega il client MCP all’endpoint della tua istanza, accedi e concedi l’accesso tramite il consenso nel browser.

La disponibilità del servizio non ne garantisce la raggiungibilità in rete. Sia il client MCP sia il browser usato per l’autorizzazione devono poter raggiungere gli URL MCP e OAuth annunciati. Se imposti esplicitamente `OAUTH_ISSUER`, anche quell’origine deve essere raggiungibile. Il client deve supportare la connessione, il flusso OAuth e il percorso di rete scelto; alcuni client richiedono HTTPS anche nelle reti private.

- **Stesso computer:** `http://localhost:6463/api/mcp` funziona con un client compatibile eseguito sul computer che ospita l’istanza locale. `localhost` e `127.0.0.1` indicano il computer che avvia la connessione. Il lanciatore di istanze locali dell’app desktop ascolta solo sull’interfaccia di loopback; un altro computer o un agente ospitato nel cloud non può raggiungerlo direttamente. Aprire l’URL localhost del server su un altro computer rimanda a quell’altro computer.

- **LAN o VPN:** un’istanza configurata come `http://192.168.1.50` annuncia `http://192.168.1.50/api/mcp`. Un client nella LAN, o collegato tramite VPN, può usarla se indirizzo di ascolto, origine configurata, porta dell’applicazione, firewall e instradamento consentono l’accesso. Il browser deve raggiungere gli stessi URL di autorizzazione annunciati. Serve un’installazione server raggiungibile; cambiare solo l’URL del client non espone un processo limitato al loopback.

- **Fuori dalla rete privata:** usa un’origine HTTPS raggiungibile, per esempio `https://tickets.example.com/api/mcp`, o un altro percorso di rete supportato dal client. Un agente ospitato deve avere un proprio percorso verso l’istanza; la VPN sul computer del browser da sola non gli fornisce quel percorso. Ospitare minddy localmente non lo espone automaticamente a Internet.

### Ambito e revoca {#access}

I client esterni usano gli strumenti disponibili per ticket, piani, commenti, pagine, feedback, cicli, routine e taccuino entro i permessi autorizzati. Gli strumenti seguono, a ogni chiamata, il tuo ruolo attuale in ciascun progetto, quindi un cambio di ruolo si applica senza riconnettersi. Come lettore ottieni gli strumenti di lettura, più quelli dei commenti quando il proprietario ha attivato **Può commentare** per te. MCP è disponibile in tutti i piani Cloud; l’IA del client dipende comunque da configurazione e costi propri.

minddy MCP nelle impostazioni dell’account elenca accessi esterni e controlli di revoca. Revoca client inutilizzati o non più affidabili. Il riquadro **MCP per Numo** della scheda **IA e Numo** è distinto: collega Numo ad altri servizi. Non incollare token in ticket, feedback pubblici o screenshot.

![Passaggio di installazione di Codex nella procedura di collegamento al MCP di minddy, con l’endpoint minddy Cloud.](/documentation/it/external-minddy-mcp-install-workflow.png)


## Usare minddy MCP e scoprire gli strumenti attuali {#mcp-tool-reference}

`/api/mcp` usa Streamable HTTP, strumenti stateless e OAuth 2.1. Collega il tuo account tramite il consenso nel browser; le vecchie chiavi `mdyk_` non sono accettate. Usa `minddy_list_projects` per trovare gli UUID, poi leggi gli schemi del server collegato. `/llms-full.txt` genera i parametri esatti dai registri degli strumenti. Non ricostruirli da un elenco obsoleto. Ogni strumento di progetto ricontrolla l’accesso e restituisce codici di errore stabili.

### Leggere prima di modificare i piani {#issue-plans}

Per trovare un ticket, chiama `minddy_list_issues` con `query`: la ricerca considera le parole del titolo e della descrizione, un identificatore o un numero. Le corrispondenze testuali e gli identificatori esatti vengono per primi; una ricerca descrittiva può poi aggiungere ticket dello stesso progetto trovati [per significato](/docs/navigation#search-by-meaning), contrassegnati con `match: "semantic"`. Leggi un ticket di questo tipo prima di agire. La ricerca per significato viene addebitata al tuo account come **Ricerca dei ticket** e non avviene se hai disattivato **Indicizza i ticket**.

`minddy_get_issue` accetta l’UUID di un ticket, un identificatore di ticket come `DEMO-42` oppure il numero del ticket; `project_id` viene fornito separatamente. `plan_tasks` indica `task_index` a partire da zero. `minddy_update_plan_task` riceve un array `tasks` con gli stati `pending`, `in_progress`, `completed` o `cancelled`; un indice non valido fa rifiutare l’intero batch. `minddy_append_to_plan` aggiunge contenuto, mentre `minddy_edit_issue_text` sostituisce una coppia `old_string`/`new_string` esatta e univoca. Rileggi un piano che può essere cambiato: sostituirlo interamente potrebbe sovrascrivere il progresso di altri. La sezione `## Questions` è esclusa dal conteggio delle attività.

`minddy_get_project_stats` legge le statistiche delle impostazioni generali di un progetto: i ticket per stato; il numero di ticket aperti, in ritardo, non assegnati e fermi; i ticket in ritardo e fermi stessi, i più urgenti per primi; lo slancio su quattro settimane; il tempo mediano di consegna; i ticket creati e completati ogni settimana; i principali collaboratori; e le pull request collegate. Un ticket fermo è in corso o in revisione senza modifiche da 14 giorni. Lo strumento è in sola lettura e aperto a tutti i ruoli, lettori compresi.

Per modificare più ticket, invia una sola chiamata a `minddy_update_issues`: `issues` con `fields` applica la stessa modifica a ogni ticket, e `updates` aggiunge ticket che ricevono ciascuno i propri campi. Una chiamata accetta fino a 50 ticket, ciascuno citato una sola volta, e restituisce `updated` e `failed` per ticket, così un errore non blocca gli altri. Le altre scritture ripetute accettano un elenco di elementi aggiuntivi accanto ai loro campi abituali: `links` per `minddy_link_issues`, `edits` per `minddy_edit_issue_text` e `minddy_edit_page_text` (applicate in ordine; se una non corrisponde, non viene scritto nulla), `pages` per `minddy_create_page` (pagine sotto lo stesso genitore, come le voci di un database) e `feedback_post_ids` per `minddy_update_feedback`. `minddy_update_page` con `parent_page_id` sposta una pagina nell’albero, o alla radice con `null`. Il taccuino delle attività e le descrizioni degli obiettivi si correggono allo stesso modo: `minddy_edit_scratchpad_text` riscrive o elimina passaggi del taccuino, e `minddy_update_objective` accetta `description_edits` invece di una `description` intera. `minddy_append_to_plan` con `field: "description"` aggiunge un blocco alla fine della descrizione di un ticket, e `description_append` fa lo stesso per un obiettivo; una modifica a un obiettivo viene rifiutata, anziché applicata, se l’obiettivo è cambiato dopo la lettura.

Le letture che restituiscono testo con immagini (`minddy_get_issue`, `minddy_get_objective`, `minddy_get_page`, `minddy_get_feedback`, `minddy_get_scratchpad`) le elencano in `images`, ognuna con il suo `src` e il testo alternativo. Passa quel `src` così com’è a `minddy_get_image`: lo strumento verifica il tuo accesso al progetto dell’immagine, o che un’immagine del taccuino sia tua, e restituisce l’immagine fino a 10 MB con un `download_url` firmato valido circa dieci minuti. Un’immagine ospitata fuori da minddy torna solo come URL.

### Rispettare revisioni e proprietà {#pages-and-routines}

`minddy_list_pages` mostra la gerarchia, `minddy_search_pages` restituisce estratti e `minddy_get_page` restituisce Markdown, commenti e valori completi. Preferisci modifiche parziali e usa la versione corrente quando sostituisci il contenuto. Conserva esattamente gli URL di file e immagini. `minddy_create_page` con `database=true` crea un database di pagine. `minddy_update_page_database` richiede la revisione del database per le modifiche allo schema e il valore precedente per le modifiche alle celle. Per riempire un database con meno chiamate, passa `values` a `minddy_create_page` per creare una voce con le sue proprietà, oppure usa `operation=values` per modificare più proprietà della stessa voce in una volta: tutte le celle vengono scritte insieme o nessuna.

Per convertire un tipo, usa `operation=convert` con `propertyId`, `targetType`, `revision` e `preview=true`. Controlla `incompatibleCount`, quindi invia le stesse impostazioni con `preview=false` e il `token` restituito. Imposta `confirmLoss=true` solo dopo che l’utente ha autorizzato esplicitamente la cancellazione dei valori incompatibili.

Gli strumenti delle routine, riservati al proprietario, creano, modificano, sospendono o eliminano routine attivate da una pianificazione, da un evento o da una nuova voce di database. Leggi prima di creare per evitare duplicati. `minddy_add_resource` limita i file a 10 MB; gli strumenti delle pagine non inventano URL.

### Verificare con un esempio {#example}

L’esempio modifica la prima attività di un piano già letto. Sostituisci l’UUID del progetto e il ticket con quelli trovati tramite discovery, e usa l’indice dell’ultima lettura. Controlla poi `plan_tasks` e `plan_progress`. Per un errore di accesso, verifica account e progetto; per un conflitto, rileggi e applica solo la modifica necessaria. Non ripetere una modifica esterna con esito incerto senza averne verificato il risultato.

```json
{
  "project_id": "00000000-0000-4000-8000-000000000001",
  "issue": "DEMO-42",
  "tasks": [{"task_index": 0, "state": "in_progress"}]
}
```


## Scegliere un obiettivo per un feedback {#feedback-objectives}

Le letture dei feedback includono `objective_id`; `minddy_list_feedback` accetta un filtro facoltativo per obiettivo (`null` seleziona richieste senza obiettivo). Usa `minddy_link_feedback_objective` con `project_id`, `feedback_post_id` e `objective_id` solo su richiesta esplicita dell’utente; `null` rimuove il collegamento. L’obiettivo deve essere attivo e appartenere allo stesso progetto. Il dettaglio dell’obiettivo include `linked_feedback`. Il proprietario può fornire `objective_id` a `minddy_create_integration` per una chiave di feedback, oppure modificare l’impostazione con `minddy_update_integration_objective`. I feedback esistenti mantengono la scelta. La conversione eredita obiettivo e categorie; la revisione di Numo non assegna mai obiettivi.
