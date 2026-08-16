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
- L'interface cloud n'affiche achats, portail Stripe, budget ni limites que
  lorsque les capacités correspondantes sont actives. L'API expose ces
  capacités pour que les clients ne déduisent jamais un droit d'une clé ou d'un
  plan par défaut.

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

## Frontière de dépôt

La frontière suit [la politique de licence](licensing.md) : le cœur et tout ce
qui est nécessaire à son usage normal restent dans ce dépôt AGPL. Facturation,
support, supervision de flotte, opérations et éventuels engagements entreprise
vivent dans un service ou dépôt séparé et utilisent des protocoles documentés.
Il n'existe actuellement ni package Enterprise ni extension propriétaire
chargeable par le cœur. Toute évolution de cette frontière exige le contrôle de
chaîne de droits prévu par `docs/licensing.md`.
