---
{
  "id": "repository-skills",
  "locale": "it",
  "title": "Skill del repository",
  "summary": "Pubblica istruzioni riutilizzabili nel repository collegato e seleziona le skill necessarie al lavoro.",
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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-721 removal of Numo code work",
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
      "components/assistant/skill-preview-dialog.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root/min721_docs (MIN-721 source review inherited from en revision 5; it translation of removal edits; no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root (inline-code syntax and unchanged-text review); agent:/root/min721_it (it translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance)",
    "date": "2026-10-16"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Usare le skill del repository"
  ],
  "figures": [
    {
      "id": "repository-skills-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/repository-skills-workflow.png",
      "alt": "Anteprima di una skill del repository con nome stabile, percorso e istruzioni complete.",
      "caption": "Leggi la skill prima di allegarla a un messaggio. Questa skill dimostrativa reale richiede `npm test` e vieta il merge della pull request; l’anteprima non esegue nessuna di queste azioni.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        996,
        888
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "repository-skills-workflow"
  ]
}
---

## Rendere la skill disponibile {#repository-skills}

Numo legge `SKILL.md` nelle sottocartelle di `.agents/skills`, `.claude/skills`, `.github/skills`, `.cursor/skills`, `.codex/skills` e `.gemini/skills`, in questo ordine di priorità. Nome e descrizione nel frontmatter identificano la skill; script e riferimenti possono essere accanto.

Esegui commit e push sul branch predefinito del repository GitHub o GitLab collegato; Numo legge le skill da quel branch. I file presenti solo sul tuo computer o su un altro branch non sono disponibili. L’elenco si aggiorna quando apri la conversazione o cambi progetto.

## Selezionare e controllare {#selection}

Usa `/`, `$` o il menu `+` e leggi l’anteprima prima di inviare. Puoi selezionare fino a cinque skill; i badge verdi indicano la scelta. `$` contiene solo skill del repository, `/` anche altri comandi.

La scelta vale per quel turno dell’utente. Nelle routine vale per ogni esecuzione. Le skill sono file del repository, non installazioni globali dell’account, e non sostituiscono istruzioni di sistema o sicurezza. Per crearne o modificarne una, modifica i file del repository tu stesso o con il tuo agente di codice. Esegui il push prima di selezionare la nuova versione.

![Anteprima di una skill del repository con nome stabile, percorso e istruzioni complete.](/documentation/it/repository-skills-workflow.png)
