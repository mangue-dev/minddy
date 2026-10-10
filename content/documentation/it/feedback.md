---
{
  "id": "feedback",
  "locale": "it",
  "title": "Feedback",
  "summary": "Pubblica una bacheca di feedback, segui le richieste, modera i contributi e collega i feedback accettati al lavoro del progetto.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor",
    "member"
  ],
  "workflows": [
    "F01",
    "F02",
    "F03",
    "F04",
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json",
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "components/feedback/feedback-settings-shared.tsx",
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/premerge-en-fr-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "app/f/[token]/voice/route.ts",
      "app/f/[token]/feedback-board-client.tsx",
      "lib/server/feedback/voice.ts",
      "lib/server/feedback/voice-limits.ts",
      "supabase/migrations/20270106320000_atomic_public_feedback_and_share_limits.sql",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-it-pt-BR-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root with agent:/root/review_it_pt (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun); agent:/root (MIN-670 source, it wording and new-control review; existing procedural evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root/review_it_pt with agent:/root (it pre-merge wording, correction and retained-meaning review); agent:/root (MIN-670 source, it wording and new-control review; existing procedural evidence retained)",
    "date": "2026-10-10"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "publish-a-feedback-board",
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views"
  ],
  "tags": [
    "Pubblicare una bacheca feedback",
    "Inviare, votare e seguire feedback",
    "Esaminare feedback in privato e rispondere pubblicamente",
    "Unire feedback e collegarlo alla consegna",
    "Aggiungere pagine e viste pubbliche alla bacheca"
  ],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/publish-a-feedback-board-workflow.png",
      "alt": "Bacheca pubblica dei feedback attiva, con identità SSO locale configurata e URL nascosto.",
      "caption": "Il proprietario attiva la bacheca e sceglie l’identità dei visitatori. Questo esempio usa un firmatario SSO locale; l’URL e il segreto di firma sono nascosti.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        378
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/submit-and-follow-feedback-workflow.png",
      "alt": "Modulo di feedback del visitatore con titolo, descrizione e visibilità pubblica attivata.",
      "caption": "Un visitatore identificato invia un’esigenza e ne sceglie la visibilità. L’esempio è stato realmente inviato con la revisione automatica disattivata.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        625,
        394
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "feedback-objective-selection",
      "kind": "screenshot",
      "src": "/documentation/it/feedback-objective-selection.png",
      "alt": "Anteprima dei componenti di selezione dell’obiettivo per un feedback e un’integrazione, entrambi impostati su Docs.",
      "caption": "Selettori dell’obiettivo con dati dimostrativi. I nuovi feedback ereditano l’impostazione dell’integrazione.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        680,
        301
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/feedback-pages-and-views-workflow.png",
      "alt": "Guida ai feedback pubblicata e selezionata nella navigazione della bacheca, leggibile senza accesso.",
      "caption": "Pubblica una pagina, attiva le schede delle pagine e selezionala per la bacheca. Questa pagina dimostrativa è stata aperta anonimamente; il suo URL opaco mantiene `noindex`.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1148,
        388
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "feedback-objective-selection",
    "feedback-pages-and-views-workflow"
  ]
}
---

Il feedback collega le richieste dei visitatori al lavoro di revisione e consegna del team. Il proprietario configura la bacheca pubblica; i visitatori inviano e seguono le richieste, mentre i membri le moderano o le collegano ai ticket. Gestisci separatamente risposte pubbliche, note interne e condivisioni di pagine o viste.

## Pubblicare una bacheca feedback {#publish-a-feedback-board}

Come proprietario, apri Feedback nelle impostazioni del progetto. Completa la configurazione se non esiste ancora una bacheca, quindi attiva il canale della bacheca pubblica. Copia l’URL pubblico e aprilo in un browser senza sessione per controllare la vista dei visitatori. I membri possono consultare le impostazioni, ma non modificare la pubblicazione, rinnovare i token o gestire il segreto SSO.

Scegli se i visitatori si identificano con un codice email o tramite il SSO configurato. Configura commenti pubblici, visualizzazione delle categorie e schede delle pagine o viste pubbliche selezionate. Controlla i dati visibili prima di distribuire l’URL. I visitatori possono leggere senza identificarsi; inviare feedback, votare e commentare richiede un’identità sulla bacheca. Le rappresentazioni pubbliche non espongono email o nome reale dei visitatori, ma il team può gestire privatamente il feedback identificato.

### Separare pubblicazione e acquisizione {#channels}

Disattivare la bacheca rende le sue pagine inaccessibili ai visitatori. L’acquisizione da server a server usa una chiave di integrazione feedback separata e può continuare senza una bacheca pubblica. La scelta di visibilità di un feedback, lo stato di revisione e lo stato di spam ne determinano anche la visibilità: attivare la bacheca da solo non pubblica ogni feedback.

La revisione facoltativa di Numo riguarda il feedback inviato e dipende dalle impostazioni di progetto e istanza, dai provider e dal budget del proprietario. Se attiva, gli invii attendono la revisione prima della pubblicazione; se disattivata, non restano in attesa di una revisione che non avverrà. Controlla la coda dopo un invio dimostrativo. Numo invia risposte pubbliche solo su richiesta esplicita.

![Bacheca pubblica dei feedback attiva, con identità SSO locale configurata e URL nascosto.](/documentation/it/publish-a-feedback-board-workflow.png)

## Inviare, votare e seguire feedback {#submit-and-follow-feedback}

Apri l’URL pubblico della bacheca. Puoi leggere i feedback pubblici senza un account minddy. Per inviare, votare o commentare, identificati con il codice email della bacheca o il link SSO del prodotto. La consegna del codice dipende dal servizio email dell’istanza. Un codice dura dieci minuti e consente cinque tentativi; attendi almeno sessanta secondi prima di richiederne un altro. Non condividere mai il codice.

Cerca richieste esistenti prima di pubblicare. Scrivi un titolo preciso e descrivi il bisogno e il contesto. Il titolo ammette 200 caratteri e il corpo 10.000. L’opzione pubblica è selezionata per impostazione predefinita; deselezionala per inviare la richiesta privatamente al team. Prima dell’invio, controlla che il testo non contenga segreti. La moderazione facoltativa può mantenere la richiesta in attesa prima che appaia pubblicamente.

Usa il microfono nel modulo di invio per dettare titolo e descrizione. Prima identificati sulla bacheca, consenti l’accesso al microfono, poi interrompi la registrazione e controlla il testo prima di scegliere Invia. La dettatura compila la bozza; non invia la richiesta. La disponibilità dipende dalla configurazione vocale dell’istanza, dal funzionamento dei provider e dal budget IA del proprietario del progetto. L’utilizzo viene addebitato al proprietario secondo le sue impostazioni dei provider, anziché all’account del visitatore.

Le registrazioni sulla bacheca pubblica sono limitate a 10 MiB. La trascrizione consente 20 richieste per visitatore identificato e 40 per indirizzo IP all’ora, per bacheca; l’interpretazione della bozza ha un limite separato di 40 richieste per visitatore all’ora. Questi limiti sono distinti da quelli della dettatura dell’account. Se compare un messaggio di limite raggiunto, attendi prima di riprovare; se la funzione vocale non è disponibile, scrivi la richiesta.

### Votare, commentare e seguire {#follow}

Vota una richiesta esistente anziché duplicarla. Ogni identità ha un voto per feedback. I commenti richiedono identificazione e commenti pubblici abilitati; un commento pubblico ammette 5.000 caratteri. Puoi eliminare il tuo commento e il team può moderare i commenti pubblici.

Apri Il mio feedback per ritrovare richieste e voti secondo ciò che può vedere la tua identità corrente. Leggi lì, o nella richiesta, lo stato pubblico e le risposte del team. Le note interne non sono risposte pubbliche. Se il SSO è scaduto, torna tramite un nuovo link del prodotto; cambiare browser o identità può cambiare l’elenco personale.

![Modulo di feedback del visitatore con titolo, descrizione e visibilità pubblica attivata.](/documentation/it/submit-and-follow-feedback-workflow.png)

## Esaminare feedback in privato e rispondere pubblicamente {#moderate-feedback}

I membri aprono Feedback nel progetto e scelgono una richiesta dalla coda di revisione o dall’elenco. Leggi l’invio originale, la scelta pubblica o privata, lo stato di revisione e gli eventuali suggerimenti di moderazione o duplicati. Puoi chiarire titolo e corpo canonici conservando i testi originali inviati. Assegna categorie e uno stato pubblico adatto; lo spam non appare mai sulla bacheca pubblica. Una richiesta privata resta distinta da una richiesta pubblica soltanto in attesa.

La traduzione facoltativa compare accanto al testo originale per il team; la bacheca pubblica conserva il feedback così com’è stato scritto. Verifica le classificazioni IA prima di farvi affidamento. Se un feedback è collegato a una issue, il suo stato dipende da quella issue e non può essere modificato autonomamente.

### Note e risposte pubbliche {#responses}

Scegli la discussione interna per le note del team. Le risposte pubbliche sono visibili ai visitatori: controlla la visibilità prima di inviare. Le risposte ereditano la visibilità del thread; selezionare la modalità interna nel composer non rende privata una risposta in un thread pubblico. Le risposte pubbliche di Numo richiedono una richiesta esplicita; menzionarlo in un commento pubblico non attiva una risposta automatica.

I membri possono eliminare commenti pubblici per moderarli. Solo l’autore può modificarli e il team non riscrive mai le parole dei visitatori. I commenti interni mantengono le regole che riservano queste azioni all’autore. Dopo una risposta pubblica o un intervento di moderazione, verifica la bacheca senza sessione per confermare la visibilità prevista.

### Scegliere un obiettivo per un feedback {#feedback-objective}

Come membro del progetto, scegli **Obiettivo** nelle proprietà del feedback o quando lo crei internamente. Scegli **Nessuna** per rimuovere il collegamento. L’obiettivo deve appartenere allo stesso progetto. Apri l’obiettivo per vedere i feedback collegati e selezionane uno per leggere la discussione. L’associazione è interna, non espone obiettivi privati sulla bacheca pubblica e non contribuisce all’avanzamento dei ticket.

Il proprietario può scegliere un obiettivo facoltativo creando un’integrazione di feedback in **Impostazioni → Integrazioni**, oppure modificarlo accanto a un’integrazione esistente. I nuovi invii API ereditano l’obiettivo, anche con `analyze: false`. Cambiare l’impostazione non sposta i feedback esistenti. Se l’obiettivo è nel cestino, scegline uno attivo o rimuovi l’impostazione prima di un nuovo invio. Numo non sceglie mai un obiettivo durante la revisione dei feedback. Chiedigli esplicitamente di collegare una richiesta o rimuoverne il collegamento.

La conversione crea un ticket con l’obiettivo e le categorie del feedback. Puoi modificarli nel modulo di creazione. Senza un obiettivo scelto, il campo resta vuoto anche con Smart Fill attivo. Modificare in seguito l’obiettivo del feedback non sposta un ticket già collegato. Le fusioni richiedono lo stesso obiettivo per entrambe le richieste, anche quando nessuna ne ha uno. Allinea prima gli obiettivi se il team decide che descrivono lo stesso bisogno.

Un gruppo unito condivide un solo obiettivo. Modificare l’obiettivo della richiesta principale aggiorna anche le richieste assorbite, così il gruppo può essere unito nuovamente.

![Anteprima dei componenti di selezione dell’obiettivo per un feedback e un’integrazione, entrambi impostati su Docs.](/documentation/it/feedback-objective-selection.png)

## Unire feedback e collegarlo alla consegna {#feedback-to-issue}

Come membro del progetto, apri la richiesta e scegli di unirla a una richiesta canonica esistente nello stesso progetto. Leggi prima entrambi i bisogni: parole simili non dimostrano che il risultato atteso sia lo stesso. La richiesta corrente diventa il duplicato, i voti vengono uniti per identità e il duplicato reindirizza alla richiesta canonica. Controlla l’evento di unione nell’attività; il comando di annullamento usa quell’evento. Rifiuta un suggerimento IA errato anziché accettarlo solo per svuotare la coda.

### Creare o collegare lavoro {#work}

Trasforma la richiesta in una nuova issue se il lavoro non è già tracciato. Controlla i campi di creazione prima di confermare; senza campi forniti, la promozione crea per impostazione predefinita lavoro nel `backlog`. Se esiste già una issue, usa invece il collegamento. Un feedback già collegato non può essere promosso di nuovo. Rimuovere il collegamento conserva l’ultimo stato pubblico e interrompe la relazione con la issue.

Lo stato collegato segue quello della issue: `triage`/`backlog`/`duplicate` → `open`; `todo` → `planned`; `in_progress`/`in_review` → `in_progress`; `done` → `shipped`; `canceled` → `declined`. Spostare il lavoro nel `backlog` riapre anche lo stato del feedback. Dopo una modifica, controlla la issue collegata e la richiesta senza sessione.

Le notifiche al team per nuovo feedback dipendono dalla fonte e dal passaggio di revisione. Non promettere a chi vota un’email automatica per ogni unione o aggiornamento della issue; può consultare stato pubblico e risposte in Il mio feedback. Il collegamento mostra l’avanzamento senza esporre la issue privata.


## Aggiungere pagine e viste pubbliche alla bacheca {#feedback-pages-and-views}

Come proprietario, pubblica prima la pagina del progetto desiderata o condividi la vista desiderata con visibilità pubblica. Controlla che non contenga informazioni private. Apri le impostazioni Feedback, abilita la famiglia di pagine o viste e seleziona ogni elemento da mostrare. Sono necessari sia l’interruttore della famiglia sia la selezione dei singoli elementi.

L’elenco delle impostazioni può contenere condivisioni protette, ma la navigazione pubblica include solo quelle di livello pubblico. Selezionare una pagina protetta non supera la protezione e non mostra il suo nome in una scheda della bacheca. Un elemento pubblicato in un altro progetto non fa parte delle schede di questo progetto.

### Verificare e rimuovere accesso {#visibility}

Apri la bacheca senza sessione. Segui le schede verso pagine e viste selezionate e controlla titoli e contenuti. Quando configurata, la navigazione è condivisa tra bacheca, viste pubbliche e pagine pubbliche; una scheda isolata non viene mostrata come navigazione.

Per rimuovere una scheda, deseleziona l’elemento o disattiva la sua famiglia. Questo rimuove la navigazione, non la condivisione sottostante. Revoca o modifica la condivisione stessa per togliere l’accesso dal link diretto. Disattivare la bacheca disattiva anche la navigazione associata, ma non revoca autonomamente ogni condivisione di pagina o vista. Dopo una modifica della pubblicazione, verifica sia la scheda della bacheca sia l’URL originale della condivisione.

![Guida ai feedback pubblicata e selezionata nella navigazione della bacheca, leggibile senza accesso.](/documentation/it/feedback-pages-and-views-workflow.png)
