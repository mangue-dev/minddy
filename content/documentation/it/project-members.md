---
{
  "id": "project-members",
  "locale": "it",
  "title": "Invitare persone a un progetto",
  "summary": "Usa l’email dell’account previsto, accetta inviti e gestisci l’accesso al progetto.",
  "topic": "Primi passi",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S06"
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
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "content/knowledge/settings-and-data.md",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-settings",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/it/project-members.png",
      "alt": "Invito via email e tre membri dimostrativi, con il proprietario identificato.",
      "caption": "Invita con l’email dell’account e identifica il proprietario prima di rimuovere l’accesso di un membro.",
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
    "project-members-steps"
  ]
}
---

## Inviare e accettare un invito {#project-members}

Il proprietario del progetto gestisce l’appartenenza nelle impostazioni dei membri. Chiedi al collaboratore l’email che usa su questa istanza, invia l’invito e controlla che sia in attesa. La stessa email su un’altra istanza non dà accesso qui.

La persona invitata accede con quell’account e apre la posta in arrivo. Accetta l’invito in attesa per entrare o rifiutalo se il progetto è inatteso. Il dialogo di ingresso iniziale aiuta a condividere la tua email con il proprietario; non permette di entrare in progetti senza invito.


![Invito via email e tre membri dimostrativi, con il proprietario identificato.](/documentation/it/project-members.png)

## Responsabilità di proprietario e membri {#member-permissions}

| Persona | Accesso tipico al progetto |
| --- | --- |
| Membro | Lavorare con ticket, pagine e spazi di collaborazione del progetto; gestire le proprie preferenze dell’account. |
| Proprietario | Attività dei membri più impostazioni del progetto, inviti e configurazioni di integrazione o automazione riservate al proprietario. |
| Visitatore tramite collegamento pubblico | Solo il contenuto pubblicato esplicitamente attraverso quel collegamento; nessuna appartenenza al progetto. |

Controlla l’elenco dei membri prima di rimuovere qualcuno. La riga del proprietario non offre un’azione di rimozione e questi controlli non trasferiscono la proprietà del progetto. Il proprietario può annullare un invito in attesa prima che venga accettato; lo stato in attesa non rivela se quell’indirizzo ha già un account. La rimozione interrompe l’accesso come membro; non ritira esportazioni, schermate o copie già ricevute. Le credenziali personali Git, IA e MCP restano dell’account e non si trasferiscono con il cambio di proprietario del progetto.

## Risolvere la mancanza di accesso {#invitation-recovery}

Se un invito manca, confronta l’email invitata con l’account connesso e verifica l’URL dell’istanza. Chiedi al proprietario di controllare gli inviti in attesa invece di creare ripetutamente account. Se i permessi cambiano durante una sessione aperta, ricarica la destinazione e verifica l’appartenenza prima di riprovare a scrivere. Non condividere la sessione di un’altra persona per aggirare un errore di accesso.
