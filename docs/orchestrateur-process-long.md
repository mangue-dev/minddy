# L'orchestrateur dans la microVM — cadrage

> **Date** : 2026-08-07 · **Ticket** : MIN-221 · **Objectif** : *Orchestrateur en
> process long* (MIN-222 à MIN-225)
>
> **La direction était prise avant ce document** : la boucle vit dans la microVM,
> la fonction reçoit la requête, démarre ou réveille la VM, et rend la main. On ne
> change pas de fournisseur. Ce document ne rouvre pas cette décision — il tranche
> les sept points qui la rendent constructible, et il en corrige deux prémisses.
>
> **Ce qui a été mesuré pour l'écrire**, plutôt que supposé : le courtage de
> credentials du firewall Vercel Sandbox, exercé dans une vraie microVM avec la
> vraie clé plateforme (§1) ; le coût d'un aller-retour de commande (§5). Les deux
> sondes sont reproductibles, leur méthode est dans le texte.

---

## Ce qui a changé depuis l'écriture des tickets

Deux prémisses du chantier ne tiennent plus telles quelles. Elles ne l'annulent
pas — l'une le simplifie beaucoup, l'autre lui retire un argument.

**Le proxy de credentials n'est pas à construire.** MIN-223 proposait de départager
deux formes à écrire nous-mêmes (un endpoint relais, ou une re-signature du trafic
sortant « sur le modèle Cloudflare »). La seconde existe **nativement dans Vercel
Sandbox**, dans le SDK déjà installé (`@vercel/sandbox@2.6.0`), sous le nom de
*credentials brokering*. Elle est mesurée en §1. Le ticket estimé `l` devient une
question de configuration et de garde-fous, pas d'infrastructure.

**Le gain de latence n'est pas établi.** MIN-224 chiffre « ~0,3 s par tool call,
soit 30 à 45 s par run ». La mesure de §5 ne le confirme pas, et le chiffre doit
être re-dérivé avant d'être resservi. Ça ne change pas la décision : le dossier de
la migration, ce sont les **11 défauts sur 15** de [problems.md](../problems.md)
qui vivent dans le découpage, pas la latence.

---

## 1. Le proxy de credentials

**Décision : aucune des deux formes proposées. Le firewall de Vercel Sandbox fait
le courtage, et la microVM ne détient plus rien du tout.**

`networkPolicy` accepte, par domaine, des règles à `match` (méthode, chemin,
en-têtes, query) et `transform` (en-têtes à poser sur la requête sortante). La
réécriture a lieu **après la sortie de la VM**, dans le proxy qui termine le TLS :
le secret n'entre jamais dans son espace mémoire. La politique se pose à la
création et **se met à jour à chaud** (`sandbox.updateNetworkPolicy`), sans
redémarrer le process.

**Sonde du 2026-08-07** — microVM `node24` réelle, clé plateforme OpenRouter réelle,
politique posée à la création :

```ts
{ allow: {
    "openrouter.ai": [{
      match: { method: ["POST"], path: { exact: "/api/v1/chat/completions" } },
      transform: [{ headers: { authorization: `Bearer ${OPENROUTER_API_KEY}` } }],
    }],
    "*": [],   // le reste d'Internet reste ouvert — cf. plus bas
} }
```

| Ce qu'on a lancé dans la VM | Résultat |
| --- | --- |
| `env \| grep -iE 'key\|token\|secret'` | **aucune variable sensible** |
| `grep -c 'sk-or' /proc/self/environ` | **0** |
| `POST /api/v1/chat/completions`, `Authorization: Bearer minddy-placeholder` | **HTTP 200**, complétion réelle, `cost: 0,00000581 $`, `is_byok: false` |
| `GET /api/v1/key`, **même** placeholder (hors matcher) | **HTTP 401** `Missing Authentication header` |
| `GET httpbin.org/headers` (via le catch-all `*`) | reçoit `Bearer minddy-placeholder` — **l'injection ne fuit pas ailleurs** |

Le matcher est donc une frontière réelle : la VM peut faire *une* chose créditée,
et pas la route de provisioning d'à côté qui aurait permis d'émettre des clés.

**Ce que la microVM détient quand même : rien.** Pas de jeton court, pas de clé à
portée réduite. C'est plus fort que ce que le ticket espérait, et ça vaut aussi
pour son identité — cf. §2, où elle est prouvée par la plateforme au lieu d'être
portée par un secret.

**Ce qui reste possible, et qu'il faut nommer.** Un modèle hostile peut appeler la
route créditée **en dehors de la boucle** : la sonde vient de le faire, avec un
`curl`. Ce n'est pas de l'exfiltration, c'est de la **dépense** — et elle échappe
au ledger. Le garde-fou n'est pas un contrôle de plus dans la VM (elle est
compromise par hypothèse), c'est une **clé OpenRouter par run, à plafond dur**,
mintée au lancement par la fonction via l'API de provisioning, injectée par le
`transform`, révoquée à la fin du run. Le plafond est alors tenu par le
fournisseur, hors de la VM *et* hors de notre code. En BYOK, on ne peut pas
plafonner la clé de l'utilisateur : c'est sa clé et sa facture — à **dire** dans
l'écran BYOK, pas à corriger.

**Ce qu'on ne cherche pas à fermer, et pourquoi c'est ce qui débloque le
chantier.** L'exfiltration du *contenu du dépôt* reste possible : le catch-all `*`
laisse la VM joindre n'importe quoi. C'est déjà le cas aujourd'hui (`run_command`
+ réseau ouvert, cf. §3.2 du [comparatif](agent-harness-comparison.md)), la
migration ne l'aggrave pas, et une liste blanche stricte casserait `npm install`
sur les dépôts de nos utilisateurs — dont on ne connaît ni les registres privés ni
les miroirs. Traiter « le secret ne doit pas sortir » et « la donnée ne doit pas
sortir » comme **deux problèmes** est ce qui rend le premier soluble aujourd'hui.
Le second reste ouvert, et le firewall saura le fermer le jour où on en aura le
besoin et la connaissance des dépôts.

**Contrepartie technique à connaître** : pour transformer, le proxy **termine le
TLS**, avec une CA par sandbox ajoutée aux certificats système. La sonde confirme
que les variables standard sont déjà câblées (`NODE_EXTRA_CA_CERTS`,
`CURL_CA_BUNDLE`, `GIT_SSL_CAINFO`, `SSL_CERT_FILE`, `NODE_USE_SYSTEM_CA=1`…). Un
outil du dépôt qui embarque son propre bundle de CA échouera — cas rare, message
d'erreur à reconnaître.

---

## 2. Le canal d'events

**Décision : appel HTTP vers une route de collecte — mais ce n'est pas nous qui le
signons, et la VM ne porte aucun jeton.**

Le même firewall offre le `forwardURL` : les requêtes de la VM vers un domaine
donné sont **forwardées vers un handler à nous**, avec en plus l'en-tête
`vercel-sandbox-oidc-token`. Ses claims portent `team_id`, `project_id`,
`sandbox_id` et `sandbox_name` — et notre `sandbox_name` **est** `agent-<run.id>`
([sandbox.ts:23](../lib/server/agent/sandbox.ts)). `defineSandboxProxy`
(`@vercel/sandbox/proxy`) vérifie signature, émetteur, expiration et `aud`.

L'identité du run est donc **prouvée par la plateforme et infalsifiable depuis la
VM**. Conséquences directes :

- aucune clé Supabase n'entre dans la microVM, à aucune portée ;
- une VM ne peut écrire d'events que sur **son** run — pas parce qu'on le vérifie,
  parce qu'elle ne peut rien prétendre d'autre ;
- le direct suit le même chemin : `broadcastRunStream`
  ([live.ts:93](../lib/server/agent/live.ts)) devient un POST sur la même surface,
  et le collecteur **dérive le topic du `sandbox_name`** au lieu de le recevoir.
  Un run ne peut pas diffuser sur le fil d'un autre. Une clé Supabase à portée
  réduite, elle, n'aurait pas su l'empêcher : le topic est un paramètre.

Côté serveur, la route de collecte fait ce que `appendEvent`
([runs.ts:1076](../lib/server/agent/runs.ts)) fait déjà — même calcul de `seq`,
même retente sur collision, même `broadcastRunEvent` derrière.

**Le point qui était à mesurer avant de s'y engager : mesuré, et il passe.**
Sonde du 2026-08-07 (MIN-223) — microVM `node24` réelle, route `defineSandboxProxy`
déployée en preview, `forwardURL` = l'origine nue du déploiement :

| Ce qu'on a mesuré | Résultat |
| --- | ---: |
| Aller-retour JSON, connexion neuve (médiane de 20) | **62 ms** (min 49, max 130) |
| Le même en réutilisant la connexion (médiane de 20) | **55 ms** |
| Flux SSE de 60 s | **tenu** — 200, TTFB **54 ms**, 61 events, total 60,08 s |
| Corps de requête accepté | **4 Mio oui, 4,3 Mio non** (413 `FUNCTION_PAYLOAD_TOO_LARGE`) |
| `sandbox_name` reçu dans le handler | **exact**, l'identité du run est bien prouvée |
| Politique après une reprise de session | **survit** — complétion 200 et forward 200 sans rien reposer |

Le plan de contrôle coûte donc **~55 ms par appel** contre les ~211 ms d'un
aller-retour `runCommand` (§5) : il n'est pas le point cher de la migration. Le
repli (`transform` sur le domaine Supabase, en assumant qu'une VM compromise
puisse écrire des events sur un autre run) **n'a pas lieu d'être** — on le laisse
écrit pour mémoire, il n'est plus le chemin.

**Deux résultats à ne pas perdre, parce qu'ils contraignent MIN-224.**

1. **Le corps est plafonné à 4,5 Mo** — la limite des fonctions Vercel, que le
   forward ne relève pas. Or `MAX_CHECKPOINT_BYTES` vaut **8 Mo**
   ([checkpoint-fit.ts](../lib/server/agent/checkpoint-fit.ts)) : un checkpoint à
   son plafond actuel **ne passe pas**. La route refuse elle-même au-delà de 4 Mo,
   en JSON — sans ça la plateforme rend un 413 en HTML qu'une boucle lirait comme
   un succès, et c'est le checkpoint qu'on perdrait. À trancher dans MIN-224 :
   abaisser le plafond de `fitCheckpoint`, ou sortir le checkpoint de cette route.
2. **Le domaine appelé doit RÉSOUDRE en DNS.** Un TLD fictif
   (`minddy-control.invalid`) et un sous-domaine sans enregistrement
   (`agent-vm.minddy.app`) échouent tous deux en `curl (6) could not resolve host`,
   en http comme en https : le firewall n'intercepte pas une résolution qui n'a pas
   lieu. D'où la forme retenue — la VM appelle **notre propre origine**, et le
   `forwardURL` étant cette origine nue, l'URL qu'elle appelle et celle qui arrive
   chez nous sont littéralement la même ; le firewall n'y ajoute que l'OIDC.

**Transform ou forwardURL pour le LLM ?** Les deux marchent ; ils ne tiennent pas
la même promesse.

| | `transform` (mesuré, §1) | `forwardURL` (non mesuré) |
| --- | --- | --- |
| La clé entre-t-elle dans la VM ? | non | non |
| Qui compte la dépense ? | la boucle, **dans** la VM | notre handler, **hors** de la VM |
| Une VM compromise peut-elle dépenser hors compteur ? | oui (borné par la clé à plafond) | non |
| Invocations de fonction | zéro | une par round LLM |
| Streaming SSE long | natif | **tenu** (mesuré : 60 s, TTFB 54 ms) |

**Retenu : `transform` + clé par run à plafond dur.** C'est le seul des deux qui
soit mesuré, il n'ajoute aucune invocation sur le chemin le plus chaud, et le
plafond fournisseur borne exactement ce que le compteur manquerait. `forwardURL`
reste le chemin du plan de contrôle (events, checkpoint, tools), où le volume est
faible et où l'identité prouvée vaut plus que la latence.

**Le coût d'invocations, chiffré parce qu'il surprendra sinon** : `emitLive`
diffuse ~4×/s (`LIVE_FLUSH_MS = 250`). Un tour de dix minutes fait ~2 400 appels
au plan de contrôle. Trois issues, dans l'ordre où on les prendra : garder 250 ms
et **mesurer** ; monter à 500 ms ; ou tenir **une seule connexion longue** (les
fonctions Vercel acceptent désormais les WebSockets). La v1 prend la première, et
pose le chiffre au tableau de bord — pas l'inverse.

---

## 3. Ce qui reste dans la fonction

La frontière, noir sur blanc. **Tout ce qui n'est pas dans cette liste part dans
la VM.**

1. **Le lancement** (`launchAgentRun`) : quota, création de la ligne `agent_runs`,
   résolution du dépôt et mint du token de forge, création ou réveil de la
   microVM, **pose de la `networkPolicy`**, démarrage du process de boucle en
   `detached: true`, retour immédiat.
2. **Le réveil** : le même geste sur un run au repos qu'on relance (`/steer` sur un
   run `completed`).
3. **Le plan de contrôle** que la VM appelle (§2) : events, checkpoint, ledger
   `ai_usage`, tools ticket et carnet, tools de forge (`create_pr`, commentaires de
   PR), notifications, sync de statut du ticket, crochets de chaîne
   d'automatisation.
4. **Les lectures de l'UI** : events, diff, PR, heartbeat — inchangées, elles ne
   savent rien de tout ça.
5. **`steer` et `interrupt` — inchangés, et c'est le point le moins cher du
   chantier.** Les deux passent déjà par la base (`agent_run_messages`,
   `interrupt_requested`) et la boucle les *interroge*
   ([agent-loop.ts:853](../lib/server/agent/agent-loop.ts)). Elle continuera,
   depuis la VM, par le plan de contrôle. **Aucune voie de commande fonction→VM
   n'est à inventer** — ni port exposé, ni websocket, ni fichier signal.
6. **Le reaper de microVM inactive** (`reapIdleSandboxes`) et le **chien de garde**
   qui remplace `requeueStuckRuns` (§4).

Ce qui part, donc : `runAgentLoop` et toute son orchestration, les 25 tools, le
prompt système, la cascade d'édition, l'élagage, la compaction, les sous-agents,
les jobs de fond, `commitAndPush`.

**Comment le code arrive dans la VM.** Le paquet à embarquer ne contient **aucun
SDK** — ni `@supabase/supabase-js`, ni client de forge : tout passe par `fetch`
vers le plan de contrôle. C'est de la logique pure plus des appels HTTP. Un bundle
esbuild écrit par `writeFiles` au démarrage suffit (esbuild n'est pas encore une
dépendance du dépôt : c'est un ajout à faire). L'image pré-chauffée
(`AGENT_SANDBOX_SNAPSHOT_ID`, déjà câblée) reste l'optimisation d'après, pas la v1.

**Le métrage de la microVM change de main.** `recordSandboxUsage`
([execute.ts:3176](../lib/server/agent/execute.ts)) facture aujourd'hui le
wall-clock du chunk depuis le `finally` de la fonction. Sans chunk, il n'y a plus
personne pour tenir cette horloge : le métrage devient « début du tour → fin du
tour », posé par la boucle au moment où elle rend la main, avec le chien de garde
comme filet quand elle ne le fait pas. **À ne pas oublier** : c'est la moitié
compute de la facture, et elle disparaîtrait en silence.

---

## 4. Quand la VM meurt quand même

**Décision : le checkpoint ne disparaît pas, il change de rôle.** Aujourd'hui il
est le transport entre deux **chunks**. Demain il est l'état entre deux **tours**,
plus une sauvegarde périodique en cours de tour.

**Pourquoi il ne peut pas disparaître.** Une conversation au repos trois jours,
dont la microVM a été coupée par le reaper (~5 min d'inactivité) et le snapshot
effacé par son expiration, doit repartir avec son historique. Le checkpoint est le
seul endroit où il vit.

**La branche WIP poussée ne suffit pas**, contrairement à ce que le ticket
espérait — et c'est le point à contredire en priorité si quelqu'un n'est pas
d'accord. Elle sauve le **travail**, pas la **conversation**. Un tour repris depuis
git seul retrouve son code et perd tout ce que le modèle avait compris, essayé,
écarté. C'est déjà vrai aujourd'hui au-delà de l'expiration du snapshot, et c'est
déjà mauvais.

**La forme retenue** : écriture à la fin de chaque tour (comme aujourd'hui), plus
un point de sauvegarde périodique en cours de tour — toutes les N minutes ou M
rounds, à calibrer. Sans lui, un tour de deux heures qui perd sa VM perd deux
heures. `fitCheckpoint` ([checkpoint-fit.ts](../lib/server/agent/checkpoint-fit.ts),
MIN-217) est conservé tel quel : écrit six fois moins souvent, pas moins utile.

**Le chien de garde remplace `requeueStuckRuns`.** Un run `running` dont le process
de boucle est mort — `Command.wait()` a rendu, ou la session de la VM a disparu —
repasse au repos sur son dernier checkpoint, et **le dit dans le fil**. Ce n'est
plus un vol de claim sur un présumé bloqué (`STUCK_RUNNING_MS`, 20 min de silence),
c'est un constat de décès, et il est exact : la plateforme sait si le process vit.

---

## 5. Les tools dans la VM

**`resolveWithin` et `assertNotGit` gardent exactement le même sens, et ne changent
pas d'une ligne.** Ce sont des fonctions de chemin pures
([repo-path.ts](../lib/server/agent/repo-path.ts)), appliquées aux arguments du
modèle avant de toucher le disque. Que le harness tourne dans la machine qu'il
garde ne change rien à ce qu'elles refusent.

**Ce qui change vraiment, et qu'on découvrirait sinon dans la douleur** : le
harness et le modèle partagent désormais le même disque. Deux conséquences.

- Le harness doit vivre **hors de `REPO_DIR`**, comme `TOOL_OUTPUT_DIR` le fait
  déjà ([sandbox.ts:71](../lib/server/agent/sandbox.ts)), pour que le `git add -A`
  de fin de tour ne l'emporte jamais dans un commit.
- La microVM cesse d'être « jetable et sans conséquence » — l'argument de §3.2 du
  [comparatif](agent-harness-comparison.md), qui justifiait de ne pas garde-fouer
  les commandes. Un `rm -rf /vercel/sandbox` du modèle tue maintenant son propre
  tour. C'est un **désagrément, pas une faille** (rien de durable n'y vit, la
  branche est poussée), mais l'argument « la VM est jetable » ne peut plus être
  invoqué tel quel.

**Le gain de latence, mesuré, et plus petit qu'annoncé.**

| Mesure (2026-08-07, microVM réelle, pilotée depuis le Mac) | Valeur |
| --- | ---: |
| Aller-retour `runCommand("true")`, médiane de 10 | **211 ms** (min 176, max 933) |
| Les 10 mêmes commandes enchaînées **dans** la VM, un seul aller-retour | **227 ms** au total |

Soit ~21 ms par commande contre ~211 ms : **le RPC est bien l'essentiel du coût**.
Mais la mesure part de France, et le trajet jusqu'au plan de contrôle Vercel en
porte le gros (~180 ms de plancher observé sur une connexion réutilisée). Depuis
une fonction co-localisée en `iad1`, ce sera **nettement moins**.

**Conclusion : le chiffre « ~0,3 s par tool call, 30 à 45 s par run » de MIN-224
n'est pas établi.** Il doit être re-dérivé des horodatages de production
(`agent_run_events`, `tool_call` → `tool_result`, **moins** la durée de la commande
elle-même) avant d'être resservi comme argument. Le dossier de la migration reste
entier sans lui : ce sont les 11 défauts sur 15 de l'audit.

---

## 6. Le chemin de migration

**Décision : drapeau par PROJET, figé sur la ligne du run à son lancement.**

**Par projet, pas par run.** Par run, on ne saurait pas répondre à « pourquoi cette
session s'est-elle comportée autrement que l'autre ? ». Par projet, on bascule un
dépôt à la fois — en commençant par celui de minddy, où l'on voit tout — et une
conversation ne change jamais de moteur en cours de vie. Le mécanisme existe :
un `app_config` (comme `agent_subagent_max_parallel`,
[subagent-config.ts:105](../lib/server/agent/subagent-config.ts)) portant une
liste de `project_id`.

**Figé au lancement.** Le drapeau est lu au lancement et écrit sur la ligne du run,
comme `model` et `reasoning_level` le sont déjà
([runs.ts:178](../lib/server/agent/runs.ts)). Sans ça, un tour repris après la
bascule repartirait sur une boucle qui n'a jamais vu son checkpoint.

**Combien de temps les deux coexistent.** Le temps qu'un dépôt réel — minddy —
passe **une semaine entière** sur la nouvelle forme sans que le fil raconte autre
chose que l'ancienne : mêmes events, même ordre, mêmes coûts au ledger. C'est le
critère, pas une date. **Qui décide** : Clément, sur ce critère-là.

---

## 7. Ce qu'on supprime, et quand

**Après, jamais pendant.** Chaque ligne est un ticket du lot 3 (MIN-225) qui se
ferme tout seul le jour où le dernier projet a basculé. Liste vérifiée dans le
code, pas de mémoire :

| Fichier | Ce qui meurt |
| --- | --- |
| [execute.ts](../lib/server/agent/execute.ts) | La boucle de chunks entière : admission (`chunkFitsSubagentResume`, event `chunk_deferred`), relecture d'amorçage, sortie `suspended`, `MAX_WALL_CLOCK_MS`, `MAX_ERROR_REQUEUE_ATTEMPTS`, `SUBAGENT_RESUME_DEFER_MS` |
| [chunk-budget.ts](../lib/server/agent/chunk-budget.ts) | **Le module, sauf une fonction** : `COMMIT_MARGIN_MS`, `MIN_SOFT_DEADLINE_MS`, `CHUNK_FLOOR_MS`, `COLD_SETUP_ALLOWANCE_MS`, `MIN_CHUNK_BUDGET_MS`, `chunkSoftDeadlineMs`. `runCommandTimeoutMs` **survit** (le plafond du tool reste) mais perd son terme `remainingMs` |
| [drain.ts](../lib/server/agent/drain.ts) | `drainAgentRuns` et sa boucle claim→execute. `reapIdleSandboxes` et `hasDueAgentWork` **survivent** |
| [runs.ts](../lib/server/agent/runs.ts) | `claimRun`, `requeueStuckRuns`, `STUCK_RUNNING_MS`, `MAX_CRASH_ATTEMPTS` ; colonnes `continuations`, `attempts`, `window_started_at`, et `not_before` dans son usage de re-queue |
| `AgentCheckpoint` | `parkedForSubagents`, `providerRetries`, `usageSeq` (plus de tranche par chunk) ; `instructions`, `editedPaths`, `repoTouched`, `lastFilesSha` redeviennent des **variables locales du tour**. `messages` reste |
| [subagent.ts](../lib/server/agent/subagent.ts) | `suspendAll`, `resumeSuspended`, `restore`, `SubagentRecord` sérialisé, `SUBAGENT_RECORDS_KEPT`, `isResumableSubagent`. Les filles redeviennent des promesses |
| [subagent-config.ts](../lib/server/agent/subagent-config.ts) | `SUBAGENT_PARENT_RESERVE_MS`, `SUBAGENT_MIN_MS`, `SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS`, `chunkFitsSubagentResume`, `SUBAGENT_MAX_MS`, `SUBAGENT_CUT_MARGIN_MS` |
| [retry.ts](../lib/server/agent/retry.ts) | `planProviderStall` (MIN-219) : un process long **attend**, il ne se re-queue plus. Le backoff reste, la comptabilité de reprises disparaît |
| [agent-loop.ts](../lib/server/agent/agent-loop.ts) | `MAX_ROUNDS_PER_CHUNK`, la soft-deadline et sa sortie `suspend`, `MAX_COMPACTIONS_PER_WINDOW`, `AGENT_COMPACT_MIN_BUDGET_MS` |

**Ce qui NE se supprime pas et qu'on croirait jetable.** Le **lot 1** de l'audit
voyage avec la boucle : le plafond de dépense partagé entre les filles, la lecture
de `finish_reason`, le refus des arguments de tool illisibles, le verrou
d'écriture de `create_pr`. Et `fitCheckpoint` (MIN-217) reste : un checkpoint de
fin de tour peut être aussi gros qu'un checkpoint de fin de chunk.

---

## Question ouverte tranchée : une région EU est-elle bloquante ?

**Non — et il y a quand même une ligne à corriger, indépendamment du chantier.**

Vercel Sandbox n'existe qu'en **`iad1`** (documentation tarifaire, révision du
2026-08-04 ; c'est aussi là que le dépôt de l'utilisateur est cloné aujourd'hui).
La migration n'y ajoute qu'une chose : le **checkpoint** — l'historique de la
conversation — transite désormais par la VM au lieu de rester entre la fonction et
Supabase. Même pays, même sous-traitant, déjà au registre.

Mais en relisant [docs/rgpd/sous-traitants.md](rgpd/sous-traitants.md) pour le
vérifier, la fiche Vercel dit : *« micro-VM éphémère par run, détruite à la fin. Le
code du dépôt y est cloné le temps du run uniquement. »* **C'est déjà inexact
aujourd'hui** : les sandboxes sont `persistent: true` avec un snapshot conservé
**7 jours** ([sandbox.ts:60](../lib/server/agent/sandbox.ts)) — le filesystem est
*stocké*, pas seulement *en transit*. La migration y ajoutera l'historique de la
conversation. **La fiche a été corrigée en même temps que ce document** : durée de
rétention du snapshot, et `iad1` comme contrainte *fermée* pour les bacs à sable —
là où la région des *fonctions*, elle, reste un point ouvert.

---

## Ce que ce cadrage n'a pas fait

- **Le run de bout en bout dans la nouvelle forme n'a pas été joué.** Il demande le
  bundle VM et la route de collecte, c'est-à-dire le début de MIN-224. Il reste la
  première étape de vérification de ce ticket-là, avant le premier test.
- ~~**`forwardURL` n'est pas mesuré**~~ — **fait le 2026-08-07** (MIN-223), chiffres
  en §2. Il tient : ~55 ms par aller-retour, SSE de 60 s tenu. Deux contraintes en
  sont sorties (corps plafonné à 4,5 Mo, domaine devant résoudre en DNS), toutes
  deux à charge de MIN-224.
- **La latence RPC intra-région n'est pas mesurée** (§5), et le chiffre de MIN-224
  ne doit pas être resservi avant de l'être.
