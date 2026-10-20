---
{
  "id": "personal-statistics",
  "locale": "it",
  "title": "Statistiche personali",
  "summary": "Confronta attività completata e misure di tempo entro il loro ambito effettivo.",
  "topic": "Pianificare e trovare lavoro",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-737 account settings reorganization; UI/UX refinements batch: account settings open on Preferences",
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (12-month headline deduplication: get_user_stats migration 20270109200067, lib/stats-derive.ts and a production read of one account (685 events, 603 distinct issues); no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: text revised from source review of components/settings/account-settings-page.tsx and components/stats/profile-statistics.tsx; figure personal-statistics-steps recaptured on 2026-10-19 in all six locales from the local candidate (now personal-statistics-workflow.png, demo history mirrored into the statistics ledger by captures/world/seed/018-statistiques.mjs) and inspected; the grid crops to the most recent weeks that fit; no other browser walkthrough); agent:/root (UI/UX refinements batch, account settings opening tab: source review of ACCOUNT_SETTINGS_DEFAULT_TAB in lib/settings-sections.ts, the profile entry in components/app-sidebar.tsx and the /statistics redirect to the Profile tab; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (it headline deduplication sentence and retained-meaning self-review; agent review, not human acceptance); agent:/root (it MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (it translation of the account settings opening tab changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Leggere le statistiche personali di lavoro"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/it/personal-statistics-workflow.png",
      "alt": "Statistiche del profilo con la striscia di cifre, la griglia di attività di 12 mesi, le ripartizioni per progetto e categoria e il ritmo di lavoro.",
      "caption": "Storico reale dell’account dimostrativo: sei ticket completati in due progetti, trenta ticket creati, nessuna attività del taccuino spuntata.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        999
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Aprire e leggere le statistiche {#personal-statistics}

Le tue statistiche si trovano nella scheda **Profilo** delle impostazioni dell’account. Scegli il tuo nome in cima al menu dell’account per aprirla direttamente. **Impostazioni account** si apre su **Preferenze**; da lì, seleziona **Profilo**, la prima scheda. Le statistiche compaiono sotto l’avatar, il nome e l’email. Il vecchio indirizzo `/statistics` apre ora questa scheda.

Per prima viene una fascia di sei valori: **Completato**, **Attività controllate**, **Creato**, **Progetti**, **Serie più lunga** e **Serie attuale**. Sostituisce la vecchia sezione dei totali complessivi. Sotto trovi il numero dei 12 mesi e la griglia delle attività, poi **Dove è andato il tuo lavoro**, con le suddivisioni per progetto, categoria e obiettivo, e **Ritmo di lavoro**, con **Carico corrente**, **Ticket per ciclo**, **Divario tra i dazi** (lo scarto dalla scadenza) e **Ripartizione per sforzo**. **Ticket per ciclo**, **Divario tra i dazi** e **Ripartizione per sforzo** compaiono solo quando hanno dati. La scheda mostra i periodi configurati; non offre un filtro delle date per scegliere un altro intervallo. Riepiloga il tuo lavoro senza creare una classifica del rendimento degli altri membri.

Usa il numero di ticket completati, il ritmo, i giorni attivi, le serie e le misurazioni del tempo per esaminare la tua attività. La griglia delle attività conta gli eventi di completamento dei ticket e delle attività del taccuino, raggruppati per giorni di calendario nel tuo fuso orario. La griglia non scorre mai: mostra le settimane più recenti che entrano nello schermo, quindi un telefono mostra meno mesi di un computer. Un giorno attivo ha almeno uno di questi eventi; la serie attuale tollera che oggi sia ancora vuoto, ma termina al successivo giorno vuoto. Il valore **Completato** conta una sola volta ciascun identificativo: spostare due volte lo stesso ticket a Fatto conta una volta sola, quindi il numero di eventi e il totale di ticket distinti rispondono a domande diverse. Anche il numero sopra la griglia conta ogni ticket una sola volta nei suoi 12 mesi: un ticket completato di nuovo segna ciascuno dei suoi giorni nella griglia, ma aggiunge un solo ticket al numero.

Il tempo per impegno è la mediana del tempo trascorso dal primo passaggio registrato di un ticket a In corso fino al completamento. Si considerano ticket idonei nello stato Fatto, assegnati a te, con un impegno ed entrambi i timestamp. Comprende il tempo di attesa; non è un cronometro delle ore lavorate. La vista **Numero di ticket** mostra la dimensione del campione utilizzato. Una mediana assente può indicare che non ci sono misurazioni idonee, non una durata pari a zero.

Prima di confrontare i valori, leggi l'unità e il periodo indicati in ogni sezione.

## Interpretare dati scarsi o cambiamenti {#statistics-limits}

Un periodo vuoto può indicare che non c'è lavoro completato corrispondente oppure che l'attività è insufficiente. Non dimostra che l'account non abbia ticket. Cambiamenti nelle etichette di impegno, nell'ambito o nel tipo di lavoro possono modificare il confronto senza dimostrare che sei diventato più veloce o più lento.

Numo può leggere le tue statistiche con strumenti di sola lettura e spiegare gli stessi numeri. Anche l'accesso all'utilizzo del piano e alle esecuzioni recenti è di sola lettura: riferire il tuo budget non lo modifica. Per un problema di costi dell'IA, apri le schermate di utilizzo e le impostazioni dell'account invece di cambiare l'impegno di un ticket per nascondere la misurazione.


![Statistiche del profilo con la striscia di cifre, la griglia di attività di 12 mesi, le ripartizioni per progetto e categoria e il ritmo di lavoro.](/documentation/it/personal-statistics-workflow.png)
