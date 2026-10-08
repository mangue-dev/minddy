---
{
  "id": "repository-skills",
  "locale": "it",
  "title": "Usare le skill del repository",
  "summary": "Pubblicare istruzioni riutilizzabili nel repository collegato e selezionare quelle necessarie.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "N07"
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx",
      "content/documentation/reviews/repository-skill-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [
    "repository-skills"
  ],
  "tags": [],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/repository-skills-workflow.png",
      "alt": "Anteprima di una skill del repository con nome stabile, percorso e istruzioni complete.",
      "caption": "Leggi la skill prima di allegarla a un messaggio. Questa skill dimostrativa reale richiede npm test e vieta il merge della pull request; l’anteprima non esegue nessuna di queste azioni.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        920
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Rendere la skill disponibile {#repository-skills}
Numo legge `SKILL.md` nelle sottocartelle di `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` e `.gemini/skills`, in questo ordine di priorità. Nome e descrizione nel frontmatter identificano la skill; script e riferimenti possono essere accanto.

Esegui commit e push nel repository GitHub o GitLab collegato. Scegli il riferimento corretto quando necessario. I file solo locali non sono disponibili. L’elenco si aggiorna quando apri la conversazione o cambi progetto.

## Selezionare e controllare {#selection}
Usa `/`, `$` o il menu `+` e leggi l’anteprima prima di inviare. Puoi selezionare fino a cinque skill; i badge verdi indicano la scelta. `$` contiene solo skill del repository, `/` anche altri comandi.

La scelta vale per quel turno dell’utente. Nelle routine vale per ogni esecuzione. Le skill sono file del repository, non installazioni globali dell’account, e non sostituiscono istruzioni di sistema o sicurezza. Per crearne o modificarne una, cambia i file o chiedi a Numo di delegare il lavoro. Esegui il push prima di selezionare la nuova versione.

![Anteprima di una skill del repository con nome stabile, percorso e istruzioni complete.](/documentation/it/repository-skills-workflow.png)
