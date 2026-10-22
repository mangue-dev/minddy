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
  "revision": 8,
  "sourceRevision": 6,
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
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/cycle/cycle-empty-states.tsx",
      "components/global-board.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected it catalog; no behavior change, no new captures); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 8,
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

Attiva i cicli in **Impostazioni account** → **Cicli**, oppure con **Attiva cicli** nella scheda **Ciclo**. Apri questa scheda nella barra delle viste di **Tutti i ticket**, oppure cerca Ciclo nella palette dei comandi; la scheda **Ciclo** di un tabellone di progetto, contrassegnata da una freccia, porta allo stesso ciclo personale. Appartiene al tuo account e può contenere i ticket assegnati a te nei progetti in cui sei il proprietario o un Membro. I lettori non possono ricevere assegnazioni, quindi un progetto che ti limiti a leggere non contribuisce con alcun lavoro. Non è uno sprint del progetto e non appartiene a un obiettivo del team.

Scegli una durata di una o due settimane, il giorno d’inizio, da uno a quattro cicli futuri e un’intensità leggera, media o elevata. Queste impostazioni definiscono il tuo periodo e la capacità prevista. I controlli di acquisizione automatica stabiliscono se i ticket assegnati entrano nel ciclo attuale quando vengono avviati o completati.

Il ciclo attuale viene riempito automaticamente una volta con il lavoro idoneo. Per aggiungere un ticket a mano, usa l’azione del ciclo nel suo menu e scegli il periodo attuale o successivo, se disponibile. L’aggiunta assegna il ticket al proprietario del ciclo senza cambiarne lo stato. I ticket in Triage, Completato, Annullato o Duplicato non possono essere aggiunti con questa azione. Controlla l’assegnatario e i blocchi dopo aver aggiunto lavoro. Rimuovere un ticket dal ciclo lo mantiene nel progetto.

![Ticket dimostrativo nel backlog del ciclo personale.](/documentation/it/reader-cycle.png)

## Concludere o adattare il periodo {#cycle-results}

Aggiorna gli stati durante il lavoro e confronta quanto è completato con quanto rimane. Al cambio di periodo, i ticket idonei non completati dei cicli passati vengono trasferiti automaticamente al ciclo attuale; l’assegnazione rimane invariata. Il trasferimento non li segna come completati. Quando tutti i ticket del ciclo attuale sono chiusi, un avviso **Ciclo completato** offre **Riempi il ciclo** per aggiungere lavoro idoneo; il ciclo non viene riempito automaticamente durante il periodo. Usa il selettore delle date per consultare i cicli passati e futuri. Queste viste sono in sola lettura; il ciclo attuale permette modifiche.

Se un prerequisito viene aggiunto al ciclo attuale per mantenere coerenti le dipendenze, controlla il motivo prima di rimuoverlo. Un ticket che scompare dopo il completamento può essere ancora visibile nel lavoro completato del ciclo o reperibile tramite identificativo. Le impostazioni dei cicli dell’account riguardano la tua pianificazione, non il ciclo personale di un altro membro.
