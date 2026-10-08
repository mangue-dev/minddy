---
{
  "id": "moderate-feedback",
  "locale": "it",
  "title": "Esaminare feedback in privato e rispondere pubblicamente",
  "summary": "Gestire richieste senza esporre note o riscrivere parole dei visitatori.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F03"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/posts.ts",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/moderate-feedback-workflow.png",
      "alt": "Dettaglio di un feedback con risposta pubblica del team e nota interna.",
      "caption": "L’etichetta Pubblico distingue la risposta visibile ai visitatori; la nota interna resta al team. Non viene mostrato alcun risultato di moderazione IA.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "moderate-feedback-workflow"
  ]
}
---

## Esaminare una richiesta {#moderate-feedback}

I membri aprono Feedback nel progetto e scelgono una richiesta dalla coda di revisione o dall’elenco. Leggi l’invio originale, la scelta pubblica o privata, lo stato di revisione e gli eventuali suggerimenti di moderazione o duplicati. Puoi chiarire titolo e corpo canonici conservando i testi originali inviati. Assegna categorie e uno stato pubblico adatto; lo spam non appare mai sulla bacheca pubblica. Una richiesta privata resta distinta da una richiesta pubblica soltanto in attesa.

La traduzione facoltativa compare accanto al testo originale per il team; la bacheca pubblica conserva il feedback così com’è stato scritto. Verifica le classificazioni IA prima di farvi affidamento. Se un feedback è collegato a una issue, il suo stato dipende da quella issue e non può essere modificato autonomamente.


## Note e risposte pubbliche {#responses}

Scegli la discussione interna per le note del team. Le risposte pubbliche sono visibili ai visitatori: controlla la visibilità prima di inviare. Le risposte ereditano la visibilità del thread; selezionare la modalità interna nel composer non rende privata una risposta in un thread pubblico. Le risposte pubbliche di Numo richiedono una richiesta esplicita; menzionarlo in un commento pubblico non attiva una risposta automatica.

I membri possono eliminare commenti pubblici per moderarli. Solo l’autore può modificarli e il team non riscrive mai le parole dei visitatori. I commenti interni mantengono le regole che riservano queste azioni all’autore. Dopo una risposta pubblica o un intervento di moderazione, verifica la bacheca senza sessione per confermare la visibilità prevista.

![Dettaglio di un feedback con risposta pubblica del team e nota interna.](/documentation/it/moderate-feedback-workflow.png)
