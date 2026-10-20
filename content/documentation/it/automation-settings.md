---
{
  "id": "automation-settings",
  "locale": "it",
  "title": "Dalle automazioni alle routine",
  "summary": "Verifica le proposte di migrazione in pausa prima di attivare il lavoro Numo basato su eventi.",
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
    "Configurare il lavoro automatico sui ticket"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Verificare il lavoro migrato {#automation-settings}

Gli interruttori di automazione del progetto e i preset, filtri di impegno e ritardi iniziali dell’account sono sostituiti dalle [Routine](/docs/scheduled-routines). Apri Routine come proprietario del progetto. Le regole attive archiviate vengono proposte una sola volta come routine in pausa; aprire l’elenco non le attiva e non consuma budget di esecuzione.

Verifica istruzioni, stato attivatore, condizioni, attesa e limite di spesa di ogni proposta. Il workflow originale rimane nelle istruzioni per il confronto. Controlla conferme umane e riferimenti non disponibili prima dell’attivazione. Le proposte richiedono l’intervento del proprietario nei punti di conferma umana e limitano ogni esecuzione al 15 % del budget mensile per impostazione predefinita. Non proseguono silenziosamente la vecchia catena. Le catene in attesa o sospese per un intervento umano si fermano, senza un passo successivo della catena. Attività storica e backup dell’account conservano l’archivio.

## Distinguere le altre funzioni del progetto {#mechanisms}

Smart Fill continua a compilare priorità, impegno, categorie e obiettivo mancanti. Smart Assign resta un’impostazione del proprietario con regole per membro. Smart Triage resta un motore di regole statiche. L’autoassegnazione rimane una preferenza separata. Queste funzioni non attivano le proposte migrate.

Prova manualmente una routine verificata, esamina conversazione privata e budget, poi attivala per gli eventi futuri. Se parte lavoro inatteso, metti in pausa la routine e controlla l’esecuzione prima di riprovare. La [guida alle routine](/docs/scheduled-routines#conditions) spiega le condizioni in attesa e la loro invalidazione.
