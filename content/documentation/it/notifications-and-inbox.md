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
  "revision": 6,
  "sourceRevision": 6,
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
    "revision": 6,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions)",
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
      "alt": "Posta in arrivo con menzioni, assegnazioni e commenti dimostrativi, letti e non letti.",
      "caption": "L’attività dimostrativa mostra l’autore, il ticket e lo stato di lettura. Tutti include le notifiche lette e non lette.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        528,
        648
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "notifications-and-inbox-steps"
  ]
}
---

## Leggere la posta in arrivo {#notifications-and-inbox}

Apri la posta in arrivo dalla navigazione. È un pannello a comparsa che raggruppa le notifiche per data e offre filtri per non lette, tutte e menzioni. Seleziona un elemento per esaminare il ticket o la pagina sottostante e controlla lo stato di lettura. Aprire una notifica la contrassegna come letta. Puoi anche segnarla come letta o non letta dalla sua riga, oppure segnare tutte le notifiche come lette dal pannello. Segnarla come non letta cambia solo l’indicatore: non annulla la modifica al ticket o alla pagina. Apri il contenuto collegato per consultarne lo stato attuale.

Gli inviti ai progetti in attesa compaiono anche qui. Accetta o rifiuta dopo aver controllato progetto e account. I vecchi collegamenti alla posta in arrivo aprono il punto di accesso attuale, non una pagina separata.

![Posta in arrivo con menzioni, assegnazioni e commenti dimostrativi, letti e non letti.](/documentation/it/work-inbox.png)

## Scegliere i canali di notifica {#notification-preferences}

Apri le preferenze di notifica dell’account per regolare quali attività ricevi. La consegna tramite browser, PWA o desktop richiede anche registrazione del dispositivo e permesso del sistema operativo. Disabilitare un canale del dispositivo è diverso dal cambiare i filtri di attività nell’applicazione.

Se una notifica porta a contenuti non disponibili, verifica se l’appartenenza al progetto è cambiata o l’oggetto è stato eliminato. Se mancano notifiche push, controlla permesso e registrazione nella [sezione sulle notifiche del dispositivo](/it/documentazione/applications#devices-and-notifications); la posta in arrivo resta utile per consultare l’attività. Non inviare mai cookie di sessione o contenuti privati di notifiche in schermate diagnostiche.
