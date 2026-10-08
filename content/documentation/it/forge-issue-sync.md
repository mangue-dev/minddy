---
{
  "id": "forge-issue-sync",
  "locale": "it",
  "title": "Sincronizzare ticket della piattaforma Git",
  "summary": "Attivare importazione e sincronizzazione e diagnosticare permessi e modifiche concorrenti.",
  "topic": "Numo e integrazioni",
  "type": "guide",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "docs/github-issue-sync.md",
      "content/knowledge/integrations.md",
      "components/settings/project-git-section.tsx",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/it/forge-issue-sync-mapping.png",
      "alt": "Flusso di sincronizzazione GitHub con configurazione, controllo eventi, importazione e stati.",
      "caption": "Gli eventi GitHub preservano le modifiche recenti ed evitano consegne duplicate. Le corrispondenze GitLab richiedono una verifica separata.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/forge-issue-sync-workflow.png",
      "alt": "Repository dimostrativo GitHub collegato, con la sincronizzazione delle issue disattivata.",
      "caption": "Il repository dimostrativo è collegato a GitHub. La sincronizzazione delle issue è ancora disattivata: controlla l’ambito e il backlog esistente prima di attivarla. Questa schermata non dimostra un’importazione sincronizzata.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

## Attivare e verificare {#forge-issue-sync}
Come proprietario, apri Git dopo aver collegato il repository. Attiva la sincronizzazione con i diritti di scrittura necessari. I ticket importati arrivano al triage. Verifica il recupero iniziale indicato e titolo, descrizione e stato di un ticket remoto noto.

Aperto e chiuso si riflettono in entrambe le direzioni. In GitHub titolo e corpo diventano titolo e descrizione; le etichette forniscono categorie, priorità e impegno riconosciuti; viene usato il primo assegnatario collegato e la scadenza della milestone. I commenti mantengono autore, identità, URL e date remoti. I blocchi richiedono entrambi i ticket nello stesso progetto importato. Restano gli URL degli allegati; byte caricati e campi GitHub Projects non hanno equivalente nativo.

## Permessi, conflitti e disattivazione {#recovery}
La GitHub App richiede lettura/scrittura di Issues e iscrizioni Issues, Issue comments e Issue dependencies. Le installazioni esistenti devono accettare nuovi permessi. Queste corrispondenze non garantiscono tutti i campi GitLab.

Eventi GitHub datati più vecchi non sovrascrivono modifiche locali recenti. Identità di consegna e commenti evitano duplicati. Confronta date e consulta eventi del fornitore e log operatore se manca il recupero iniziale. Disattiva nello stesso controllo del proprietario; esamina separatamente il lavoro già importato.

![Flusso di sincronizzazione GitHub con configurazione, controllo eventi, importazione e stati.](/documentation/it/forge-issue-sync-mapping.png)

![Repository dimostrativo GitHub collegato, con la sincronizzazione delle issue disattivata.](/documentation/it/forge-issue-sync-workflow.png)
