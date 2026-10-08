---
{
  "id": "profile-and-preferences",
  "locale": "it",
  "title": "Modificare profilo e preferenze",
  "summary": "Impostare nome, avatar, lingua, tema e scorciatoia di invio dell’account.",
  "topic": "Account e applicazioni",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A01"
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-preferences-section.tsx",
      "app/api/me/avatar/route.ts",
      "lib/server/avatar-seeds.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "account-security",
    "devices-and-notifications",
    "automation-settings",
    "transfer-between-instances",
    "privacy-and-account-deletion"
  ],
  "aliases": [
    "settings-and-data"
  ],
  "tags": [],
  "figures": [
    {
      "id": "profile-and-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/profile-and-preferences-workflow.png",
      "alt": "Controlli del profilo per avatar, nome utente ed email di sola lettura.",
      "caption": "Salva le modifiche al profilo dopo la validazione; l’indirizzo email rimane di sola lettura.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "profile-and-preferences-preferences-workflow",
      "kind": "screenshot",
      "src": "/documentation/it/profile-and-preferences-preferences-workflow.png",
      "alt": "Selettore della lingua e controlli del tema chiaro, scuro e di sistema.",
      "caption": "La lingua dell’account e quella del sito pubblico si impostano separatamente.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "profile-and-preferences-workflow",
    "profile-and-preferences-preferences-workflow"
  ]
}
---

## Aggiornare l’identità {#profile-and-preferences}
Apri le impostazioni dal menu dell’account. Nel profilo inserisci un nome non vuoto e salvalo. L’email è di sola lettura. Genera un nuovo avatar o carica un’immagine con i controlli dedicati. Attendi il risultato e verifica l’avatar in un commento o elenco membri; rimane lo stesso tra progetti e conversazioni. Se un file viene rifiutato, segui il messaggio di validazione invece di caricarlo ripetutamente.

L’immagine sorgente non deve superare 10 MiB. Il server verifica byte leggibili, applica orientamento e ritaglia al centro come avatar WebP di 256 × 256.

![Controlli del profilo per avatar, nome utente ed email di sola lettura.](/documentation/it/profile-and-preferences-workflow.png)


## Scegliere il comportamento {#preferences}
Nelle preferenze seleziona lingua e tema e controlla un’altra pagina. La lingua dell’account riguarda il prodotto autenticato; il sito pubblico ha un selettore separato. Il tema viene salvato nell’account su tutti i dispositivi.

Scegli la scorciatoia di invio nella sezione tastiera. Si applica a commenti e Numo. Usa il pulsante di invio quando la piattaforma intercetta la scorciatoia; i modificatori variano tra sistemi. Anche assegnazione automatica e stato dei ticket creati da Numo appartengono all’account, senza cambiare le preferenze degli altri membri.

![Selettore della lingua e controlli del tema chiaro, scuro e di sistema.](/documentation/it/profile-and-preferences-preferences-workflow.png)
