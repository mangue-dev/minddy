---
{
  "id": "views-and-filters",
  "locale": "it",
  "title": "Salvare una vista del proprio lavoro",
  "summary": "Filtra e ordina i ticket senza modificarne le proprietà salvate.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "navigation",
    "search-and-shortcuts"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-view-filters.png",
      "alt": "Filtri manuali di una vista e menu di ordinamento.",
      "caption": "Filtra per proprietà dei ticket o scegli un ordine. Il campo IA è facoltativo per questi comandi manuali.",
      "revision": 1,
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
    "views-and-filters-steps"
  ]
}
---

## Creare e salvare la vista {#views-and-filters}

Parti da un tabellone di progetto o da una superficie personale di ticket tra progetti. Usa filtri, ordinamento e controlli di visualizzazione per scegliere il lavoro necessario. Controlla l’ambito prima di salvare: una vista personale e una vista di progetto non hanno lo stesso confine di accesso.

Filtra per proprietà supportate, come stato, assegnatario, priorità, categorie o obiettivo. Ordina il risultato per rendere chiara la prossima azione. Nel kanban, i ticket restano raggruppati per stato; cambiare una vista non ne modifica stato o assegnazione.

Salva la vista con un nome che ne descriva lo scopo, selezionala di nuovo dalla navigazione e verifica i filtri. Modifica o rimuovi la vista salvata quando cambia il suo scopo. Condividere una vista è un’operazione di pubblicazione separata con proprie regole di permessi e revoca.

![Filtri manuali di una vista e menu di ordinamento.](/documentation/it/work-view-filters.png)

## Risolvere risultati vuoti o inattesi {#view-recovery}

Controlla tutti i filtri, il progetto attivo e la tua appartenenza quando mancano ticket previsti. Rimuovi i filtri restrittivi prima di supporre che i dati siano stati eliminati. Dopo una modifica, un ticket può legittimamente uscire da una vista filtrata. Cerca il suo identificativo o usa un tabellone di progetto senza filtri per controllare i valori salvati.

Una vista salvata non è una copia dei ticket. Eliminare la vista rimuove quella configurazione, mentre eliminare i ticket selezionati cambia il lavoro del progetto sottostante.
