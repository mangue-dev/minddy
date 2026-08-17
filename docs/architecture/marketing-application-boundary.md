# Frontière entre le site marketing et l'application

## Décision

Minddy reste un **monorepo public**, avec deux applications déployables de
façon indépendante :

| Application | Répertoire | Domaine de production | Rôle |
| --- | --- | --- | --- |
| Produit auto-hébergé | racine du dépôt | `app.minddy.app` ou domaine de l'instance | Application Next.js, API, jobs et intégrations d'une instance. |
| Site marketing | `apps/marketing` | `www.minddy.app` | Présentation du produit, prix, documentation d'acquisition et appels à l'action. |

Ce choix conserve une revue unique et une histoire Git cohérente sans faire du
site marketing une dépendance du produit. Les deux applications sont deux
projets Vercel distincts : le projet marketing a `apps/marketing` comme *Root
Directory* et le projet produit a la racine comme *Root Directory*.

## Contrat de dépendance

- Le produit ne doit jamais importer depuis `apps/marketing` ; son build,
  l'installation d'une instance et son déploiement ne consultent pas ce
  répertoire.
- Le marketing ne doit importer aucun module de l'application ni appeler ses
  routes privées. Il ne dépend que d'URLs publiques configurées au build.
- Aucun package partagé n'est introduit pour le moment. Les dépendances sont
  déclarées et verrouillées par application. Si du code devient réellement
  commun, il sera extrait dans un paquet public versionné séparément selon
  SemVer, avec une dépendance explicite (jamais un import de fichier relatif
  entre applications).
- Les routes marketing historiques à la racine sont une compatibilité de
  transition uniquement. Le routage des domaines donne `www.minddy.app` au
  projet marketing ; elles ne constituent pas une dépendance du nouveau site.

## Environnements et secrets

Le projet marketing ne reçoit que :

- `NEXT_PUBLIC_SITE_URL` (optionnelle, URL canonique du site) ;
- `NEXT_PUBLIC_APP_URL` (URL publique de l'application visée par les CTA) ;
- `NEXT_PUBLIC_POSTHOG_KEY` et `NEXT_PUBLIC_POSTHOG_HOST` (optionnels,
  identifiants volontairement publics de mesure d'audience).

Il ne reçoit jamais les variables Supabase, Stripe, OpenRouter, Vercel Sandbox,
cron, web-push ou `service_role` de l'application. Réciproquement, le projet
produit n'a pas besoin de variable marketing : un lien externe public peut être
configuré par l'instance qui le souhaite.

## Releases

Chaque projet Vercel construit son propre `package.json` et déploie sur ses
propres branches de production. Une modification dans `apps/marketing` peut
être publiée sans migration, cron, vérification de l'application ou release
desktop ; une release du produit ne lance ni ne bloque celle du marketing.
La CI exécute les deux builds séparément pour que cette propriété soit vérifiée
dans le dépôt.
