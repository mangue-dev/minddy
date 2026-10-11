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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (it translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
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
      "alt": "Routine di evento con condizioni E/O annidate.",
      "caption": "Dimostrazione locale dell’editor effettivo degli attivatori. Nessuna routine è stata salvata o eseguita.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        788,
        1339
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

Solo il proprietario del progetto può creare, modificare o attivare una routine. Apri Routine, scegli un progetto di cui sei proprietario e scrivi le istruzioni per Numo. Menziona ticket, pagine o obiettivi pertinenti. Ogni esecuzione ha una conversazione Numo privata, una cronologia, gli strumenti Minddy e una delega di codice facoltativa. I worker usano le impostazioni del proprietario; il repository serve solo per lavorare sul codice.

Scegli un attivatore:

- **Pianificazione:** frequenza giornaliera, settimanale o mensile, ora e il tuo fuso orario. Controlla l’anteprima della prima esecuzione.
- **Evento:** creazione di ticket, ingresso in uno stato specifico, assegnazione, commento su un ticket seguito o ricezione di feedback. Seleziona stato, persona o ticket quando richiesto. L’attivatore di stato comprende i ticket creati direttamente in quello stato. L’assegnazione richiede un cambio effettivo della persona assegnata.
- **Voce di database:** scegli un database di pagine del progetto. Creazione, duplicazione, importazione di database o spostamento nel database contano come arrivo. Ripristinare una voce non crea un nuovo arrivo.

Se necessario, imposta un’attesa dopo l’evento da 0 a 120 minuti. Conserva il fuso orario nel contesto di Numo. Le routine di evento e database attendono arrivi futuri senza una prossima data pianificata. L’elaborazione automatica richiede lo scheduler dell’istanza; l’avvio manuale resta disponibile.

## Costruire condizioni che possono attendere {#conditions}

Usa **Aggiungi condizione** e **Aggiungi gruppo** per combinare **Tutte le condizioni** (E) e **Una qualsiasi condizione** (O). Scegli stato, persona assegnata, categoria, priorità o impegno; per un database, una proprietà tipizzata. Seleziona operatore compatibile e valore. Persone, categorie e database devono appartenere al progetto. Le condizioni sono limitate a sei livelli annidati e 64 nodi, senza espressioni eseguibili.

Esempio: ingresso in Triage E categoria Backend E (una persona è assegnata O la priorità è Alta). Un ticket senza categoria rimane in attesa. Aggiungere Backend in seguito può avviare l’esecuzione. Un’attesa già consumata non può avviare una seconda esecuzione. Uscire dallo stato specificato la annulla; rientrarvi ne crea una nuova. Anche una riassegnazione sostituisce l’attesa precedente.

Una voce senza la proprietà richiesta attende una modifica che soddisfi il filtro. Eliminare una proprietà referenziata o cambiarne il tipo mostra un errore di filtro: correggi le condizioni prima di proseguire. L’attesa si applica anche quando il filtro diventa vero più tardi. La ricezione di feedback include contenuti privati e in revisione; Numo non li pubblica e non aggira la moderazione.

![Routine di evento con condizioni E/O annidate.](/documentation/it/scheduled-routines-workflow.png)

## Gestire e verificare le esecuzioni {#runs}

Apri la routine per esaminare le attese, modificare istruzioni o attivatore, metterla in pausa o leggere le esecuzioni. Pausa, eliminazione e cambi di configurazione invalidano le attese. La riattivazione ascolta eventi futuri senza riprodurre vecchi arrivi. L’avvio manuale funziona con ogni attivatore senza attendere il suo evento e consuma budget.

Ogni esecuzione usa il budget IA del proprietario con un limite predefinito del 15 % del budget mensile, comprendendo Numo e worker delegati. Apri la conversazione per leggere origine, risultato, verifiche, domande e lavoro delegato. Rispondi nella stessa conversazione quando è necessario il tuo intervento; il budget residuo resta disponibile. Esamina i risultati salvati prima di cambiare il limite o riprovare. Dopo un cambio di proprietario, la routine del precedente proprietario non può avviare nuovo lavoro; creane una come proprietario attuale.

Le automazioni archiviate appaiono come proposte in pausa quando il proprietario apre Routine. Leggi la [guida alla transizione](/docs/automation-settings) prima di attivarle.

Il limite si applica quando è disponibile un budget mensile incluso; una modalità illimitata con chiave personale non riceve un budget mensile artificiale.
