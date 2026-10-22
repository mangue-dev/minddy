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
  "revision": 7,
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
      "content/knowledge/repository-skills.md",
      "components/assistant/skill-preview-dialog.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (it/es catalog language review: quoted labels aligned on the corrected it catalog; no behavior change, no new captures)",
    "language": "agent:/root/min747 (it translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (it label alignment after the full catalog review; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "caption": "Leggi la skill prima di allegarla a un messaggio. Questa skill dimostrativa reale richiede `npm test` e vieta l’unione della pull request; l’anteprima non esegue nessuna di queste azioni.",
      "revision": 7,
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
