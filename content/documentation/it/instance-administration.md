---
{
  "id": "instance-administration",
  "locale": "it",
  "title": "Amministrazione dell’istanza",
  "summary": "Accedi alla console amministrativa con MFA, usa i controlli disponibili e distingui amministrazione dell’istanza e proprietà del progetto.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-798 Smart Fill title model; MIN-829 instance administration; MIN-847 instance variables",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/model-capability-validation.ts",
      "app/api/cron/issue-index/route.ts",
      "lib/server/issue-semantic-search.ts",
      "components/admin/admin-accounts-dashboard.tsx",
      "components/admin/admin-costs-dashboard.tsx",
      "components/admin/admin-models-dashboard.tsx",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "lib/server/model-config.ts",
      "lib/server/assistant/admin-tools.ts",
      "lib/instance-variables.ts",
      "lib/server/instance-variables.ts",
      "app/api/admin/instance-variables/route.ts",
      "components/admin/admin-instance-dashboard.tsx",
      "components/agent/model-combobox.tsx"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (per-task model pickers show the category's model by name instead of Default model when that model is in the catalog, and choosing it makes the task follow the category again; checked against components/agent/model-combobox.tsx and components/admin/admin-models-dashboard.tsx; not checked in the running app; no figure recaptured, the Models figure may show the former picker wording); agent:claude-code (MIN-847 Instance tab section checked against lib/instance-variables.ts, lib/server/instance-variables.ts and app/api/admin/instance-variables/route.ts; figure captured on 2026-10-29 from a disposable local self-hosted instance with its own test administrator, every write blocked, and inspected); agent:claude-code (MIN-829 tabs, accounts, costs, model categories, configuration file and Numo admin tools checked against lib/admin-tabs.ts, lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts, lib/server/finance.ts, lib/admin-costs.ts, lib/server/retention.ts and lib/server/assistant/admin-tools.ts, including admin_get_costs; both figures recaptured on 2026-10-29 with captures/shots/documentation-admin from a local candidate against the preview capture admin, every write blocked, and inspected); agent:claude-code (MIN-798 Smart-fill titles model paragraph checked against lib/ai-model-config.ts, lib/ai-surfaces.ts and lib/server/smart-fill-title.ts: automations group, fallback deepseek/deepseek-v4-flash, not answered by the decision model; no figure changed); agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-829 sections with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-798 Smart-fill titles model paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration",
    "recommended-models"
  ],
  "aliases": [],
  "tags": [
    "Usare la console di amministrazione dell’istanza"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-overview.png",
      "alt": "Scheda Account con il numero di account e la ricerca di un account tramite email esatta.",
      "caption": "Account mostra il numero di account e la ricerca per il supporto; l’immagine proviene da un’istanza dimostrativa.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-models.png",
      "alt": "Scheda Modelli con un modello predefinito per categoria e i modelli per attività chiusi.",
      "caption": "Modelli mostra un modello predefinito per categoria; i modelli per attività restano chiusi. Per questa immagine non è stata modificata alcuna impostazione di modello o fornitore.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "instance-administration-instance",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-instance.png",
      "alt": "Scheda Istanza con l’origine di ogni variabile, una chiave OpenRouter mascherata impostata qui e gli indirizzi degli amministratori presi dal file.",
      "caption": "Istanza mostra da dove viene ogni valore; i segreti mostrano solo gli ultimi caratteri. Questa cattura proviene da un’istanza self-hosted locale usa e getta.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-29",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usare la console di amministrazione dell’istanza {#instance-administration}

Amministrare l’istanza è diverso da possedere un progetto. `ADMIN_EMAILS` elenca gli account confermati autorizzati lato server; anche `app_metadata.role=admin` firmato è una fonte valida. Sono richiesti `aal2`, MFA verificata e controlli aggiornati su account e sessione. Se questi controlli falliscono, l’accesso viene negato. Accedi, completa TOTP e apri `/admin`. Non alterare i ruoli nel database per aggirare MFA. La console e le API private rimangono `noindex`.


![Scheda Account con il numero di account e la ricerca di un account tramite email esatta.](/documentation/it/instance-administration-overview.png)

![Scheda Modelli con un modello predefinito per categoria e i modelli per attività chiusi.](/documentation/it/instance-administration-models.png)

## Usare i controlli disponibili {#panels}

La console ha tre schede: **Account**, **Costi**, **Modelli** e, dove consentito, **Istanza**. **Costi** resta nascosta senza una funzionalità OpenRouter gestita collegata. I link alle vecchie schede Panoramica, Utenti e Finanze aprono **Account** o **Costi**. Regalare un piano dipende da una fatturazione configurata o da un override esistente. Un’istanza self-hosted senza fornitori commerciali non ottiene la fatturazione Cloud aprendo la console. Le modifiche amministrative riguardano l’intera istanza, non un progetto; verificale con account dimostrativi.

## Assistere un account {#accounts}

**Account** mostra quanti account ha l’istanza. Sotto, trova un account solo tramite il suo indirizzo email esatto con **Cerca account**. Aprilo per vedere lo stato di conferma della sua email, controllare o **Azzera**re il suo budget di utilizzo IA, oppure **Regala un piano** alla condizione sopra. La scheda non mostra attività, iscrizioni, onboarding, numero di progetti né contenuti personali; apri un account solo per un’attività di supporto o di fatturazione.

## Seguire i costi dell’istanza {#costs}

**Costi** mostra quanto i fornitori di IA costano all’istanza, in dollari, come li fatturano, e si aggiorna da solo finché resta aperto. Scegli il periodo nel menu in alto a destra del pannello e restringi tutto con il pulsante **Filtri** accanto, per funzione, modello o chiave usata (la chiave dell’istanza o le chiavi personali dei membri). Seguono quattro cifre, ognuna con la sua tendenza e la variazione rispetto al periodo precedente: spesa totale, richieste, token e costo per milione di token. Poi vengono le funzioni e i modelli più costosi, quindi la spesa al giorno per modello e per famiglia di funzioni, le richieste al giorno per modello e le esecuzioni recenti, che si aprono sulle loro chiamate. Ricavi, abbonamenti e margini non sono mostrati: la fatturazione Stripe si gestisce in Stripe. Le chiavi OpenRouter per account che nessun account usa più vengono eliminate ogni notte.

## Scegliere i modelli per categoria {#models}

Ogni scheda di **Modelli** ha un **Modello predefinito** per la sua categoria: **Assistente** (Numo, titoli delle conversazioni, ricerca web), **Automazioni** (Smart Fill e i suoi titoli, Smart Assign, decisioni sulle relazioni, mappatura delle importazioni CSV, suddivisione dei brief, messaggi di commit per le unioni), **Embedding** (embedding di ticket e feedback) e **Feedback e sito pubblico** (analisi dei feedback, riquadro domande delle FAQ). Un’attività segue il modello predefinito della sua categoria finché non le dai un modello proprio in **Modelli per attività**; perché torni a seguire la categoria, scegli nel suo selettore il modello della categoria, mostrato con il suo nome e spuntato finché l’attività lo segue. **Modello predefinito** resta un’opzione solo quando quel modello non è nel catalogo. Finché il modello predefinito di una categoria non è impostato, ogni attività mantiene il proprio valore integrato. **Livello di ragionamento**, **Modello di decisione** e le due impostazioni di **Voce** hanno righe proprie. Impostare il modello predefinito di una categoria libera le attività che hanno ancora il valore integrato, come quelle con cui viene creata una nuova istanza; un’attività impostata su un altro modello lo mantiene. **Modelli consigliati** fissa la breve lista con cui si apre ogni selettore di modelli. **Chiavi personali** è chiusa in fondo: riguarda solo i membri che usano la propria chiave del fornitore.

## Esportare e importare la configurazione dei modelli {#models-file}

In alto a destra del pannello **Modelli**, **Esporta** scarica la configurazione dei modelli in un file JSON con versione (formato `minddy.instance-models`): modelli predefiniti delle categorie, modelli delle attività, scorciatoie di instradamento, livello di ragionamento, modelli consigliati e valori predefiniti dei fornitori per le chiavi personali. Non contiene chiavi API né account. **Importa** legge un file di questo tipo ed elenca ogni modifica prima di scrivere qualcosa; **Applica** le scrive tutte, oppure nessuna quando un valore viene rifiutato, per esempio un modello che non è un modello di decisione. Un’importazione sostituisce la configurazione: le impostazioni che il file non contiene tornano al valore predefinito. Un file di una versione precedente di minddy viene aggiornato al formato attuale; un file di una versione più recente viene rifiutato finché l’istanza non è aggiornata. Le voci che questa versione non conosce vengono elencate e ignorate.

## Amministrare l’istanza con Numo {#numo}

In una conversazione Numo avviata da una sessione di amministratore, Numo può leggere i costi IA dell’istanza, con le stesse cifre e gli stessi filtri di **Costi**, leggere e modificare la configurazione dei modelli, visualizzare in anteprima e applicare un’importazione, anche di un file di configurazione allegato alla conversazione, trovare un account tramite il suo indirizzo email esatto, leggerne il piano e il budget di utilizzo IA, e regalare o ritirare un piano. La sessione di amministratore viene verificata di nuovo prima di ognuna di queste azioni, e Numo ti fa confermare ogni modifica prima di eseguirla. Questi strumenti non restituiscono attività, progetti o contenuti di un altro account. Le menzioni di @Numo, le routine e l’aiuto pubblico della documentazione non li ricevono mai.

## Modificare le variabili dell’istanza {#instance-variables}

Su un’istanza self-hosted il cui file d’ambiente imposta `MINDDY_CONFIG_OVERRIDES=1`, la scheda **Istanza** cambia alcune delle sue variabili senza modificare il file: la chiave OpenRouter, gli indirizzi degli amministratori, il fornitore e i mittenti email, le tue app GitHub e GitLab, le statistiche, il nome e l’indirizzo di contatto dell’istanza e la pubblicazione della configurazione dei modelli. La guida d’installazione chiede se consentirlo, e l’app desktop lo attiva per l’istanza che installa sul tuo computer. Solo il file lo attiva o lo disattiva; Minddy Cloud non lo offre mai.

![Scheda Istanza con l’origine di ogni variabile, una chiave OpenRouter mascherata impostata qui e gli indirizzi degli amministratori presi dal file.](/documentation/it/instance-administration-instance.png)

Il campo di ricerca sopra l’elenco trova una variabile per nome, etichetta o descrizione. Un valore salvato nella scheda sostituisce quello del file, e **Rimuovi** riporta il valore del file. Ogni variabile indica da dove viene il suo valore; i segreti mostrano solo gli ultimi caratteri. La maggior parte delle modifiche si applica entro un minuto; la scheda segnala quelle che si applicano dopo il riavvio dell’istanza, e l’app desktop propone allora **Riavvia ora**. L’accesso al database, le chiavi di cifratura, l’indirizzo dell’app e i valori fissati in compilazione si impostano solo nel file, quindi un valore sbagliato nella scheda non ti blocca mai fuori: rimuovilo, oppure imposta `MINDDY_CONFIG_OVERRIDES=0` nel file per tornare ai suoi valori.

Salvare un segreto o gli indirizzi degli amministratori chiede il tuo codice a due fattori se non l’hai inserito negli ultimi minuti, e non puoi rimuovere il tuo indirizzo. Ogni modifica compare nella Posta in arrivo degli altri amministratori, compresi quelli con il ruolo di amministratore, e via email a tutti gli amministratori, te compreso, se l’istanza invia email. Salvare un valore invariato non registra nulla. Ogni variabile conserva le sue ultime versioni, con chi l’ha modificata e quando; **Ripristina** ne rimette una. I valori sono salvati nel database, cifrati quando la cifratura dello spazio di lavoro è attiva.

## Scegliere il modello di decisione IA {#decision-model}

In **Modelli**, sezione **Automazioni**, **Modello di decisione** imposta l’unico modello di decisione che risponde a tutte le decisioni IA dell’istanza: Smart Fill, Smart Assign e la revisione dei feedback. Non esiste una scelta per progetto, per utente o per funzione. Il selettore propone solo modelli OpenRouter che pubblicano la capacità di decisione; i modelli di chat, embedding e trascrizione non compaiono mai. Il salvataggio prova il candidato con una decisione rappresentativa. Un modello che non è di decisione, rifiuta la richiesta, restituisce una risposta non valida o impiega più di 5 secondi viene rifiutato, e il modello attuale resta in uso. Se il catalogo non può essere caricato, ogni modifica viene rifiutata. Le istanze self-hosted senza IA gestita non hanno un catalogo della piattaforma e mantengono il modello predefinito, Jev.

Le nuove decisioni usano il modello salvato entro circa un minuto su ogni processo del server. Se il modello fallisce o risponde sotto la soglia di confidenza, la decisione ripiega sul modello LLM proprio della funzione, come prima. La soglia è stata calibrata su Jev e gli altri modelli di decisione distribuiscono la confidenza in modo diverso: dopo un cambio, controlla la concordanza per modello nella vista di database `ai_decision_evaluations_weekly`. Le righe di utilizzo registrano il modello che ha risposto.

**Titoli Smart-fill**, in **Modelli**, sezione **Automazioni**, **Modelli per attività**, sceglie il modello che scrive il titolo di un ticket creato senza titolo e lo riscrive durante una rivalutazione. È un compito di scrittura, non una decisione: il modello decisionale non lo gestisce mai. Il valore predefinito è `deepseek/deepseek-v4-flash`; qualcuno attende il ticket, quindi scegli un modello veloce.

## Configurare le relazioni di Smart Fill {#smart-fill-relations}

Dopo il salvataggio di un ticket, Smart Fill può indicizzarlo e collegarlo ai ticket correlati. Due campi in **Modelli** regolano questo lavoro:

- **Embedding dei ticket**, nella sezione **Embedding**, **Modelli per attività**, sceglie il modello che trasforma titolo e descrizione dei ticket in vettori. Il valore predefinito è `openai/text-embedding-3-small`. Cambiarlo avvia una nuova versione dell’indice: vettori vecchi e nuovi non vengono mai confrontati. Il job orario `/api/cron/issue-index` indicizza poi i ticket esistenti, 100 per esecuzione, addebitando il proprietario di ogni progetto; non crea mai relazioni. Lo stesso modello trasforma in vettore ogni interrogazione della ricerca per significato, con le impostazioni del provider IA del membro che cerca, e le interrogazioni vengono confrontate solo con i vettori della versione attuale dell’indice. Finché un ticket non viene reindicizzato, la ricerca dei ticket correlati e la ricerca per significato lo raggiungono solo tramite le sue parole. Lo stesso job converte in vettori cifrati quelli salvati in chiaro non appena il loro progetto inizia a cifrare.
- **Modello di decisione delle relazioni**, nella sezione **Automazioni**, **Modelli per attività**, è il modello LLM di riserva che risponde alle decisioni sulle relazioni quando il [modello di decisione](#decision-model) fallisce o non è sicuro, come il modello LLM proprio di ogni funzione. Il valore predefinito è `deepseek/deepseek-v4-flash`.

I campi di embedding e di trascrizione rifiutano al salvataggio un modello della famiglia sbagliata, per esempio un modello di chat in un campo di embedding, e il modello attuale resta in uso. Questo controllo richiede il catalogo della piattaforma: se non può essere caricato, come su un’istanza self-hosted senza IA gestita, la scelta non può essere verificata e viene accettata. Per i membri che eseguono le automazioni con la propria chiave, i valori predefiniti per provider includono `issue_embedding_model`: `text-embedding-3-small` per OpenAI e `gemini-embedding-001` per Google.

## Mantenere responsabilità operative {#responsibilities}

Rimangono tue responsabilità privilegi minimi, recupero MFA, segreti, backup, conservazione, incidenti e costi. La console non sostituisce il ripristino di database e Storage né la configurazione SMTP. Se l’accesso viene rifiutato, controlla email confermata, allowlist, MFA e sessione prima di cambiare la configurazione. Una sessione revocata o un account bloccato non conserva i privilegi grazie a un JWT ancora valido. Evita screenshot con dati privati di altri utenti, fattori MFA o dettagli finanziari.
