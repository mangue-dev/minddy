# Éditions et services managés

## Décision

minddy est un cœur **AGPL-3.0-only** installable et utilisable sans compte
minddy, Stripe, crédit IA minddy ni appel vers une infrastructure opérée par
minddy. Une installation est auto-hébergée par défaut. Les services opérés par
minddy sont des opt-ins explicites : une clé laissée dans l'environnement ne
les active pas à elle seule.

| Périmètre | Cœur auto-hébergé (AGPL) | Cloud minddy | Éventuel service entreprise |
| --- | --- | --- | --- |
| Produit | Application, API, migrations, exports, desktop, MCP et administration | Même cœur, hébergé et opéré par minddy | Aucun module distribué à ce jour |
| Données et comptes | Instance et Supabase de l'opérateur | Opérés par minddy | Ne peut pas devenir nécessaire au cœur |
| Paiement | Aucun Stripe requis ; aucune carte ni plan ne bloque le cœur | Stripe, uniquement quand `MINDDY_MANAGED_BILLING=1` et sa configuration est complète | Support, SLA, migration ou exploitation, hors de ce dépôt |
| IA | BYOK vers un fournisseur choisi, ou endpoint local/modèle auto-hébergé ; la clé et le coût restent chez l'opérateur | Quota minddy seulement quand `MINDDY_MANAGED_AI=1` et OpenRouter est configuré | Peut être opéré comme service séparé, jamais comme verrou du cœur |
| Limites | Aucune limite commerciale de projets, tickets, membres ou agents | Plans et quotas mesurés dans le ledger, selon le contrat cloud | À redécider après contrôle de chaîne de droits |

## Contrat de configuration

- `MINDDY_MANAGED_BILLING=1` active l'intégration Stripe **si** les secrets et
  price IDs requis sont présents. Sinon le service est indisponible ; aucune
  requête Stripe ne part et les routes d'achat renvoient `503`.
- `MINDDY_MANAGED_AI=1` autorise la clé plateforme OpenRouter. Sans cet opt-in,
  minddy ne choisit jamais `OPENROUTER_API_KEY` comme repli : un appel IA exige
  une clé BYOK ou un endpoint local configuré par l'opérateur.
- Ces deux drapeaux sont l'unique sélection d'édition. Le hostname, Vercel, le
  nom de branche et un identifiant de client ne peuvent activer ni billing ni
  quota managé, y compris sur `minddy.app` et sur la branche `production`.
- L'interface cloud n'affiche achats, portail Stripe, budget ni limites que
  lorsque les capacités correspondantes sont actives. L'API expose ces
  capacités pour que les clients ne déduisent jamais un droit d'une clé ou d'un
  plan par défaut.
- `AGENT_EXECUTION_BACKEND=vercel` est le seul choix qui autorise la création ou
  le réveil d'un Vercel Sandbox. Des identifiants Vercel présents pour les
  domaines ne déclenchent donc jamais de compute. Hors Vercel,
  `NEXT_PUBLIC_APP_URL` est également requis afin que la sandbox rappelle cette
  instance plutôt qu'une origine propriétaire implicite.
- `EMAIL_PROVIDER=resend` est requis avant tout appel à l'API Resend. Les
  expéditeurs sont obligatoires et propres à l'instance ; aucun domaine minddy
  n'est choisi par défaut.
- PostHog est un provider facultatif du cœur public, pas une capacité réservée
  au Cloud. Chaque surface exige sa paire atomique :
  `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` pour le navigateur,
  `POSTHOG_API_KEY` + `POSTHOG_HOST` pour le serveur. Une paire serveur absente
  peut réutiliser la paire publique complète ; deux demi-paires ne sont jamais
  assemblées. L'opérateur choisit ainsi sa destination PostHog, tandis que
  Minddy Cloud fournit sa propre configuration d'exploitation.
- Web Push exige un `VAPID_SUBJECT`, et APNs un `APNS_BUNDLE_ID` explicites.
- Vercel Analytics et Speed Insights ne sont montés sur les pages publiques
  qu'avec `NEXT_PUBLIC_VERCEL_ANALYTICS=1`.
- Les providers Git intégrés ciblent `github.com` et `gitlab.com`. Les forges
  auto-hébergées sont explicitement non supportées tant qu'un provider
  configurable n'existe pas.

Les anciennes déductions fondées sur le déploiement Vercel ou une origine
`*.minddy.app` ne sélectionnent plus les services managés. Le déploiement Cloud
doit fournir les mêmes drapeaux explicites que n'importe quel opérateur.

Le catalogue exécutable de ces décisions vit dans `lib/capabilities.ts`. Il
classe chaque capacité (`required`, `replaceable`, `optional`), énumère les
variables absentes et produit le diagnostic utilisé par les gardes serveur.

## BYOK, modèles locaux et quota managé

**BYOK** est une clé fournie par l'utilisateur pour un fournisseur distant. Les
tokens sont alors facturés par ce fournisseur à son titulaire. Un **modèle
auto-hébergé** est un endpoint local ou privé configuré par l'opérateur ; aucun
appel ne quitte l'infrastructure désignée par cet endpoint. Le **quota minddy**
est distinct : il ne s'applique qu'aux tokens et au compute réellement fournis
par le cloud minddy, et son coût est enregistré dans `ai_usage`.

Ainsi, une installation auto-hébergée peut volontairement utiliser OpenRouter
avec sa propre clé en BYOK ; cela ne transforme pas cette instance en client du
quota minddy. À l'inverse, une instance cloud qui propose la clé plateforme
continue de mesurer ses appels et son compute avant de les servir.

## Matrice CI des éditions

Le job `Édition / …` de `.github/workflows/ci.yml` exécute chaque scénario dans
un job GitHub Actions jetable, sans `secrets.*`. Les valeurs sous
`test/fixtures/editions/` sont des marqueurs factices qui ne donnent accès à
aucun fournisseur. Les deux éditions déployables (`self-hosted-minimal` et
`minddy-cloud`) passent en plus par `next build`, puis un démarrage HTTP réel ;
les configurations partielles sont testées comme capacités indisponibles.

| Fixture | Attendu |
| --- | --- |
| `self-hosted-minimal.env` | Le cœur démarre sans Stripe ni IA managée ; aucune garde commerciale ne lit le plan. |
| `self-hosted-byok.env` | La clé opérateur est le payeur ; aucun quota, ledger ni compte fournisseur minddy n'est consulté. |
| `minddy-cloud.env` | Billing et IA managés sont prêts ; gardes de plan, webhook Stripe, payeur plateforme et quota sont actifs. |
| `partial-billing.env` | Billing est annoncé `incomplete`, les variables absentes sont listées et le webhook répond `503`. |
| `partial-ai.env` | IA managée est annoncée `incomplete` et le runtime refuse tout repli plateforme. |
| `implicit-identifiers.env` | Domaine `minddy.app`, Vercel, branche `production`, identifiant client et clés présentes restent self-hosted sans opt-in. |

Le test d'intégration couvre ensemble `lib/managed-services.ts`, le catalogue de
capacités, `lib/server/entitlements.ts`, l'adaptateur et le webhook Stripe,
`lib/server/ai-runtime.ts` et `lib/server/agent/quota.ts`. Pour rejouer une
fixture localement depuis la racine du dépôt :

```bash
set -a
source test/fixtures/editions/self-hosted-minimal.env
set +a
pnpm exec vitest run lib/server/editions.integration.test.ts
```

## Frontière de dépôt

La frontière suit [la politique de licence](licensing.md) : le cœur et tout ce
qui est nécessaire à son usage normal restent dans ce dépôt AGPL. Facturation,
support, supervision de flotte, opérations et éventuels engagements entreprise
vivent dans un service ou dépôt séparé et utilisent des protocoles documentés.
Il n'existe actuellement ni package Enterprise ni extension propriétaire
chargeable par le cœur. Toute évolution de cette frontière exige le contrôle de
chaîne de droits prévu par `docs/licensing.md`.
