---
{
  "id": "sub-issues",
  "locale": "it",
  "title": "Suddividere un ticket in sottoticket",
  "summary": "Segui attività più piccole sotto un ticket padre e scollega un figlio senza eliminarlo.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W06"
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
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "issue-dependencies",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-sub-issues.png",
      "alt": "Campo per creare un sotto-ticket in un ticket principale dimostrativo.",
      "caption": "Il campo crea un figlio di questo ticket; ogni figlio conserva stato e discussione propri.",
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
    "sub-issues-steps"
  ]
}
---

## Costruire la gerarchia {#sub-issues}

Apri il ticket padre e usa i controlli dei sottoticket per creare parti di lavoro più piccole. Dai a ogni figlio un risultato distinto. Dopo la creazione, controlla progetto, proprietà e identificativo del padre; una gerarchia deve facilitare il monitoraggio, non sostituire la descrizione di ciò che ogni figlio deve ottenere.

La gerarchia consente un solo livello: il padre deve essere un ticket di primo livello nello stesso progetto e un sottoticket non può avere figli. Se durante la creazione non scegli esplicitamente un obiettivo, il figlio eredita quello del padre. Controlla le proprietà risultanti invece di presumere che le modifiche successive del padre si propaghino.

Un figlio resta un ticket con un proprio stato e una propria discussione. L’indicatore di progresso del padre è ponderato in base all’impegno dei figli e alla quota di completamento attribuita al loro stato. Il contatore completati/totale nell’elenco dei sottoticket è invece un conteggio separato, non ponderato. Leggi gli stati dei figli insieme a entrambe le misure. Usa una dipendenza per dire «deve terminare prima» e un padre per dire «fa parte di questa attività più grande».

![Campo per creare un sotto-ticket in un ticket principale dimostrativo.](/documentation/it/work-sub-issues.png)

## Aprire o rimuovere la relazione con il padre {#change-parent}

L’identificativo del padre accanto al titolo del figlio apre un menu. Usa l’azione di apertura del padre per esaminare l’attività più grande. Per separare il figlio, scegli di scollegarlo dal padre e leggi la conferma prima di applicarla. Quando lo scollegamento riesce, la relazione scompare e il ticket rimane.

Non eliminare un figlio solo per riorganizzare la gerarchia. Controlla le relazioni padre-figlio esistenti prima di cambiare padre e risolvi una relazione rifiutata invece di forzare una gerarchia circolare. Se il salvataggio fallisce, riapri il figlio per verificare se il cambiamento sia stato applicato prima di riprovare. Conserva il lavoro completato dei figli quando rivedi il piano generale.
