---
{
  "id": "create-a-database",
  "locale": "it",
  "title": "Creare un database e le sue colonne",
  "summary": "Parti da un elenco vuoto, scegli i tipi di proprietà e aggiungi una prima voce.",
  "topic": "Pagine e database",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/it/database-property-types.png",
      "alt": "Selettore del tipo di colonna con testo, numero, selezioni, date, persone e casella di controllo.",
      "caption": "Scegli un tipo adatto ai valori da conservare.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-a-database-steps"
  ]
}
---

## Creare l’elenco {#create-a-database}

Come membro del progetto, apri Pagine, usa + e scegli un database. Un nuovo database ha il nome delle voci e nessuna colonna opzionale. Il banner «Nuovo database» offre la configurazione con Numo o l’importazione di un database esistente. La configurazione manuale resta disponibile senza IA. Scegliere la configurazione con Numo apre una richiesta preparata con questo database come contesto di pagina, dopo che la creazione è terminata. Controlla e invia la richiesta per chiedere la struttura necessaria; aprire la conversazione non completa la configurazione. Il lavoro effettivo dell’IA richiede un fornitore configurato e utilizzo disponibile oppure una chiave personale compatibile. Esamina lo schema e le voci risultanti prima di farvi affidamento.

Apri «Colonne» e scegli «Aggiungi colonna» oppure usa la colonna + sul bordo destro della tabella. Dai un nome alla colonna e scegli Testo, Numero, Selezione, Selezione multipla, Data di creazione, Data, Persone o Casella di controllo. Usa il selettore ricercabile per trovare il tipo. Salva, aggiungi una voce e verifica che la colonna appaia in tabella e nella pagina della voce.

## Scegliere i tipi e rispettare i limiti {#database-types}

Un database supporta fino a 30 colonne di proprietà oltre al nome della voce. Selezione consente un’opzione; Selezione multipla ne consente diverse, fino a 100 opzioni per colonna. Le celle di testo supportano 2.000 caratteri. Numero accetta decimali con segno, punto o virgola e rifiuta lettere. Data di creazione è il timestamp originale della voce e non è modificabile.

Persone seleziona membri del progetto, non indirizzi email arbitrari. I membri appena menzionati possono ricevere notifiche. Una voce di database è anche una pagina completa con normali contenuti, commenti e allegati.

Formule avanzate, automazioni e viste aggiuntive non sono disponibili. Scegli una proprietà di testo o un documento collegato quando i dati non rientrano in un tipo supportato; non descrivere una formula non supportata come una colonna funzionante.


![Selettore del tipo di colonna con testo, numero, selezioni, date, persone e casella di controllo.](/documentation/it/database-property-types.png)
