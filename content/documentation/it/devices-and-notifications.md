---
{
  "id": "devices-and-notifications",
  "locale": "it",
  "title": "Attivare notifiche su un dispositivo",
  "summary": "Registrare il dispositivo, provare la consegna e distinguere browser e supporto nativo.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A03"
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
      "components/settings/account-push-devices-section.tsx",
      "lib/desktop/notification-capabilities.ts",
      "public/sw.js",
      "content/documentation/reviews/push-registration-capture-candidates.json"
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
      "id": "devices-and-notifications-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/devices-and-notifications-workflow.png",
      "alt": "Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.",
      "caption": "Questo browser blocca le notifiche. Ripristina il permesso del sito prima di registrare il dispositivo.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "devices-and-notifications-registered-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/devices-and-notifications-registered.png",
      "alt": "Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.",
      "caption": "L’account ha un dispositivo browser registrato e attivo. L’elenco mostra la data di registrazione e quella dell’ultimo invio. La comparsa di un avviso dipende comunque dal permesso del browser e dalle impostazioni del sistema operativo.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        950
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "devices-and-notifications-workflow",
    "devices-and-notifications-registered-workflow"
  ]
}
---

## Attivare e provare {#devices-and-notifications}

Apri le notifiche nelle impostazioni dell’account sul dispositivo che vuoi registrare. Attivale e accetta la richiesta di autorizzazione del browser o del sistema operativo. Se hai negato il permesso, devi modificarlo nelle impostazioni del browser o del sistema; azionare ripetutamente il controllo di Minddy non può superare quel rifiuto. Su iOS, installa e apri prima l’app web quando l’interfaccia lo richiede.

Verifica che il dispositivo compaia nell’elenco e usa il suo comando di prova. Controlla le informazioni sull’ultima consegna. Puoi disattivare o rimuovere singole registrazioni senza eliminare l’account. Le preferenze della Posta in arrivo dell’app determinano quali eventi generano notifiche; la Posta in arrivo resta disponibile anche quando il push non funziona.

![Impostazioni push con permesso bloccato nel browser e nessun dispositivo registrato.](/documentation/it/devices-and-notifications-workflow.png)


## Condizioni per piattaforma {#platforms}

Il push web richiede un browser supportato e un servizio push configurato sull’istanza. I banner nativi e la consegna in background dipendono dalla piattaforma. L’app macOS firmata e distribuita supporta APNs; il pacchetto Windows richiede il componente WNS opzionale per il trasporto in background. Linux utilizza la sessione in background dell’app distribuita, anziché APNs o WNS.

Controlla il permesso per le notifiche nel sistema operativo, lo stato di installazione nel browser e l’eventuale spiegazione che indica una funzione non configurata o non supportata. Una prova riuscita non garantisce la consegna senza rete o in presenza di tutte le restrizioni del sistema sul lavoro in background. Mantieni disponibile l’applicazione o il suo servizio in background configurato, secondo i requisiti della piattaforma.

![Dispositivo browser registrato e attivo sull’account, con la data effettiva dell’ultimo invio.](/documentation/it/devices-and-notifications-registered.png)
