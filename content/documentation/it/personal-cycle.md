---
{
  "id": "personal-cycle",
  "locale": "it",
  "title": "Cicli personali",
  "summary": "Seleziona lavoro tra progetti per un periodo di pianificazione di una o due settimane.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W12"
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
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "views",
    "issues"
  ],
  "aliases": [],
  "tags": [
    "Pianificare un ciclo personale"
  ],
  "figures": [
    {
      "id": "personal-cycle-steps",
      "kind": "screenshot",
      "src": "/documentation/it/reader-cycle.png",
      "alt": "Ticket dimostrativo nel backlog del ciclo personale.",
      "caption": "L’aggiunta ha assegnato il ticket al titolare del ciclo e mantenuto lo stato backlog.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configurare e riempire il ciclo {#personal-cycle}

Attiva i cicli in Impostazioni dell’account → Cicli, poi apri Ciclo dalla navigazione personale. Appartiene al tuo account e può contenere ticket di più progetti a cui hai accesso. Non è uno sprint del progetto e non appartiene a un obiettivo del team.

Scegli una durata di una o due settimane, il giorno d’inizio, da uno a quattro cicli futuri e un’intensità leggera, media o elevata. Queste impostazioni definiscono il tuo periodo e la capacità prevista. I controlli di acquisizione automatica stabiliscono se i ticket assegnati entrano nel ciclo attuale quando vengono avviati o completati.

Il ciclo attuale viene riempito automaticamente una volta con il lavoro idoneo. Per aggiungere un ticket a mano, usa l’azione del ciclo nel suo menu e scegli il periodo attuale o successivo, se disponibile. L’aggiunta assegna il ticket al proprietario del ciclo senza cambiarne lo stato. I ticket in Triaggio, Fatto, Annullata o Duplicato non possono essere aggiunti con questa azione. Controlla l’assegnatario e i blocchi dopo aver aggiunto lavoro. Rimuovere un ticket dal ciclo lo mantiene nel progetto.

![Ticket dimostrativo nel backlog del ciclo personale.](/documentation/it/reader-cycle.png)

## Concludere o adattare il periodo {#cycle-results}

Aggiorna gli stati durante il lavoro e confronta quanto è completato con quanto rimane. Al cambio di periodo, i ticket idonei non completati dei cicli passati vengono trasferiti automaticamente al ciclo attuale; l’assegnazione rimane invariata. Il trasferimento non li segna come completati. Usa il selettore delle date per consultare i cicli passati e futuri. Queste viste sono in sola lettura; il ciclo attuale permette modifiche.

Se un prerequisito viene aggiunto al ciclo attuale per mantenere coerenti le dipendenze, controlla il motivo prima di rimuoverlo. Un ticket che scompare dopo il completamento può essere ancora visibile nel lavoro completato del ciclo o reperibile tramite identificativo. Le impostazioni dei cicli dell’account riguardano la tua pianificazione, non il ciclo personale di un altro membro.
