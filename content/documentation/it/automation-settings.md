---
{
  "id": "automation-settings",
  "locale": "it",
  "title": "Dalle automazioni alle routine",
  "summary": "Scopri che cosa è successo alle automazioni di progetto e ricrea un workflow come routine controllata dal proprietario.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-04",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-04"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Ricreare un’automazione di progetto come routine"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Che cosa è successo alle automazioni di progetto {#automation-settings}

Gli interruttori di automazione del progetto e i preset, filtri di impegno e ritardi iniziali dell’account sono sostituiti dalle [Routine](/docs/scheduled-routines). Le regole di automazione configurate in una versione precedente non vengono più eseguite e minddy non le converte in routine. Le catene in attesa o sospese per un intervento umano sono state fermate senza un passo successivo. Le regole archiviate restano nel progetto e nelle esportazioni dell’account.

Per mantenere un workflow, apri Routine come proprietario del progetto e [crea una routine](/docs/scheduled-routines#scheduled-routines) con le istruzioni, l’attivatore, le condizioni e l’attesa necessari.

## Distinguere le altre funzioni del progetto {#mechanisms}

Smart Fill continua a compilare priorità, impegno, categorie e obiettivo mancanti. Smart Assign resta un’impostazione del proprietario con regole per membro. Smart Triage resta un motore di regole statiche. L’autoassegnazione rimane una preferenza separata. Queste funzioni sono distinte dalle routine e non sostituiscono un’automazione ritirata.

Prova manualmente una nuova routine, esamina conversazione privata e budget, poi attivala per gli eventi futuri. Se parte lavoro inatteso, metti in pausa la routine e controlla l’esecuzione prima di riprovare. La [guida alle routine](/docs/scheduled-routines#conditions) spiega le condizioni in attesa e la loro invalidazione.
