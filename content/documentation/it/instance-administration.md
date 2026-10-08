---
{
  "id": "instance-administration",
  "locale": "it",
  "title": "Usare la console di amministrazione dell’istanza",
  "summary": "Amministrare l’istanza è diverso da possedere un progetto.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H16"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "app/(app)/admin/page.tsx",
      "app/(app)/admin/layout.tsx",
      "components/admin/admin-dashboard.tsx",
      "lib/admin-tabs.ts",
      "lib/server/admin.ts",
      "docs/self-hosting-auth.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-overview.png",
      "alt": "Panoramica amministratore con indicatori aggregati di account, introduzione e contenuti.",
      "caption": "Panoramica mostra gli indicatori aggregati dell’istanza. Finanze non compare in questo profilo dimostrativo perché non è configurata una chiave OpenRouter gestita.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "instance-administration-users",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-users.png",
      "alt": "Assistenza account con ricerca per indirizzo email esatto, senza elenco di contenuti personali.",
      "caption": "Utenti apre un account specifico per assistenza o fatturazione; la schermata iniziale non elenca attività private né contenuti personali.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-models.png",
      "alt": "Impostazioni dei modelli IA e del ragionamento dell’istanza.",
      "caption": "Modelli configura valori predefiniti e usi specifici. La schermata mostra la configurazione esistente; nessun modello o provider è stato modificato.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usare la console di amministrazione dell’istanza {#instance-administration}

Amministrare l’istanza è diverso da possedere un progetto. ADMIN_EMAILS elenca gli account confermati autorizzati lato server; anche app_metadata.role=admin firmato è una fonte valida. Sono richiesti aal2, MFA verificata e controlli aggiornati su account e sessione. Se questi controlli falliscono, l’accesso viene negato. Accedi, completa TOTP e apri /admin. Non alterare i ruoli nel database per aggirare MFA. La console e le API private rimangono noindex.


![Panoramica amministratore con indicatori aggregati di account, introduzione e contenuti.](/documentation/it/instance-administration-overview.png)

![Assistenza account con ricerca per indirizzo email esatto, senza elenco di contenuti personali.](/documentation/it/instance-administration-users.png)

![Impostazioni dei modelli IA e del ragionamento dell’istanza.](/documentation/it/instance-administration-models.png)

## Usare le capacità disponibili {#panels}

La console comprende Panoramica, Utenti, Modelli e, quando disponibile, Finanze. Finanze è nascosto senza OpenRouter gestito; l’assegnazione di un piano dipende dalla fatturazione abilitata o da un override già presente. Aprire la console non aggiunge la fatturazione Cloud a un’istanza self-hosted senza provider commerciali. Controlla modelli, valori predefiniti, utenti e quote nella release installata prima di modificare. I cambiamenti interessano tutta l’istanza: verificali con un account demo.

## Mantenere responsabilità operative {#responsibilities}

Rimangono tue responsabilità privilegi minimi, recupero MFA, segreti, backup, conservazione, incidenti e costi. La console non sostituisce il ripristino di database e Storage né la configurazione SMTP. Se l’accesso viene rifiutato, controlla email confermata, allowlist, MFA e sessione prima di cambiare la configurazione. Una sessione revocata o un account bloccato non conserva i privilegi grazie a un JWT ancora valido. Evita screenshot con dati privati di altri utenti, fattori MFA o dettagli finanziari.
