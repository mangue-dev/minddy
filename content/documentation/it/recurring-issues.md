---
{
  "id": "recurring-issues",
  "locale": "it",
  "title": "Ripetere un ticket dopo il completamento",
  "summary": "Configura il lavoro ricorrente e distinguilo da una richiesta programmata a Numo.",
  "topic": "Progetti e ticket",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "W09"
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
      "components/settings/project-recurrences-section.tsx",
      "content/knowledge/core-tracker.md",
      "lib/server/recurrence.ts"
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
    "scheduled-routines",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/it/issue-date-recurrence.png",
      "alt": "Selettore di scadenza ricorrente con anteprima settimanale la domenica e orario facoltativo.",
      "caption": "La modalità ricorrente mostra la cadenza settimanale. Conferma la prima scadenza prima di creare il ticket.",
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
    "recurring-issues-steps"
  ]
}
---

## Configurare l’attività ripetuta {#recurring-issues}

Crea o apri un ticket che resti utile a ogni ripetizione, per esempio un controllo periodico delle dipendenze. Imposta una scadenza, poi scegli una ricorrenza giornaliera, settimanale, mensile o annuale nel controllo della data del ticket. Una ricorrenza senza scadenza viene rifiutata. Controlla proprietà e assegnatario prima di salvare. Le impostazioni delle ricorrenze del progetto elencano le serie attive; usale per cambiare frequenza o interrompere la ripetizione.

I ticket ricorrenti si ricreano dopo che il ticket è nello stato «Fatto»; il successivo viene creato nel Backlog. Dopo aver completato una ricorrenza, controlla identificativo e proprietà del ticket successivo.

La scadenza successiva deriva dalla scadenza precedente più un intervallo di ricorrenza, non dal giorno in cui hai completato l’attività. Il successore copia titolo, descrizione, priorità, impegno, assegnatario, obiettivo e categorie. Non copia il piano di implementazione, la relazione con il padre, le risorse o i commenti. La ricorrenza passa al successore; riaprire e completare di nuovo il vecchio ticket non crea un’altra occorrenza. Se la creazione del successore fallisce, la serie si interrompe invece di riprovare ripetutamente sul ticket completato. Esamina il risultato e configura la ricorrenza sulla prossima attività appropriata dopo aver risolto l’errore. Non supporre che un calendario esegua codice o completi il nuovo ticket per te.


![Selettore di scadenza ricorrente con anteprima settimanale la domenica e orario facoltativo.](/documentation/it/issue-date-recurrence.png)

## Cambiare o interrompere la ripetizione {#recurrence-change}

Usa le impostazioni delle ricorrenze per modificare o disabilitare le ripetizioni future. Esamina separatamente i ticket già creati: interrompere la creazione futura non significa che il lavoro esistente sia stato completato o rimosso.

Una routine di Numo è un oggetto diverso: programma una conversazione e può usare il budget IA del proprietario e i fornitori configurati. Scegli ticket ricorrenti per un’attività ripetuta da monitorare e una routine per un’istruzione da eseguire secondo un calendario. Se manca il ticket successivo, controlla se il precedente sia stato segnato come fatto, se la ricorrenza sia ancora attiva e se stai guardando il Backlog senza filtri restrittivi.
