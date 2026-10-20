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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-693 project roles",
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
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/min693_it with agent:/root (it MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configurare e riempire il ciclo {#personal-cycle}

Attiva i cicli in Impostazioni dell’account → Cicli, poi apri Ciclo dalla navigazione personale. Appartiene al tuo account e può contenere i ticket assegnati a te nei progetti in cui sei il proprietario o un Membro. I lettori non possono ricevere assegnazioni, quindi un progetto che ti limiti a leggere non contribuisce con alcun lavoro. Non è uno sprint del progetto e non appartiene a un obiettivo del team.

Scegli una durata di una o due settimane, il giorno d’inizio, da uno a quattro cicli futuri e un’intensità leggera, media o elevata. Queste impostazioni definiscono il tuo periodo e la capacità prevista. I controlli di acquisizione automatica stabiliscono se i ticket assegnati entrano nel ciclo attuale quando vengono avviati o completati.

Il ciclo attuale viene riempito automaticamente una volta con il lavoro idoneo. Per aggiungere un ticket a mano, usa l’azione del ciclo nel suo menu e scegli il periodo attuale o successivo, se disponibile. L’aggiunta assegna il ticket al proprietario del ciclo senza cambiarne lo stato. I ticket in Triaggio, Fatto, Annullata o Duplicato non possono essere aggiunti con questa azione. Controlla l’assegnatario e i blocchi dopo aver aggiunto lavoro. Rimuovere un ticket dal ciclo lo mantiene nel progetto.

![Ticket dimostrativo nel backlog del ciclo personale.](/documentation/it/reader-cycle.png)

## Concludere o adattare il periodo {#cycle-results}

Aggiorna gli stati durante il lavoro e confronta quanto è completato con quanto rimane. Al cambio di periodo, i ticket idonei non completati dei cicli passati vengono trasferiti automaticamente al ciclo attuale; l’assegnazione rimane invariata. Il trasferimento non li segna come completati. Usa il selettore delle date per consultare i cicli passati e futuri. Queste viste sono in sola lettura; il ciclo attuale permette modifiche.

Se un prerequisito viene aggiunto al ciclo attuale per mantenere coerenti le dipendenze, controlla il motivo prima di rimuoverlo. Un ticket che scompare dopo il completamento può essere ancora visibile nel lavoro completato del ciclo o reperibile tramite identificativo. Le impostazioni dei cicli dell’account riguardano la tua pianificazione, non il ciclo personale di un altro membro.
