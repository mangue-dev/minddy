---
{
  "id": "project-settings",
  "locale": "it",
  "title": "Configurare un progetto",
  "summary": "Modifica nome, chiave e aspetto come proprietario e comprendi l’accesso dei membri.",
  "topic": "Primi passi",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "S05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "recurring-issues",
    "git-accounts-and-repositories",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/it/project-general.png",
      "alt": "Impostazioni generali del progetto con nome, chiave, icona e azione separata per il cestino.",
      "caption": "Controlla nome e chiave prima di salvare. Spostare il progetto nel cestino è un’azione separata.",
      "revision": 1,
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
    "project-settings-steps"
  ]
}
---

## Aprire le impostazioni del progetto {#project-settings}

Apri il progetto e poi le sue impostazioni. La proprietà del progetto determina l’accesso alle impostazioni amministrative. I membri possono consultare la sezione generale e lasciare il progetto, ma non ottengono i controlli di modifica del proprietario.

Come proprietario, inserisci un nome non vuoto e una chiave di progetto valida, quindi salva. La chiave viene convertita in maiuscolo e usa da 2 a 5 lettere o cifre. Dopo averla cambiata, controlla gli identificativi risultanti. Usa i controlli di icona e aspetto per distinguere il progetto nella navigazione; queste scelte visive non cambiano l’appartenenza al progetto.

Le altre sezioni gestiscono collaboratori, ticket ricorrenti, Git, importazione, integrazioni, automazione e feedback. Segui la guida dell’attività corrispondente prima di abilitare un fornitore o lavoro automatico. Le preferenze dell’account, come la lingua dell’interfaccia, sono separate dalla configurazione del progetto.


![Impostazioni generali del progetto con nome, chiave, icona e azione separata per il cestino.](/documentation/it/project-general.png)

## Lasciare ed eliminare {#project-removal}

Un membro può usare l’azione per lasciare il progetto e rimuovere il proprio accesso. Chiedi al proprietario un nuovo invito se ti servirà di nuovo. Lasciare un progetto non lo elimina per tutti.

L’eliminazione del progetto è un’azione del proprietario nella zona di pericolo. Leggi conseguenze e conferma prima di usarla, soprattutto se il progetto contiene ticket, pagine, file o integrazioni. Se un normale salvataggio fallisce, conserva i valori desiderati, leggi l’errore e aggiorna il progetto prima di riprovare. Evita di inviare più volte un’azione distruttiva quando il suo primo risultato è incerto.
