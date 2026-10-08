---
{
  "id": "views",
  "locale": "it",
  "title": "Viste e filtri",
  "summary": "Salva una vista filtrata del lavoro accessibile, condividila in sola lettura e revoca l’accesso pubblico quando necessario.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13",
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/api/me/saved-views/route.ts",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "navigation",
    "pages",
    "permissions-and-public-links"
  ],
  "aliases": [
    "views-and-filters",
    "share-a-view"
  ],
  "tags": [
    "Salvare una vista del proprio lavoro",
    "Condividere e revocare una vista in sola lettura"
  ],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-view-filters.png",
      "alt": "Filtri manuali di una vista e menu di ordinamento.",
      "caption": "Filtra per proprietà dei ticket o scegli un ordine. Il campo IA è facoltativo per questi comandi manuali.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-share-view.png",
      "alt": "Finestra di condivisione di una vista con accesso privato selezionato.",
      "caption": "Accesso privato, protetto da password e pubblico sono scelte distinte. In questa schermata la vista rimane privata.",
      "revision": 4,
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
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Una vista salva filtri e ordinamento del lavoro a cui hai accesso, senza creare una copia dei ticket. Condividerla è un’azione separata: le viste globali tra progetti non sono condivisibili. Per una vista idonea del progetto, verifica il contenuto visibile al visitatore prima di distribuire il link.

## Salvare una vista del proprio lavoro {#views-and-filters}

Parti da un tabellone di progetto o da una superficie personale di ticket tra progetti. Usa filtri, ordinamento e controlli di visualizzazione per scegliere il lavoro necessario. Controlla l’ambito prima di salvare: una vista personale e una vista di progetto non hanno lo stesso confine di accesso.

Filtra per proprietà supportate, come stato, assegnatario, priorità, categorie o obiettivo. Ordina il risultato per rendere chiara la prossima azione. Nel kanban, i ticket restano raggruppati per stato; cambiare una vista non ne modifica stato o assegnazione.

Salva la vista con un nome che ne descriva lo scopo, selezionala di nuovo dalla navigazione e verifica i filtri. Modifica o rimuovi la vista salvata quando cambia il suo scopo. Condividere una vista è un’operazione di pubblicazione separata con proprie regole di permessi e revoca.

![Filtri manuali di una vista e menu di ordinamento.](/documentation/it/work-view-filters.png)

### Risolvere risultati vuoti o inattesi {#view-recovery}

Controlla tutti i filtri, il progetto attivo e la tua appartenenza quando mancano ticket previsti. Rimuovi i filtri restrittivi prima di supporre che i dati siano stati eliminati. Dopo una modifica, un ticket può legittimamente uscire da una vista filtrata. Cerca il suo identificativo o usa un tabellone di progetto senza filtri per controllare i valori salvati.

Una vista salvata non è una copia dei ticket. Eliminare la vista rimuove quella configurazione, mentre eliminare i ticket selezionati cambia il lavoro del progetto sottostante.

## Condividere e revocare una vista in sola lettura {#share-a-view}

Apri il menu di una vista idonea sul tabellone del progetto e scegli l’azione per condividerla. Serve l’accesso al progetto; una vista personale al suo interno può essere condivisa solo dal proprio utente. Le viste globali tra progetti non possono essere condivise. Controlla filtri e contenuti visibili prima di pubblicare. Scegli un link pubblico segreto oppure la protezione con password, quando disponibili; la password deve avere almeno otto caratteri. Copia il link generato solo dopo che la modifica è stata salvata correttamente.

Apri il link in una sessione del browser separata, senza il tuo account. Controlla il sottoinsieme di ticket, i campi e i contenuti collegati che un visitatore può vedere. Il link pubblico concede accesso in sola lettura alla vista, non appartenenza o permessi di modifica nel progetto.

Le schede condivise espongono titoli, descrizioni e proprietà visualizzate, compresi nomi degli assegnatari, categorie, nomi degli obiettivi, scadenze, ricorrenza ed eventuali link a piattaforme Git remote. La proiezione pubblica esclude i contenuti dei piani di implementazione e gli indirizzi email dei membri. Le etichette del padre e delle relazioni possono mostrare identificativi di ticket del progetto fuori dal filtro della vista. Controlla descrizioni, nomi e identificativi oltre alle colonne visibili; nascondere una proprietà della scheda non è uno strumento generale per oscurare contenuti riservati.

![Finestra di condivisione di una vista con accesso privato selezionato.](/documentation/it/work-share-view.png)

### Revocare e verificare {#revoke-view}

Torna ai controlli di condivisione e rendi la vista privata per revocarne la pubblicazione. Apri di nuovo il vecchio link senza autenticarti e controlla che l’accesso sia negato. La revoca non recupera copie o screenshot già salvati dal visitatore.

I link segreti delle viste usano il percorso di pubblicazione dei link privati e mantengono noindex. Questa regola limita la ricerca tramite motori di ricerca, ma non è una password. Mantieni privato il link se contiene informazioni sensibili e usa la protezione con password quando opportuno. Non confondere una vista condivisa dell’utente con la documentazione ufficiale indicizzata.

Se il risultato anonimo differisce dalle aspettative, controlla la vista salvata e la configurazione prima di inoltrare il link. Verifica nuovamente l’ambito dopo aver cambiato filtri o contenuti collegati.
