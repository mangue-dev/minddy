---
{
  "id": "instance-administration",
  "locale": "it",
  "title": "Amministrazione dell’istanza",
  "summary": "Accedi alla console amministrativa con MFA, usa i controlli disponibili e distingui amministrazione dell’istanza e proprietà del progetto.",
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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate with the global decision model (MIN-694)",
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
      "docs/self-hosting-auth.md",
      "lib/ai-model-config.ts",
      "app/api/admin/app-config/route.ts",
      "lib/server/decisions/model-validation.ts",
      "docs/plans/min-694-decision-model-selection.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-694 decision model selector, save validation and fallback source and test review; live decision probes recorded in docs/plans/min-694-decision-model-selection.md; existing figures unchanged)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures); agent:/root/editorial_it_pt (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-694 six-locale decision model section meaning review; agent review, not human acceptance)",
    "date": "2026-10-16"
  },
  "related": [
    "authentication-and-email",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [
    "Usare la console di amministrazione dell’istanza"
  ],
  "figures": [
    {
      "id": "instance-administration-flow",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-overview.png",
      "alt": "Panoramica amministratore con indicatori aggregati di account, introduzione e contenuti.",
      "caption": "Panoramica mostra gli indicatori aggregati dell’istanza. Finanze non compare in questo profilo dimostrativo perché non è configurata una chiave OpenRouter gestita.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "instance-administration-models",
      "kind": "screenshot",
      "src": "/documentation/it/instance-administration-models.png",
      "alt": "Impostazioni dei modelli IA e del ragionamento dell’istanza.",
      "caption": "Modelli configura valori predefiniti e usi specifici. La schermata mostra la configurazione esistente; nessun modello o provider è stato modificato.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1488,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "instance-administration-flow"
  ]
}
---

## Usare la console di amministrazione dell’istanza {#instance-administration}

Amministrare l’istanza è diverso da possedere un progetto. `ADMIN_EMAILS` elenca gli account confermati autorizzati lato server; anche `app_metadata.role=admin` firmato è una fonte valida. Sono richiesti `aal2`, MFA verificata e controlli aggiornati su account e sessione. Se questi controlli falliscono, l’accesso viene negato. Accedi, completa TOTP e apri `/admin`. Non alterare i ruoli nel database per aggirare MFA. La console e le API private rimangono `noindex`.


![Panoramica amministratore con indicatori aggregati di account, introduzione e contenuti.](/documentation/it/instance-administration-overview.png)

![Impostazioni dei modelli IA e del ragionamento dell’istanza.](/documentation/it/instance-administration-models.png)

## Usare i controlli disponibili {#panels}

La console comprende Panoramica, Utenti, Modelli e, quando disponibile, Finanze. Finanze è nascosto senza OpenRouter gestito; l’assegnazione di un piano dipende dalla fatturazione abilitata o da un override già presente. Aprire la console non aggiunge la fatturazione Cloud a un’istanza self-hosted senza provider commerciali. Controlla modelli, valori predefiniti, utenti e quote nella release installata prima di modificare. I cambiamenti interessano tutta l’istanza: verificali con un account demo.

## Scegliere il modello di decisione IA {#decision-model}

In **Modelli**, sezione **Automazioni**, **Modello di decisione** imposta l’unico modello di decisione che risponde a tutte le decisioni IA dell’istanza: Smart Fill, Smart Assign e la revisione dei feedback. Non esiste una scelta per progetto, per utente o per funzione. Il selettore propone solo modelli OpenRouter che pubblicano la capacità di decisione; i modelli di chat, embedding e trascrizione non compaiono mai. Il salvataggio prova il candidato con una decisione rappresentativa. Un modello che non è di decisione, rifiuta la richiesta, restituisce una risposta non valida o impiega più di 5 secondi viene rifiutato, e il modello attuale resta in uso. Se il catalogo non può essere caricato, ogni modifica viene rifiutata. Le istanze self-hosted senza IA gestita non hanno un catalogo della piattaforma e mantengono il modello predefinito, Jev.

Le nuove decisioni usano il modello salvato entro circa un minuto su ogni processo del server. Se il modello fallisce o risponde sotto la soglia di confidenza, la decisione ripiega sul modello LLM proprio della funzione, come prima. **Decisioni IA** resta l’interruttore per gli incidenti che invia tutte le decisioni a quel modello LLM. La soglia è stata calibrata su Jev e gli altri modelli di decisione distribuiscono la confidenza in modo diverso: dopo un cambio, controlla la concordanza per modello nella vista di database `ai_decision_evaluations_weekly`. Le righe di utilizzo registrano il modello che ha risposto.

## Mantenere responsabilità operative {#responsibilities}

Rimangono tue responsabilità privilegi minimi, recupero MFA, segreti, backup, conservazione, incidenti e costi. La console non sostituisce il ripristino di database e Storage né la configurazione SMTP. Se l’accesso viene rifiutato, controlla email confermata, allowlist, MFA e sessione prima di cambiare la configurazione. Una sessione revocata o un account bloccato non conserva i privilegi grazie a un JWT ancora valido. Evita screenshot con dati privati di altri utenti, fattori MFA o dettagli finanziari.
