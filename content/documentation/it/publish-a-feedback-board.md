---
{
  "id": "publish-a-feedback-board",
  "locale": "it",
  "title": "Pubblicare una bacheca feedback",
  "summary": "Attivare visitatori e configurare identità, visualizzazione e revisione come proprietario.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "F01"
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "feedback"
  ],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/publish-a-feedback-board-workflow.png",
      "alt": "Bacheca pubblica dei feedback attiva, con identità SSO locale configurata e URL nascosto.",
      "caption": "Il proprietario attiva la bacheca e sceglie l’identità dei visitatori. Questo esempio usa un firmatario SSO locale; l’URL e il segreto di firma sono nascosti.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow"
  ]
}
---

## Configurare e aprire {#publish-a-feedback-board}

Come proprietario, apri Feedback nelle impostazioni del progetto. Completa la configurazione se non esiste ancora una bacheca, quindi attiva il canale della bacheca pubblica. Copia l’URL pubblico e aprilo in un browser senza sessione per controllare la vista dei visitatori. I membri possono consultare le impostazioni, ma non modificare la pubblicazione, rinnovare i token o gestire il segreto SSO.

Scegli se i visitatori si identificano con un codice email o tramite il SSO configurato. Configura commenti pubblici, visualizzazione delle categorie e schede delle pagine o viste pubbliche selezionate. Controlla i dati visibili prima di distribuire l’URL. I visitatori possono leggere senza identificarsi; inviare feedback, votare e commentare richiede un’identità sulla bacheca. Le rappresentazioni pubbliche non espongono email o nome reale dei visitatori, ma il team può gestire privatamente il feedback identificato.


## Separare pubblicazione e acquisizione {#channels}

Disattivare la bacheca rende le sue pagine inaccessibili ai visitatori. L’acquisizione da server a server usa una chiave di integrazione feedback separata e può continuare senza una bacheca pubblica. La scelta di visibilità di un feedback, lo stato di revisione e lo stato di spam ne determinano anche la visibilità: attivare la bacheca da solo non pubblica ogni feedback.

La revisione facoltativa di Numo riguarda il feedback inviato e dipende dalle impostazioni di progetto e istanza, dai provider e dal budget del proprietario. Se attiva, gli invii attendono la revisione prima della pubblicazione; se disattivata, non restano in attesa di una revisione che non avverrà. Controlla la coda dopo un invio dimostrativo. Numo invia risposte pubbliche solo su richiesta esplicita.

![Bacheca pubblica dei feedback attiva, con identità SSO locale configurata e URL nascosto.](/documentation/it/publish-a-feedback-board-workflow.png)
