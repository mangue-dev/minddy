---
{
  "id": "submit-and-follow-feedback",
  "locale": "it",
  "title": "Inviare, votare e seguire feedback",
  "summary": "Identificarsi, scegliere visibilità e ritrovare richieste e voti.",
  "topic": "Feedback e richieste",
  "type": "guide",
  "audiences": [
    "visitor"
  ],
  "workflows": [
    "F02"
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
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/submit-and-follow-feedback-workflow.png",
      "alt": "Modulo di feedback del visitatore con titolo, descrizione e visibilità pubblica attivata.",
      "caption": "Un visitatore identificato invia un’esigenza e ne sceglie la visibilità. L’esempio è stato realmente inviato con la revisione automatica disattivata.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "submit-and-follow-feedback-workflow"
  ]
}
---

## Identificarsi e inviare {#submit-and-follow-feedback}

Apri l’URL pubblico della bacheca. Puoi leggere i feedback pubblici senza un account Minddy. Per inviare, votare o commentare, identificati con il codice email della bacheca o il link SSO del prodotto. La consegna del codice dipende dal servizio email dell’istanza. Un codice dura dieci minuti e consente cinque tentativi; attendi almeno sessanta secondi prima di richiederne un altro. Non condividere mai il codice.

Cerca richieste esistenti prima di pubblicare. Scrivi un titolo preciso e descrivi il bisogno e il contesto. Il titolo ammette 200 caratteri e il corpo 10.000. L’opzione pubblica è selezionata per impostazione predefinita; deselezionala per inviare la richiesta privatamente al team. Prima dell’invio, controlla che il testo non contenga segreti. La moderazione facoltativa può mantenere la richiesta in attesa prima che appaia pubblicamente.


## Votare, commentare e seguire {#follow}

Vota una richiesta esistente anziché duplicarla. Ogni identità ha un voto per feedback. I commenti richiedono identificazione e commenti pubblici abilitati; un commento pubblico ammette 5.000 caratteri. Puoi eliminare il tuo commento e il team può moderare i commenti pubblici.

Apri Il mio feedback per ritrovare richieste e voti secondo ciò che può vedere la tua identità corrente. Leggi lì, o nella richiesta, lo stato pubblico e le risposte del team. Le note interne non sono risposte pubbliche. Se il SSO è scaduto, torna tramite un nuovo link del prodotto; cambiare browser o identità può cambiare l’elenco personale.

![Modulo di feedback del visitatore con titolo, descrizione e visibilità pubblica attivata.](/documentation/it/submit-and-follow-feedback-workflow.png)
