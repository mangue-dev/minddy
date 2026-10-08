---
{
  "id": "instance-configuration",
  "locale": "it",
  "title": "Configurare origini, segreti e funzionalità dell’istanza",
  "summary": "MINDDY_PUBLIC_APP_URL è un’unica origine assoluta senza percorso o slash finale.",
  "topic": "Gestire un’istanza",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05"
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
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "workspace-encryption",
    "authentication-and-email"
  ],
  "aliases": [],
  "tags": [],
  "figures": [],
  "requiredFigures": []
}
---

## Configurare origini, segreti e funzionalità dell’istanza {#instance-configuration}

MINDDY_PUBLIC_APP_URL è un’unica origine assoluta senza percorso o slash finale. In pubblico serve HTTPS; localhost e IPv4 privata affidabile possono usare HTTP. MINDDY_PUBLIC_SUPABASE_URL e MINDDY_PUBLIC_SUPABASE_ANON_KEY devono appartenere allo stesso stack; arrivano al browser. SUPABASE_SERVICE_ROLE_KEY resta solo server ed è obbligatoria in produzione, mai in variabili pubbliche o bundle client. URL database serve agli strumenti, non sostituisce configurazione API.

## Conservare i segreti {#secrets}

L’installer integra GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET e AGENT_RUNNER_SECRET mancanti. La radice ha esattamente 64 caratteri esadecimali. Mantienila fuori PostgreSQL con copia di recupero protetta. Tutto l’ambiente resta 0600 e fuori Git. Non eseguirlo come shell e non stamparlo. Ripetere installazione non ruota segreti; perderli può rendere dati illeggibili. La rotazione deliberata richiede procedura corretta.

## Applicare e controllare una modifica {#capabilities}

MINDDY_PUBLIC_SITE_NAME e MINDDY_PUBLIC_CONTACT_EMAIL identificano l’istanza. ADMIN_EMAILS elenca amministratori separati da virgole, con MFA obbligatoria. OAUTH_ISSUER normalmente resta vuoto salvo OAuth pubblicato intenzionalmente su altra origine stabile. Disattiva IA/fatturazione gestite in self-hosted. Servizi opzionali richiedono configurazione completa. Riavvia o ricrea app dopo modifica valori pubblici runtime, senza rebuild OCI. doctor distingue capacità incomplete da errori del nucleo. Prova link account e callback sull’origine prevista.
