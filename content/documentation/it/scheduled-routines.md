---
{
  "id": "scheduled-routines",
  "locale": "it",
  "title": "Routine",
  "summary": "Avvia Numo con una pianificazione, un evento di ticket, un feedback ricevuto o una nuova voce di database.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 11,
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "components/routines/routines-panel.tsx",
      "components/routines/use-routine-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Pianificare e controllare una routine Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/scheduled-routines-workflow.png",
      "alt": "Modalità Programmato ed Evento, un gruppo di condizioni, icone dell’app e pulsanti informativi discreti.",
      "caption": "Dimostrazione locale dell’editor effettivo degli attivatori. Nessuna routine è stata salvata o eseguita.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        788,
        910
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Creare una routine {#scheduled-routines}

Solo il proprietario del progetto può creare, modificare o attivare una routine. Apri Routine, scegli un progetto di cui sei proprietario e scrivi le istruzioni per Numo. Menziona ticket, pagine o obiettivi pertinenti. Ogni esecuzione ha una conversazione Numo privata, una cronologia e gli strumenti Minddy. Le routine organizzano e seguono il lavoro, ad esempio un triage settimanale, una revisione dei ticket fermi o un riepilogo settimanale; non modificano il codice del repository.

Scegli **Programmato** o **Evento**. Gli arrivi in un database sono un’opzione dell’elenco degli eventi.

- **Programmato:** frequenza giornaliera, settimanale o mensile, ora e il tuo fuso orario. Controlla l’anteprima della prima esecuzione.
- **Evento:** creazione di ticket, ingresso in uno stato specifico, assegnazione, commento su un ticket seguito, ricezione di feedback o una nuova voce di database. Seleziona stato, persona o ticket quando richiesto. L’attivatore di stato comprende i ticket creati direttamente in quello stato. L’assegnazione richiede un cambio effettivo della persona assegnata. Un commento scritto da un lettore non avvia una routine sui commenti.

Per un arrivo in un database, scegli **Nuova voce nel database** nell’elenco degli eventi, poi un database di pagine del progetto. Creazione, duplicazione, importazione di database o spostamento nel database contano come arrivo. Ripristinare una voce non crea un nuovo arrivo.

Le **Condizioni** sono facoltative: senza filtri, ogni evento corrispondente può avviare la routine. Imposta il ritardo separatamente in **Momento di avvio**. I piccoli pulsanti informativi spiegano l’attesa e il ritardo. I selettori usano gli stessi indicatori di stato, priorità, categoria e persona di Minddy. Usa le frecce e Invio; gli elenchi lunghi includono la ricerca.

Se necessario, imposta un’attesa dopo l’evento da 0 a 120 minuti. Conserva il fuso orario nel contesto di Numo. Le routine di evento e database attendono arrivi futuri senza una prossima data pianificata. L’elaborazione automatica richiede lo scheduler dell’istanza; l’avvio manuale resta disponibile.

## Costruire condizioni che possono attendere {#conditions}

Usa **Aggiungi condizione** per creare un solo gruppo di massimo 16 condizioni. Scegli **Tutte le condizioni** (E) o **Qualsiasi condizione** (O) per l’intero gruppo. Seleziona stato, persona assegnata, categoria, priorità o impegno; per un database, la sua proprietà tipizzata. Scegli un operatore compatibile e un valore. Persone, categorie e database devono appartenere al progetto. Non è possibile aggiungere gruppi annidati. Le regole annidate salvate mantengono la propria logica; se non possono essere mostrate come un singolo gruppo equivalente, **Sostituisci condizioni** le elimina per creare un gruppo nuovo.

Esempio: ingresso in Triage, con tutte le condizioni che richiedono la categoria Backend e la priorità Alta. Un ticket che arriva senza categoria resta in attesa. Aggiungere Backend in seguito può avviare l’esecuzione. Un’attesa già consumata non può avviare una seconda esecuzione. Uscire dallo stato specificato la annulla; rientrarvi ne crea una nuova. Anche una riassegnazione sostituisce l’attesa precedente.

Una voce senza la proprietà richiesta attende una modifica che soddisfi il filtro. Eliminare una proprietà referenziata o cambiarne il tipo mostra un errore di filtro: correggi le condizioni prima di proseguire. L’attesa si applica anche quando il filtro diventa vero più tardi. La ricezione di feedback include contenuti privati e in revisione; Numo non li pubblica e non aggira la moderazione.

![Modalità Programmato ed Evento, un gruppo di condizioni, icone dell’app e pulsanti informativi discreti.](/documentation/it/scheduled-routines-workflow.png)

## Gestire e verificare le esecuzioni {#runs}

Apri la routine per esaminare le attese, modificare istruzioni o attivatore, metterla in pausa o leggere le esecuzioni. Nella sua pagina, il proprietario scrive l'istruzione direttamente (viene salvata mentre scrivi e resta uguale nelle tue schede e nei tuoi dispositivi aperti, anche quando Numo la riscrive), apre **Attivazione** per modificarla, sceglie il **Limite di spesa** e passa tra **Attiva** e **In pausa** dal badge di stato in alto. Pausa, eliminazione e cambi di configurazione invalidano le attese. La riattivazione ascolta eventi futuri senza riprodurre vecchi arrivi. L’avvio manuale funziona con ogni attivatore senza attendere il suo evento e consuma budget.

Fai clic con il tasto destro su una routine dell’elenco per aprire la sua ultima esecuzione senza selezionarla prima; **Apri l’ultima esecuzione** resta non disponibile se la routine non è mai stata eseguita. Dallo stesso menu il proprietario del progetto può anche scegliere **Esegui ora**, **Metti in pausa** o **Riattiva**, **Modifica** o **Sposta nel cestino**. **Riattiva** non è disponibile quando l’istanza non può pianificare routine. Gli altri membri vedono solo le voci che non modificano la routine. Per creare una routine, fai clic con il tasto destro su **Routine** nella barra laterale e scegli **Nuova routine**.

Tieni premuto Maiusc e fai clic sulle routine dell’elenco per selezionarne più di una; un clic nello spazio vuoto dell’elenco annulla la selezione. **Azioni** nella barra mobile, o Command+K su macOS o Ctrl+K sugli altri sistemi, esegue ora le routine selezionate di cui sei proprietario, le mette in pausa o le riattiva, o le sposta nel cestino dopo una conferma; le routine dei progetti che non ti appartengono restano invariate, e ogni esecuzione consuma utilizzo. **Chiedi a Numo** apre Numo con tutte le routine selezionate nel suo contesto.

Ogni esecuzione usa il budget IA del proprietario con un limite predefinito del 15 % del budget mensile, comprendendo ogni chiamata a Numo di quell’esecuzione. Apri la conversazione per leggere origine, risultato e domande. Rispondi nella stessa conversazione quando è necessario il tuo intervento; il budget residuo resta disponibile. Esamina i risultati salvati prima di cambiare il limite o riprovare. Quando la proprietà viene [trasferita](/docs/projects#transfer-ownership), le routine dell’ex proprietario nel progetto vengono sospese e non possono avviare nuovo lavoro; il nuovo proprietario crea le routine che devono proseguire.

Le automazioni di progetto delle versioni precedenti non vengono più eseguite e non sono convertite in routine. Leggi la [guida alla transizione](/docs/automation-settings) per ricreare un workflow come routine.

Il limite si applica quando è disponibile un budget mensile incluso; una modalità illimitata con chiave personale non riceve un budget mensile artificiale.
