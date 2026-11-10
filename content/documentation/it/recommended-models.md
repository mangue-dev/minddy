---
{
  "id": "recommended-models",
  "locale": "it",
  "title": "Configurazione dei modelli consigliata",
  "summary": "Avviare un’istanza con la configurazione dei modelli IA di minddy Cloud.",
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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-10",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
    "revision": 3,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-954 model roles: file contents sentence, source audit against lib/ai-model-config-file.ts; no browser walkthrough)",
    "language": "agent:claude-code (it changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (it MIN-954 model-role passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-10"
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

## Partire dalla configurazione di minddy Cloud {#recommended-models}

minddy Cloud pubblica la configurazione dei modelli IA che usa, sempre aggiornata: [scarica la configurazione consigliata](https://www.minddy.app/api/recommended-models?download=1). Il file usa il formato con versione di **Esporta** nella scheda **Modelli** dell’amministrazione (`minddy.instance-models`): il modello di ogni tipo, il livello di ragionamento e i modelli predefiniti delle chiavi personali. Non contiene chiavi, account né utilizzo.

## Importarla nella tua istanza {#import}

Scarica il file, apri **Modelli** nell’amministrazione della tua istanza, scegli **Importa** e selezionalo. Ogni modifica viene elencata prima di scrivere qualcosa; **Applica** le scrive tutte, oppure nessuna quando un valore viene rifiutato, per esempio un modello di decisione che il tuo fornitore non offre. Le impostazioni che il file non contiene tornano al valore predefinito. Un file di una versione più recente di minddy viene rifiutato finché la tua istanza non è aggiornata. Puoi anche allegare il file in una conversazione Numo avviata da una sessione di amministratore e chiedere a Numo di importarlo: Numo mostra lo stesso elenco di modifiche e ti chiede di confermare. Vedi [l’amministrazione dell’istanza](/docs/instance-administration#models-file).

## Pubblicare la tua configurazione {#publish}

Un’istanza self-hosted non pubblica nulla per impostazione predefinita. Imposta `MINDDY_PUBLISH_MODEL_CONFIG=1` per servire la sua configurazione su `/api/recommended-models`, per esempio per configurare più istanze allo stesso modo. Il file è pubblico: nomina solo i modelli e come vengono serviti.
