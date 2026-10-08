---
{
  "id": "implementation-plans",
  "locale": "it",
  "title": "Mantenere un piano di implementazione",
  "summary": "Segui passi ordinati separatamente dalla descrizione del ticket senza perdere il lavoro completato.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W07"
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
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-discussion-and-resources",
    "delegate-code-work",
    "review-pull-requests"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-implementation-plan.png",
      "alt": "Piano dimostrativo con due attività di lavoro completate su sei.",
      "caption": "Il piano salvato distingue passaggi completati, attivi e in attesa. L’avanzamento non dimostra l’esecuzione dell’attività di codice fittizia.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1400
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "implementation-plans-steps"
  ]
}
---

## Scrivere il piano {#implementation-plans}

Apri la scheda del piano del ticket. La descrizione dovrebbe già indicare il problema e il risultato previsto. Aggiungi i passi di implementazione manualmente oppure chiedi a Numo di esaminare il repository collegato prima di proporre un piano a livello di codice. Un percorso o una funzione generati dall’IA non sono una prova se il repository non è stato realmente letto.

Rientra la riga di un’attività di due spazi per ogni livello di annidamento; una tabulazione conta come quattro spazi. L’annidamento organizza i passi del piano e non crea relazioni padre-figlio tra ticket. Ogni attività di lavoro non annullata contribuisce al progresso, comprese quelle annidate.

Il piano usa righe di attività Markdown: `- [ ]` per da fare, `- [~]` per in corso, `- [x]` per completata e `- [-]` per annullata. Scrivi il testo dopo il marcatore, per esempio `- [ ] Verificare il link di contatto su mobile`. Le attività annullate non rientrano nel conteggio del completamento. Le attività sotto un’intestazione Questions riconosciuta vengono trattate come domande ed escluse dal progresso; tieni quindi i passaggi di lavoro in una sezione separata allo stesso livello d’intestazione. L’intestazione riconosciuta è `Questions`, con questa parola inglese. Salva le modifiche esplicite con il controllo di salvataggio; annullare scarta la bozza. Spuntare un’attività visualizzata ne aggiorna lo stato. Usa da fare, in corso, completata e annullata per descrivere ciò che è avvenuto, senza implicare verifiche non eseguite.

![Piano dimostrativo con due attività di lavoro completate su sei.](/documentation/it/work-implementation-plan.png)

## Conservare progresso e modifiche simultanee {#plan-progress}

Estendi o modifica il piano esistente invece di sostituirlo con una nuova copia non selezionata. Mantieni i passi completati e le spiegazioni dei cambiamenti di ambito. Prima di salvare una riscrittura importante, confrontala con il piano più recente se un altro membro o agente ha lavorato sul ticket.

Un piano scritto può essere affidato a Numo per l’implementazione quando il lavoro sul repository e l’ambiente isolato configurato sono disponibili. Quando esiste lavoro completato, l’interfaccia offre anche la verifica dell’implementazione. Queste azioni avviano lavoro; una casella selezionata non dimostra da sola che il codice superi i test. Leggi risultato, modifiche e controlli prima di segnare il ticket come fatto.
