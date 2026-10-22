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
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/issue-semantic-search.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; both screenshots recaptured on 2026-10-20 with captures/shots/documentation-admin and the preview-only capture admin (MIN-740); no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
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
      "alt": "Panoramica amministratore con indicatori aggregati di account, attività, introduzione e contenuti.",
      "caption": "Panoramica mostra gli indicatori aggregati dell’istanza; la schermata proviene da un’istanza dimostrativa. Finanze compare perché lì è configurata una chiave OpenRouter gestita.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "alt": "Impostazioni dei modelli IA e del ragionamento dell’istanza.",
      "caption": "Modelli configura valori predefiniti e usi specifici. La schermata mostra la configurazione esistente; nessun modello o provider è stato modificato.",
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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


![Panoramica amministratore con indicatori aggregati di account, attività, introduzione e contenuti.](/documentation/it/instance-administration-overview.png)

![Impostazioni dei modelli IA e del ragionamento dell’istanza.](/documentation/it/instance-administration-models.png)

## Usare i controlli disponibili {#panels}

La console comprende Panoramica, Utenti, Modelli e, quando disponibile, Finanze. Finanze è nascosto senza OpenRouter gestito; l’assegnazione di un piano dipende dalla fatturazione abilitata o da un override già presente. Aprire la console non aggiunge la fatturazione Cloud a un’istanza self-hosted senza provider commerciali. **Utenti** trova un account solo tramite il suo indirizzo email esatto; aprilo per vedere lo stato di conferma dell’email, consultare o azzerare il budget di utilizzo dell’IA, regalare un piano alla condizione indicata sopra o contrassegnarlo come account interno, che lo esclude da tutte le statistiche. Il pannello non mostra l’attività dell’account né i suoi contenuti personali; apri un account solo per un’attività di supporto o di fatturazione. Controlla modelli, valori predefiniti, utenti e quote nella release installata prima di modificare. I cambiamenti interessano tutta l’istanza: verificali con un account demo.

## Scegliere il modello di decisione IA {#decision-model}

In **Modelli**, sezione **Automazioni**, **Modello di decisione** imposta l’unico modello di decisione che risponde a tutte le decisioni IA dell’istanza: Smart Fill, Smart Assign e la revisione dei feedback. Non esiste una scelta per progetto, per utente o per funzione. Il selettore propone solo modelli OpenRouter che pubblicano la capacità di decisione; i modelli di chat, embedding e trascrizione non compaiono mai. Il salvataggio prova il candidato con una decisione rappresentativa. Un modello che non è di decisione, rifiuta la richiesta, restituisce una risposta non valida o impiega più di 5 secondi viene rifiutato, e il modello attuale resta in uso. Se il catalogo non può essere caricato, ogni modifica viene rifiutata. Le istanze self-hosted senza IA gestita non hanno un catalogo della piattaforma e mantengono il modello predefinito, Jev.

Le nuove decisioni usano il modello salvato entro circa un minuto su ogni processo del server. Se il modello fallisce o risponde sotto la soglia di confidenza, la decisione ripiega sul modello LLM proprio della funzione, come prima. La soglia è stata calibrata su Jev e gli altri modelli di decisione distribuiscono la confidenza in modo diverso: dopo un cambio, controlla la concordanza per modello nella vista di database `ai_decision_evaluations_weekly`. Le righe di utilizzo registrano il modello che ha risposto.

## Configurare le relazioni di Smart Fill {#smart-fill-relations}

Dopo il salvataggio di un ticket, Smart Fill può indicizzarlo e collegarlo ai ticket correlati. Due campi in **Modelli**, sezione **Automazioni**, regolano questo lavoro:

- **Embedding dei ticket** sceglie il modello che trasforma titolo e descrizione dei ticket in vettori. Il valore predefinito è `openai/text-embedding-3-small`. Cambiarlo avvia una nuova versione dell’indice: vettori vecchi e nuovi non vengono mai confrontati. Il job orario `/api/cron/issue-index` indicizza poi i ticket esistenti, 100 per esecuzione, addebitando il proprietario di ogni progetto; non crea mai relazioni. Lo stesso modello trasforma in vettore ogni interrogazione della ricerca per significato, con le impostazioni del provider IA del membro che cerca, e le interrogazioni vengono confrontate solo con i vettori della versione attuale dell’indice. Finché un ticket non viene reindicizzato, la ricerca dei ticket correlati e la ricerca per significato lo raggiungono solo tramite le sue parole. Lo stesso job converte in vettori cifrati quelli salvati in chiaro non appena il loro progetto inizia a cifrare.
- **Modello di decisione delle relazioni** è il modello LLM di riserva che risponde alle decisioni sulle relazioni quando il [modello di decisione](#decision-model) fallisce o non è sicuro, come il modello LLM proprio di ogni funzione. Il valore predefinito è `deepseek/deepseek-v4-flash`.

I campi di embedding e di trascrizione rifiutano al salvataggio un modello della famiglia sbagliata, per esempio un modello di chat in un campo di embedding, e il modello attuale resta in uso. Questo controllo richiede il catalogo della piattaforma: se non può essere caricato, come su un’istanza self-hosted senza IA gestita, la scelta non può essere verificata e viene accettata. Per i membri che eseguono le automazioni con la propria chiave, i valori predefiniti per provider includono `issue_embedding_model`: `text-embedding-3-small` per OpenAI e `gemini-embedding-001` per Google.

## Mantenere responsabilità operative {#responsibilities}

Rimangono tue responsabilità privilegi minimi, recupero MFA, segreti, backup, conservazione, incidenti e costi. La console non sostituisce il ripristino di database e Storage né la configurazione SMTP. Se l’accesso viene rifiutato, controlla email confermata, allowlist, MFA e sessione prima di cambiare la configurazione. Una sessione revocata o un account bloccato non conserva i privilegi grazie a un JWT ancora valido. Evita screenshot con dati privati di altri utenti, fattori MFA o dettagli finanziari.
