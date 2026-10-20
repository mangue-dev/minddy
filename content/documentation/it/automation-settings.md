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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of Numo code work",
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
    "revision": 7,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 7; no operational rerun)",
    "language": "agent:/root (it translation, label and retained-meaning self-review); agent:/root/min721_docs (it translation of the MIN-721 removal edit; agent review, not human acceptance)",
    "date": "2026-10-16"
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

Gli interruttori di automazione del progetto e i preset, filtri di impegno e ritardi iniziali dell’account sono sostituiti dalle [Routine](/docs/scheduled-routines). Le regole di automazione configurate in una versione precedente non vengono più eseguite e Minddy non le converte in routine. Le catene in attesa o sospese per un intervento umano sono state fermate senza un passo successivo. Le regole archiviate restano nel progetto e nelle esportazioni dell’account.

Per mantenere un workflow, apri Routine come proprietario del progetto e [crea una routine](/docs/scheduled-routines#scheduled-routines) con le istruzioni, l’attivatore, le condizioni e l’attesa necessari.

## Distinguere le altre funzioni del progetto {#mechanisms}

Smart Fill continua a compilare priorità, impegno, categorie e obiettivo mancanti. Smart Assign resta un’impostazione del proprietario con regole per membro. Smart Triage resta un motore di regole statiche. L’autoassegnazione rimane una preferenza separata. Queste funzioni sono distinte dalle routine e non sostituiscono un’automazione ritirata.

Prova manualmente una nuova routine, esamina conversazione privata e budget, poi attivala per gli eventi futuri. Se parte lavoro inatteso, metti in pausa la routine e controlla l’esecuzione prima di riprovare. La [guida alle routine](/docs/scheduled-routines#conditions) spiega le condizioni in attesa e la loro invalidazione.
