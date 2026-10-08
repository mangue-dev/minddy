---
{
  "id": "notifications-and-inbox",
  "locale": "it",
  "title": "Posta in arrivo e notifiche",
  "summary": "Controlla attività non letta e menzioni, poi regola le preferenze di notifica dell’account.",
  "topic": "Pianificare e trovare lavoro",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/productivity.md",
      "components/inbox-popover.tsx",
      "components/inbox-content.tsx",
      "components/settings/account-notifications-section.tsx"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "projects",
    "applications",
    "accounts"
  ],
  "aliases": [],
  "tags": [
    "Seguire notifiche e inviti nella posta in arrivo"
  ],
  "figures": [
    {
      "id": "notifications-and-inbox-steps",
      "kind": "screenshot",
      "src": "/documentation/it/work-inbox.png",
      "alt": "Schede della posta in arrivo e lista vuota degli elementi non letti.",
      "caption": "La scheda Non letto vuota indica che la vista non contiene elementi non letti. Tutti mostra le altre notifiche conservate.",
      "revision": 5,
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
    "notifications-and-inbox-steps"
  ]
}
---

## Leggere la posta in arrivo {#notifications-and-inbox}

Apri la posta in arrivo dalla navigazione. È un pannello a comparsa che raggruppa le notifiche per data e offre filtri per non lette, tutte e menzioni. Seleziona un elemento per esaminare il ticket o la pagina sottostante e controlla lo stato di lettura. Aprire una notifica la contrassegna come letta. La sua riga offre anche i comandi per segnarla come letta o non letta e il pannello può contrassegnare tutte le notifiche come lette. Segnarla come non letta ripristina quell’indicatore di attività; non annulla la modifica al ticket o alla pagina sottostante. Una notifica rimanda a lavoro accessibile, non sostituisce il suo contenuto attuale.

Gli inviti ai progetti in attesa compaiono anche qui. Accetta o rifiuta dopo aver controllato progetto e account. I vecchi collegamenti alla posta in arrivo aprono il punto di accesso attuale, non una pagina separata.

![Schede della posta in arrivo e lista vuota degli elementi non letti.](/documentation/it/work-inbox.png)

## Scegliere i canali di notifica {#notification-preferences}

Apri le preferenze di notifica dell’account per regolare quali attività ricevi. La consegna tramite browser, PWA o desktop richiede anche registrazione del dispositivo e permesso del sistema operativo. Disabilitare un canale del dispositivo è diverso dal cambiare i filtri di attività nell’applicazione.

Se una notifica porta a contenuti non disponibili, verifica se l’appartenenza al progetto è cambiata o l’oggetto è stato eliminato. Se mancano notifiche push, controlla permesso e registrazione del dispositivo con la relativa guida; la posta in arrivo resta utile per consultare l’attività. Non inviare mai cookie di sessione o contenuti privati di notifiche in schermate diagnostiche.
