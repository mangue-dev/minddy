---
{
  "id": "issue-dependencies",
  "locale": "it",
  "title": "Collegare dipendenze e ticket correlati",
  "summary": "Indica quale lavoro blocca un’altra attività e distingui le relazioni dalla gerarchia.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W05"
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
      "content/knowledge/core-tracker.md",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "sub-issues",
    "issue-statuses",
    "objective-dependencies-and-momentum"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-dependencies.png",
      "alt": "Ricerca di un ticket bloccante tramite identificativo.",
      "caption": "Scegli la direzione della relazione prima della destinazione. Il selettore è mostrato senza inviare la relazione.",
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
    "issue-dependencies-steps"
  ]
}
---

## Scegliere la relazione e la direzione {#issue-dependencies}

Apri i controlli delle relazioni di un ticket e cerca l’altro per titolo o identificativo. Scegli una relazione di blocco quando un’attività deve terminare prima che un’altra possa procedere. Se A blocca B, A è il prerequisito e B è bloccato da A. Una relazione di collegamento aggiunge contesto senza imporre quell’ordine.

Leggi entrambi gli identificativi e la direzione visualizzata prima di confermare. Per esempio, «Preparare l’endpoint» blocca «Collegare il client», non il contrario. Una dipendenza non rende nessuno dei ticket un sottoticket e una relazione padre-figlio non sostituisce una relazione di blocco.

![Ricerca di un ticket bloccante tramite identificativo.](/documentation/it/work-dependencies.png)

## Blocchi risolti ed ereditati {#blocker-state}

Gli stati finali Fatto, Annullata e Duplicato fanno smettere a un ticket di bloccare il lavoro. Le relazioni collegano ticket od obiettivi dello stesso progetto; entrambi gli estremi devono essere accessibili al suo interno. Non collegano lavoro privato arbitrario tra progetti e non pubblicano nessuno dei due estremi.

Un ticket aperto può ereditare un blocco attraverso il proprio obiettivo aperto. Se A blocca l’obiettivo B, i ticket aperti collegati a B mostrano A come blocco ereditato, anche senza una relazione diretta da A al ticket. La visualizzazione indica il prerequisito effettivo e l’obiettivo che trasmette il blocco. Esamina quella relazione dell’obiettivo prima di provare a rimuoverla dal ticket. Chiudere A, chiudere B o rimuovere il ticket da B elimina il blocco ereditato. Questo meccanismo segue l’appartenenza all’obiettivo, non la gerarchia tra ticket padre e sottoticket.

Rimuovi una relazione dai suoi controlli quando non è più pertinente, poi verifica etichetta e indicatore di blocco. Contrassegnare un ticket come duplicato ha effetti sul ciclo di vita e rimanda al lavoro mantenuto. Usalo per le attività duplicate invece di creare un collegamento ordinario e supporre che chiuda il duplicato.

Se il selettore di relazione non trova un ticket, controlla accesso al progetto e identificativo. Non esporre il contenuto di un altro progetto incollando un URL privato di ticket in una risposta pubblica al feedback.
