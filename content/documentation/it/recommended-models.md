---
{
  "id": "recommended-models",
  "locale": "it",
  "title": "Configurazione dei modelli consigliata",
  "summary": "Avviare un’istanza con la configurazione dei modelli IA di Minddy Cloud.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "MIN-829 instance administration",
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
      "app/api/recommended-models/route.ts",
      "lib/ai-model-config-file.ts",
      "lib/server/admin-model-config.ts",
      "components/admin/admin-models-dashboard.tsx",
      "lib/server/assistant/admin-tools.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:claude-code (MIN-829 article checked against app/api/recommended-models/route.ts, lib/ai-model-config-file.ts and lib/server/admin-model-config.ts; no figure)",
    "language": "agent:claude-code (it MIN-829 article with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "instance-administration",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Importare la configurazione dei modelli consigliata"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Partire dalla configurazione di Minddy Cloud {#recommended-models}

Minddy Cloud pubblica la configurazione dei modelli IA che usa, sempre aggiornata: [scarica la configurazione consigliata](https://www.minddy.app/api/recommended-models?download=1). Il file usa il formato con versione di **Esporta** nella scheda **Modelli** dell’amministrazione (`minddy.instance-models`): modelli predefiniti delle categorie, modelli delle attività, scorciatoie di instradamento, livello di ragionamento, modelli consigliati e valori predefiniti dei fornitori per le chiavi personali. Non contiene chiavi, account né utilizzo.

## Importarla nella tua istanza {#import}

Scarica il file, apri **Modelli** nell’amministrazione della tua istanza, scegli **Importa** e selezionalo. Ogni modifica viene elencata prima di scrivere qualcosa; **Applica** le scrive tutte, oppure nessuna quando un valore viene rifiutato, per esempio un modello di decisione che il tuo fornitore non offre. Le impostazioni che il file non contiene tornano al valore predefinito. Un file di una versione più recente di minddy viene rifiutato finché la tua istanza non è aggiornata. Puoi anche allegare il file in una conversazione Numo avviata da una sessione di amministratore e chiedere a Numo di importarlo: Numo mostra lo stesso elenco di modifiche e ti chiede di confermare. Vedi [l’amministrazione dell’istanza](/docs/instance-administration#models-file).

## Pubblicare la tua configurazione {#publish}

Un’istanza self-hosted non pubblica nulla per impostazione predefinita. Imposta `MINDDY_PUBLISH_MODEL_CONFIG=1` per servire la sua configurazione su `/api/recommended-models`, per esempio per configurare più istanze allo stesso modo. Il file è pubblico: nomina solo i modelli e come vengono serviti.
