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
  "revision": 10,
  "sourceRevision": 9,
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx",
      "components/stats/stats-hero.tsx"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (it/es catalog review recapture of personal-statistics-steps on 2026-10-22 from a local candidate of this branch against the preview demo account; images inspected; no form submitted); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance); agent:claude-code (it manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        984
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

Per prima viene una fascia di sei valori: **Completati**, **Attività spuntate**, **Creati**, **Progetti**, **Serie più lunga** e **Serie attuale**. Sostituisce la vecchia sezione dei totali complessivi. Sotto trovi il numero dei 12 mesi e la griglia delle attività, poi **Dove è andato il tuo lavoro**, con le suddivisioni per progetto, categoria e obiettivo, e **Ritmo di lavoro**, con **Carico attuale**, **Ticket per ciclo**, **Scarto dalla scadenza** (lo scarto dalla scadenza) e **Ripartizione per impegno**. **Ticket per ciclo**, **Scarto dalla scadenza** e **Ripartizione per impegno** compaiono solo quando hanno dati. La scheda mostra i periodi configurati; non offre un filtro delle date per scegliere un altro intervallo. Riepiloga il tuo lavoro senza creare una classifica del rendimento degli altri membri.

Usa il numero di ticket completati, il ritmo, i giorni attivi, le serie e le misurazioni del tempo per esaminare la tua attività. La griglia delle attività conta gli eventi di completamento dei ticket e delle attività del taccuino, raggruppati per giorni di calendario nel tuo fuso orario. La griglia non scorre mai: mostra le settimane più recenti che entrano nello schermo, quindi un telefono mostra meno mesi di un computer. Un giorno attivo ha almeno uno di questi eventi; la serie attuale tollera che oggi sia ancora vuoto, ma termina al successivo giorno vuoto. Il valore **Completati** conta una sola volta ciascun identificativo: spostare due volte lo stesso ticket a Completato conta una volta sola, quindi il numero di eventi e il totale di ticket distinti rispondono a domande diverse. Il numero sopra la griglia somma i ticket e le attività del taccuino che hai completato negli ultimi 12 mesi; passa sul numero per vederne la suddivisione in ticket, attività e giorni attivi. Anche questo numero conta ogni ticket una sola volta in quei 12 mesi: un ticket completato di nuovo segna ciascuno dei suoi giorni nella griglia, ma aggiunge un solo ticket al numero.

Il tempo per impegno è la mediana del tempo trascorso dal primo passaggio registrato di un ticket a In corso fino al completamento. Si considerano ticket idonei nello stato Completato, assegnati a te, con un impegno ed entrambi i timestamp. Comprende il tempo di attesa; non è un cronometro delle ore lavorate. La vista **Numero di ticket** mostra la dimensione del campione utilizzato. Una mediana assente può indicare che non ci sono misurazioni idonee, non una durata pari a zero.

Prima di confrontare i valori, leggi l'unità e il periodo indicati in ogni sezione.

## Interpretare dati scarsi o cambiamenti {#statistics-limits}

Un account che non ha ancora creato né completato un ticket, né spuntato un’attività del taccuino, vede **Non c'è ancora niente da misurare** al posto dei valori, con un pulsante **Nuovo ticket**, oppure **Crea il primo progetto** se non ha alcun progetto in cui creare un ticket. Un periodo vuoto può indicare che non c'è lavoro completato corrispondente oppure che l'attività è insufficiente. Non dimostra che l'account non abbia ticket. Cambiamenti nelle etichette di impegno, nell'ambito o nel tipo di lavoro possono modificare il confronto senza dimostrare che sei diventato più veloce o più lento.

Numo può leggere le tue statistiche con strumenti di sola lettura e spiegare gli stessi numeri. Anche l'accesso all'utilizzo del piano e alle esecuzioni recenti è di sola lettura: riferire il tuo budget non lo modifica. Per un problema di costi dell'IA, apri le schermate di utilizzo e le impostazioni dell'account invece di cambiare l'impegno di un ticket per nascondere la misurazione.


![Statistiche del profilo con la striscia di cifre, la griglia di attività di 12 mesi, le ripartizioni per progetto e categoria e il ritmo di lavoro.](/documentation/it/personal-statistics-workflow.png)
