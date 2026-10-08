---
{
  "id": "authentication-and-email",
  "locale": "it",
  "title": "Autenticazione ed email",
  "summary": "Configura le email di autenticazione, i redirect e MFA in Supabase, poi verifica conferma, accesso e recupero.",
  "topic": "Gestire un’istanza",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "docs/self-hosting-auth.md",
      "supabase/email-templates/confirm-signup.html",
      "supabase/email-templates/reset-password.html",
      "lib/self-hosting-email-templates.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root consolidation review; agent:/root/italian_portuguese_review retained-meaning comparison with prior procedural evidence (no operational rerun)",
    "language": "agent:/root/italian_portuguese_review (localized feature scope, summaries and heading review; retained source procedures)",
    "date": "2026-10-09"
  },
  "related": [
    "instance-administration",
    "self-hosted-diagnostics"
  ],
  "aliases": [],
  "tags": [
    "Configurare le email degli account, MFA e recupero",
    "Configurare email account, MFA e recupero"
  ],
  "figures": [
    {
      "id": "authentication-and-email-flow",
      "kind": "diagram",
      "src": "/documentation/it/authentication-and-email-flow.svg",
      "alt": "Schema: Origine Auth e redirect configurati. SMTP proprio e modelli versionati. Conferma e accesso con password. Prove TOTP, recupero e vecchia password.",
      "caption": "Segui le fasi in questo ordine. Origine Auth e redirect configurati. SMTP proprio e modelli versionati. Conferma e accesso con password. Prove TOTP, recupero e vecchia password.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "authentication-and-email-flow"
  ]
}
---

## Configurare le email degli account, MFA e recupero {#authentication-and-email}

Le email degli account dipendono da Supabase e GoTrue. Resend per le notifiche dell’applicazione non configura conferma o recupero password. Nel profilo full conserva l’overlay Minddy in ogni comando Compose. Imposta SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL e ADDITIONAL_REDIRECT_URLS sulle origini della tua istanza. Configura SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_SENDER_NAME con i valori del tuo provider. Mantieni la conferma email attiva e riavvia Auth nel contesto installato.


Prima di usare compose qui sotto, definisci la funzione del profilo full installato dal [contesto Compose di riferimento](/it/documentazione/backups-and-restoration#context).

```bash
compose up -d --wait auth
```


![Schema: Origine Auth e redirect configurati. SMTP proprio e modelli versionati. Conferma e accesso con password. Prove TOTP, recupero e vecchia password.](/documentation/it/authentication-and-email-flow.svg)

## Configurare Supabase gestito {#managed}

Nella sezione Authentication del progetto gestito imposta Site URL e il redirect esatto `<app-origin>/auth/callback`. Configura SMTP e i due template email versionati. La conferma usa token_hash e type=signup. Richiedi password di almeno otto caratteri con minuscole, maiuscole e cifre, e abilita registrazione e verifica TOTP. Se disponibile, attiva il controllo delle password compromesse e registra i limiti del provider. Il profilo full nega l’accesso se quel controllo fallisce e deve poter raggiungere api.pwnedpasswords.com. Registra durata delle sessioni, rotazione refresh, revoca e limiti Auth: il bootstrap SQL non configura questi controlli.

## Verificare il risultato {#verify}

Usa un indirizzo temporaneo sotto il tuo controllo. Verifica ricezione, apertura del link sulla tua istanza e conferma esplicita. Attiva TOTP in sicurezza e conserva i codici di recupero fuori dal browser. Esci e prova un nuovo accesso con password e TOTP. Reimposta la password e verifica che la precedente non funzioni. Prova l’accesso amministratore di un account presente in ADMIN_EMAILS dopo MFA. Registra versioni, date e risultati depurati. Container sani non provano consegna o sicurezza. Non includere token email, password, sessioni, segreti TOTP o codici di recupero.
