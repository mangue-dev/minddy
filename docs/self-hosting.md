# Auto-héberger minddy

minddy s'appuie sur une pile Supabase complète : PostgreSQL, Auth, Storage et
Realtime. Une base PostgreSQL seule ne suffit pas : les migrations utilisent les
schémas `auth`, `storage`, `realtime` et `extensions`, et l'application appelle
les API Auth et Storage.

Supabase est la **seule infrastructure obligatoire**. La configuration minimale
d'un serveur public contient son origine canonique et les trois accès Supabase :

```dotenv
NEXT_PUBLIC_APP_URL=https://tickets.example.test
NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.test
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
```

En développement, `NEXT_PUBLIC_APP_URL` peut rester vide et vaut alors
`http://localhost:3000`. Elle doit être explicite sur un serveur public : elle
alimente les liens d'invitation, OAuth/MCP et les webhooks GitLab, sans jamais
retomber sur une URL de l'infrastructure minddy. `NEXT_PUBLIC_SITE_NAME` et
`NEXT_PUBLIC_CONTACT_EMAIL` personnalisent les valeurs de marque publiques.

Avec cette configuration, le cœur (comptes, projets, tickets, objectifs, pages,
feedback, API et stockage Supabase) démarre. Stripe, OpenRouter, Vercel,
PostHog, Resend, les push et les forges ne sont ni contactés ni nécessaires.

La configuration versionnée pour la pile locale est
[`supabase/config.toml`](../supabase/config.toml). Pour une infrastructure
distante, partez de la distribution officielle Supabase auto-hébergée et assurez
que ces quatre services sont exposés avant de lancer le bootstrap.

## Prérequis

- Node.js 24 et pnpm 10 ;
- la [Supabase CLI](https://supabase.com/docs/guides/local-development) dans le
  `PATH` ;
- `psql` dans le `PATH` (le bootstrap l'utilise pour contrôler le résultat) ;
- Docker pour le mode local, ou une pile Supabase auto-hébergée déjà démarrée ;
- pour le mode distant, une URL PostgreSQL d'un rôle propriétaire du schéma,
  l'URL publique de l'API Supabase, sa clé anon et sa clé `service_role`.

Ne transmettez jamais la clé `service_role` au navigateur ou à Git. Elle n'est
nécessaire qu'au shell qui lance cette procédure et est copiée dans `.env.local`,
un fichier ignoré par Git.

## Pile locale, de zéro

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm bootstrap:supabase
pnpm dev
```

`bootstrap:supabase` démarre la pile définie dans `supabase/config.toml`, valide
les noms et l'ordre du baseline et des migrations en attente, applique les migrations,
complète `.env.local` et vérifie ensuite la base et l'API Storage. Il génère les
secrets applicatifs qui protègent les webhooks et les données chiffrées ; les
clés Supabase sont récupérées depuis `supabase status`.

Le bootstrap peut générer des secrets applicatifs facultatifs pour préparer les
fonctions correspondantes, mais leur simple présence ne les active pas. En
particulier, les services managés exigent `MINDDY_MANAGED_AI=1` ou
`MINDDY_MANAGED_BILLING=1`, Resend exige `EMAIL_PROVIDER=resend`, et Vercel
Sandbox exige `AGENT_EXECUTION_BACKEND=vercel`.

## Capacités facultatives et remplacements

| Capacité | Nature | Configuration / remplacement |
| --- | --- | --- |
| Base, Auth, Realtime, Storage | obligatoire | Pile Supabase complète ; le stockage de production reste le Storage de cette instance |
| IA | remplaçable | BYOK ou endpoint local ; quota OpenRouter managé seulement avec `MINDDY_MANAGED_AI=1` |
| Agent de code | remplaçable | Runtime local, ou Vercel Sandbox explicitement choisi avec `AGENT_EXECUTION_BACKEND=vercel`; hors Vercel, `NEXT_PUBLIC_APP_URL` est aussi requis pour joindre le plan de contrôle de cette instance |
| Jobs de fond | remplaçable | N'importe quel ordonnanceur HTTP sur `/api/cron/*`, protégé par `CRON_SECRET`; Vercel Cron n'est qu'une option |
| E-mail Auth | remplaçable | SMTP configuré dans Supabase/GoTrue |
| E-mail applicatif | remplaçable | `EMAIL_PROVIDER=resend` + clé + expéditeurs, ou `console` en développement |
| Domaines Vercel, PostHog, Web Push, APNs, GitHub, GitLab, Stripe | facultative | Absence = interface masquée/inactive et aucun appel réseau |

Les adaptateurs de forge fournis ciblent explicitement `github.com` et
`gitlab.com`. GitHub Enterprise Server et les instances GitLab auto-hébergées ne
sont pas sélectionnés silencieusement : ils ne sont pas encore supportés et
nécessitent un provider alternatif.

Les expéditeurs, hôtes PostHog, sujet VAPID et bundle APNs n'ont volontairement
aucune valeur par défaut : ils doivent décrire l'infrastructure de l'opérateur,
jamais celle de minddy.

La commande est réexécutable : `supabase db push` n'applique que les migrations
absentes et les valeurs déjà présentes dans `.env.local` ne sont jamais
remplacées. Pour repartir d'une base locale vide, l'action est explicitement
destructive : `supabase db reset --local`, puis relancez le bootstrap.

## Pile auto-hébergée distante

La pile distante doit être démarrée et ses API joignables. Exportez les valeurs
avant de lancer la commande :

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://supabase.example.test"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="…"
export SUPABASE_SERVICE_ROLE_KEY="…"
export SUPABASE_DB_URL="postgresql://postgres:…@db.example.test:5432/postgres"
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
```

Le script ne peut pas déduire les clés HTTP depuis une URL PostgreSQL ; il refuse
donc de commencer si l'une de ces valeurs manque. Après les migrations, il
contrôle `vector` dans le schéma `extensions`, les schémas Supabase requis, la
publication Realtime, les tables et valeurs `app_config`, les buckets actifs et
la policy d'upload. Les buckets sont créés ou mis à jour par l'API Storage : ils
ne font pas partie d'un dump de schéma PostgreSQL. Le bucket historique `avatars`, inutilisé par minddy, est
supprimé uniquement s'il est vide ; s'il contient des objets, la commande refuse
avec un diagnostic afin qu'ils soient archivés ou supprimés consciemment.

## Transition depuis l'historique avant baseline

Le dépôt a consolidé les 211 migrations historiques en un baseline de schéma et
une migration de données initiales. Une **instance neuve** applique directement
ces deux fichiers. Pour une instance existante, ne lancez pas `db push` avant
d'avoir sauvegardé la base et remplacé son historique de migration : son schéma
est déjà à jour, seul `supabase_migrations.schema_migrations` doit oublier les
210 anciennes versions et conserver la version du baseline
`20270106090000`.

Faites cette opération dans une fenêtre de maintenance, après une sauvegarde
restaurable et après avoir vérifié l'absence de dérive (`supabase db diff` ou
une comparaison avec l'instance de production) :

```bash
# Sans --apply : vérifie que l'instance porte exactement les 211 versions attendues.
# --linked utilise le projet sélectionné par `supabase link`.
pnpm repair:squashed-migrations -- --linked

# Retire uniquement les 210 enregistrements historiques ; ni schéma ni données ne bougent.
pnpm repair:squashed-migrations -- --linked --apply
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
```

Le script s'arrête si l'instance n'est pas exactement au niveau de l'ancien
historique. Une fois la réparation faite, le bootstrap ne réapplique pas le
baseline et peut poursuivre normalement avec les futures migrations.

Si l'équipe avait appliqué une ou plusieurs migrations SQL à la main, le
registre peut être incomplet alors que le schéma est bien présent. Comparez
d'abord le schéma avec le baseline et corrigez les écarts voulus dans une
migration versionnée. Le mode explicite ci-dessous remplace ensuite le registre
par le baseline ; l'empreinte recopiée évite de réparer entre deux changements
d'historique :

```bash
supabase db diff --linked --schema public,extensions,storage
pnpm repair:squashed-migrations -- --linked --allow-manual-schema
pnpm repair:squashed-migrations -- --linked --allow-manual-schema --apply \
  --confirm-history '<empreinte affichée>'
```

## Vérification et test

Pour vérifier une instance déjà préparée sans modifier son schéma :

```bash
pnpm verify:supabase -- \
  --db-url "$SUPABASE_DB_URL" \
  --supabase-url "$NEXT_PUBLIC_SUPABASE_URL" \
  --service-role-key "$SUPABASE_SERVICE_ROLE_KEY"
```

`pnpm test:bootstrap:supabase` teste automatiquement l'intégrité des migrations,
les diagnostics et la seconde exécution du générateur d'environnement. Le chemin
à exercer sur une pile jetable est le mode local : lancez `pnpm bootstrap:supabase`
dans un clone neuf, puis une seconde fois ; les deux passages doivent réussir.
