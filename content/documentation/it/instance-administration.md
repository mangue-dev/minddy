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
  "revision": 18,
  "sourceRevision": 18,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/agent/model-combobox.tsx",
      "lib/server/assistant/conversation-config.ts"
    ]
  },
  "review": {
    "revision": 18,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 2 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected, 1 kept with their earlier capture; no browser walkthrough of the procedures); agent:claude-code (MIN-928: event screening added to the Assistant category of Models, checked against lib/ai-model-config.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-929: Background turns per day added to the Assistant card of Models, checked against lib/ai-model-config.ts and lib/ai-model-config-file.ts; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (MIN-930: home summary added to the Assistant category of Models, checked against lib/ai-model-config.ts); agent:claude-code (MIN-954: sentence on Numo's model on minddy Cloud in #models, source audit against lib/server/assistant/conversation-config.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954 model roles: #models, #models-file, #decision-model and #smart-fill-relations rewritten for one model per role, source audit against lib/ai-model-config.ts, lib/ai-model-config-file.ts, lib/server/admin-model-config.ts and components/admin/admin-models-dashboard.tsx; no browser walkthrough; the instance-administration-models screenshot still shows the former category cards and needs a recapture); agent:claude-code (MIN-954: recommended models and routing shortcuts removed from #models and #models-file, checked against components/admin/admin-models-dashboard.tsx and lib/ai-model-config-file.ts)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-928 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-954 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
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
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 18,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 18,
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

**Costi** mostra quanto i fornitori di IA costano all’istanza, in dollari, come li fatturano, e si aggiorna da solo finché resta aperto. Scegli il periodo nel menu in alto a destra del pannello e restringi tutto con il pulsante **Filtri** accanto, per funzione o modello. Le chiamate effettuate con le chiavi personali dei membri non vengono mai registrate, quindi non compaiono qui. Seguono quattro cifre, ognuna con la sua tendenza e la variazione rispetto al periodo precedente: spesa totale, richieste, token e costo per milione di token. Poi vengono le funzioni e i modelli più costosi, quindi la spesa al giorno per modello e per famiglia di funzioni, le richieste al giorno per modello e le esecuzioni recenti, che si aprono sulle loro chiamate. Ricavi, abbonamenti e margini non sono mostrati: la fatturazione Stripe si gestisce in Stripe. Le chiavi OpenRouter per account che nessun account usa più vengono eliminate ogni notte.

## Scegliere i modelli {#models}

**Modelli** ha una scheda per tipo di modello, e ogni tipo usa un solo modello per tutta l’istanza. **Modello linguistico** stabilisce il modello che usano Numo e ogni attività di testo: titoli delle conversazioni, ricerca web, smistamento eventi, riepilogo della home, Smart Fill e i suoi titoli, Smart Assign, decisioni sulle relazioni, mappatura degli import CSV, scomposizione dei brief, messaggi di commit di merge, pulizia delle dettature, revisione dei feedback e il riquadro delle domande della FAQ. La stessa scheda contiene il **Livello di ragionamento** di Numo e **Turni in background al giorno**, che limita i turni che [Numo in background](/docs/numo#background) fa per un membro in 24 ore: 20 se vuoto, 0 per disattivare Numo in background per tutti; il file dei modelli non lo contiene né lo reimposta. **Embedding** stabilisce l’unico modello di embedding per ticket e feedback, **Voce** il modello di riconoscimento vocale e **Decisioni** il [modello di decisione](#decision-model). Nessuna attività ha un modello proprio. Un’istanza che aveva impostato un modello predefinito di categoria in una versione precedente continua a usarlo: la scheda lo mostra, e salvare la scheda lo sostituisce. **Chiavi personali** è chiuso in fondo: per ogni fornitore, contiene il modello che la chiave di un membro usa per ogni tipo quando il membro non ne ha scelto nessuno.

Su minddy Cloud, il Numo di ogni membro usa il modello e il **Livello di ragionamento** della scheda **Modello linguistico**, che i membri non possono cambiare. Solo una chiave personale dà a un membro la scelta del modello linguistico, che serve poi Numo e ogni sua attività di testo.

## Esportare e importare la configurazione dei modelli {#models-file}

In alto a destra del pannello **Modelli**, **Esporta** scarica la configurazione dei modelli come file JSON con versione (formato `minddy.instance-models`): il modello di ogni tipo, il livello di ragionamento e i modelli predefiniti delle chiavi personali. Non contiene chiavi API né account. **Importa** legge un file del genere ed elenca ogni modifica prima di scrivere qualcosa; **Applica** le scrive tutte, o nessuna se un valore viene rifiutato, per esempio un modello che non è di decisione. Un’importazione sostituisce la configurazione: le impostazioni che il file omette tornano al valore predefinito. Un file di una versione precedente di minddy viene aggiornato al formato attuale: i suoi modelli predefiniti delle categorie Assistente ed Embedding riempiono il modello linguistico e quello di embedding, e i suoi modelli per attività, scorciatoie di instradamento e modelli consigliati vengono elencati e saltati. Un file di una versione più recente viene rifiutato finché l’istanza non viene aggiornata.

## Amministrare l’istanza con Numo {#numo}

In una conversazione Numo avviata da una sessione di amministratore, Numo può leggere i costi IA dell’istanza, con le stesse cifre e gli stessi filtri di **Costi**, leggere e modificare la configurazione dei modelli, visualizzare in anteprima e applicare un’importazione, anche di un file di configurazione allegato alla conversazione, trovare un account tramite il suo indirizzo email esatto, leggerne il piano e il budget di utilizzo IA, e regalare o ritirare un piano. La sessione di amministratore viene verificata di nuovo prima di ognuna di queste azioni, e Numo ti fa confermare ogni modifica prima di eseguirla. Questi strumenti non restituiscono attività, progetti o contenuti di un altro account. Anche [Numo in background](/docs/numo#background) li riceve finché il tuo account è amministratore con l’autenticazione a due fattori attiva: legge da solo la configurazione dei modelli e i costi, e ogni altra azione richiede uno dei tuoi ricordi, che sostituisce la tua conferma. Le menzioni di @Numo, le routine e l’aiuto pubblico della documentazione non li ricevono mai.

## Modificare le variabili dell’istanza {#instance-variables}

Su un’istanza self-hosted il cui file d’ambiente imposta `MINDDY_CONFIG_OVERRIDES=1`, la scheda **Istanza** cambia alcune delle sue variabili senza modificare il file: la chiave OpenRouter, gli indirizzi degli amministratori, il fornitore e i mittenti email, le tue app GitHub e GitLab, le statistiche, il nome e l’indirizzo di contatto dell’istanza e la pubblicazione della configurazione dei modelli. La guida d’installazione chiede se consentirlo, e l’app desktop lo attiva per l’istanza che installa sul tuo computer. Solo il file lo attiva o lo disattiva; minddy Cloud non lo offre mai.

![Scheda Istanza con l’origine di ogni variabile, una chiave OpenRouter mascherata impostata qui e gli indirizzi degli amministratori presi dal file.](/documentation/it/instance-administration-instance.png)

Il campo di ricerca sopra l’elenco trova una variabile per nome, etichetta o descrizione. Un valore salvato nella scheda sostituisce quello del file, e **Rimuovi** riporta il valore del file. Ogni variabile indica da dove viene il suo valore; i segreti mostrano solo gli ultimi caratteri. La maggior parte delle modifiche si applica entro un minuto; la scheda segnala quelle che si applicano dopo il riavvio dell’istanza, e l’app desktop propone allora **Riavvia ora**. L’accesso al database, le chiavi di cifratura, l’indirizzo dell’app e i valori fissati in compilazione si impostano solo nel file, quindi un valore sbagliato nella scheda non ti blocca mai fuori: rimuovilo, oppure imposta `MINDDY_CONFIG_OVERRIDES=0` nel file per tornare ai suoi valori.

Salvare un segreto o gli indirizzi degli amministratori chiede il tuo codice a due fattori se non l’hai inserito negli ultimi minuti, e non puoi rimuovere il tuo indirizzo. Ogni modifica compare nella Posta in arrivo degli altri amministratori, compresi quelli con il ruolo di amministratore, e via email a tutti gli amministratori, te compreso, se l’istanza invia email. Salvare un valore invariato non registra nulla. Ogni variabile conserva le sue ultime versioni, con chi l’ha modificata e quando; **Ripristina** ne rimette una. I valori sono salvati nel database, cifrati quando la cifratura dello spazio di lavoro è attiva.

## Scegliere il modello di decisione IA {#decision-model}

In **Modelli**, **Decisioni**, **Modello di decisione** stabilisce l’unico modello di decisione che risponde a tutte le decisioni IA dell’istanza: Smart Fill, Smart Assign, decisioni sulle relazioni, smistamento eventi e revisione dei feedback. Non esiste una scelta per progetto, utente o funzione. Il selettore elenca solo i modelli OpenRouter che pubblicano la capacità di decisione; i modelli di chat, embedding e trascrizione non compaiono mai. Il salvataggio prova il candidato con una decisione rappresentativa. Un modello che non è di decisione, rifiuta la richiesta, restituisce una risposta non valida o impiega più di 5 secondi viene rifiutato, e il modello attuale resta in uso. Quando il catalogo non può essere caricato, ogni modifica viene rifiutata. Le istanze self-hosted senza IA gestita non hanno un catalogo di piattaforma e mantengono il predefinito, Jev.

Le nuove decisioni usano il modello salvato entro circa un minuto su ogni processo server. Quando il modello fallisce o risponde sotto la soglia di confidenza, la decisione ripiega sul modello linguistico. La soglia è stata calibrata su Jev e gli altri modelli di decisione distribuiscono la confidenza in modo diverso: dopo un cambio, verifica la concordanza per modello nella vista `ai_decision_evaluations_weekly` del database. Le righe di utilizzo registrano il modello che ha risposto.

## Configurare le relazioni di Smart Fill {#smart-fill-relations}

Dopo il salvataggio di un ticket, Smart Fill può indicizzarlo e collegarlo ai ticket correlati. **Modello di embedding**, in **Modelli**, **Embedding**, trasforma titolo e descrizione dei ticket, e i feedback, in vettori. Il predefinito è `openai/text-embedding-3-small`. Cambiarlo avvia una nuova versione dell’indice: vettori vecchi e nuovi non vengono mai confrontati. Il job orario `/api/cron/issue-index` indicizza poi i ticket esistenti, 100 per esecuzione, e li addebita al proprietario di ogni progetto; non crea mai relazioni. Lo stesso modello trasforma ogni query della ricerca per significato in un vettore, con le impostazioni del fornitore IA del membro che cerca, e le query vengono confrontate solo con i vettori della versione attuale dell’indice. Finché un ticket non viene reindicizzato, la ricerca dei ticket correlati e la ricerca per significato lo trovano solo per le sue parole. Lo stesso job cifra i vettori salvati in chiaro appena il loro progetto viene cifrato. Le decisioni sulle relazioni usano il [modello di decisione](#decision-model) e ripiegano sul modello linguistico quando fallisce o è incerto.

I campi di embedding e di trascrizione rifiutano al salvataggio un modello della famiglia sbagliata, per esempio un modello di chat in un campo di embedding, e il modello attuale resta in uso. Questo controllo richiede il catalogo della piattaforma: se non può essere caricato, come su un’istanza self-hosted senza IA gestita, la scelta non può essere verificata e viene accettata. Per i membri che eseguono le automazioni con la propria chiave, i valori predefiniti per provider includono `issue_embedding_model`: `text-embedding-3-small` per OpenAI e `gemini-embedding-001` per Google.

## Mantenere responsabilità operative {#responsibilities}

Rimangono tue responsabilità privilegi minimi, recupero MFA, segreti, backup, conservazione, incidenti e costi. La console non sostituisce il ripristino di database e Storage né la configurazione SMTP. Se l’accesso viene rifiutato, controlla email confermata, allowlist, MFA e sessione prima di cambiare la configurazione. Una sessione revocata o un account bloccato non conserva i privilegi grazie a un JWT ancora valido. Evita screenshot con dati privati di altri utenti, fattori MFA o dettagli finanziari.
