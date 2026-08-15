# La cage du harness — audit d'allègement, chemin local

**Audit de lecture. Aucun code écrit.** Il prolonge
[agent-local-2026-08-14.md](agent-local-2026-08-14.md) et **rouvre sa décision D3**
sur demande du PO : le local devient le mode par défaut (app de bureau), et
l'objectif change de sens — non plus « quel périmètre tenir », mais **« quelle
parité avec Claude Code, Codex et opencode ».**

> **Décisions prises le 2026-08-15, au §8** (D5 à D8) : le disque entier avec une
> règle de prompt, le commit rendu au modèle sur demande, `ask_user` qui suspend,
> `run_background` rendu. **D3 est annulée.** Le §9 en donne l'ordre de bataille,
> et cet ordre porte une contrainte réelle : D7 avant D5.

Tout ce qui est cité ici a été relu dans le code au 2026-08-15, après
`1f1ad7d`. Ce qui n'est pas mesuré est dit non mesuré.

---

## 0. Le verdict, en six lignes

1. **Un défaut vivant, et ce n'est pas un arbitrage : en mode local, PERSONNE ne
   commite.** Le harness ne commite plus (D2bis-B), le prompt promet qu'il le
   fait, et le garde-fou refuse au modèle de le faire. Trois textes, trois
   versions. → §1.
2. **La cage a une forme, et elle est systématiquement à l'envers : elle ferme le
   tool qui DÉCLARE son intention et laisse ouvert le shell qui ne déclare rien.**
   Ce n'est pas une trouvaille nouvelle — c'est le « mur de papier » du §2 de
   l'audit précédent —, mais l'inversion de D3 en change la conclusion. → §2.
3. **Sur 16 contraintes inventoriées, 7 reposent sur un motif qui n'est plus vrai
   en local**, dont trois où le motif est nommé « réouvrable » dans nos propres
   commentaires. → §3.
4. **La grande délégation a déjà eu lieu** (−18 100 lignes) et deux des trois
   économies que l'audit précédent listait sont **déjà faites** en local. Il reste
   moins de gras que le sentiment ne le dit. → §4.
5. **Les écarts de parité qui se voient à l'usage sont six**, et le plus coûteux
   n'est pas l'accès disque : c'est qu'**un agent local ne peut ni faire tourner
   ce qu'il écrit, ni poser une question sans mourir**. → §5.
6. La simplification que le PO demande **supprime du code au lieu d'en ajouter**.
   C'est la seule direction du dossier où « plus libre » et « plus simple » sont
   le même geste. → §6.

---

## 1. Le défaut qui n'est pas un choix : le tour local ne livre rien

C'est le seul point de cet audit qui est un **bug**, et il est en production sur
le chemin local.

| Ce qui est écrit | Où | Ce que ça dit |
| --- | --- | --- |
| `if (job.writesToRepo && !current)` | [supervisor.ts:1836](../../lib/server/agent/vm/supervisor.ts#L1836) | en mode dépôt courant, **rien n'est commité ni poussé** en fin de tour (D2bis-B, assumé) |
| « At the end of each turn the harness delivers YOUR work by **committing only the paths you changed**, onto its own branch » | [prompt.ts:177](../../lib/server/agent/prompt.ts#L177) | le modèle lit que le harness commite |
| « Refused `git commit` — **the harness owns git: it commits and pushes your work at the end of every turn** » | [command-guard.ts:352-359](../../lib/server/agent/command-guard.ts#L352-L359) | et s'il essaie, le refus le lui redit |

**Résultat pour un tour local : le travail reste dans l'arbre, le modèle croit
qu'il est livré, et il n'a aucun moyen de le livrer lui-même.** Le seul chemin
restant est `create_pr`, qui pousse une branche sur la forge — donc exactement le
geste que D2bis-B voulait retirer, à un tool près.

Deux conséquences qui se lisent dans le comportement, pas seulement dans les
textes :

- un modèle qui suit le prompt **ne dit pas à l'utilisateur de commiter** : il
  croit l'avoir fait. Le tour se termine sur « c'est livré » et rien ne l'est ;
- la même phrase de `prompt.ts:177` dit **« never commit »** deux propositions
  plus tôt, et « the harness delivers by committing » ensuite. Le modèle arbitre
  entre les deux moitiés d'une même phrase.

**Ce défaut doit être corrigé quelle que soit la décision du §8** — c'est
l'inverse d'un débat de périmètre, les trois textes doivent juste dire la même
chose.

---

## 2. La forme de la cage : elle n'attrape que les honnêtes

L'audit du 14/08 avait mesuré le fait (§2, « le mur de papier »). Ce qui suit est
sa **généralisation**, et elle est ce qui rend l'allègement demandé cohérent : la
même asymétrie se répète **quatre fois**, à quatre endroits indépendants.

| Le tool qui déclare, fermé | Le shell qui ne déclare rien, ouvert | Où |
| --- | --- | --- |
| `read` sur un `.env` → **refusé** | `bash cat .env` → **passe** (`checkCommand` ne vise que git) | [opencode-permissions.ts:302-319](../../lib/server/agent/vm/opencode-permissions.ts#L302-L319) |
| `webfetch http://localhost:3000` → **refusé** | `bash curl localhost:3000` → **passe** | [opencode-permissions.ts:331](../../lib/server/agent/vm/opencode-permissions.ts#L331) |
| `external_directory` → **`deny`**, la demande n'est même pas publiée | `grep -r ~ `, `find ~`, `node -e`, `sed`, `curl` → **passent** (20 des 30 commandes mesurées) | [opencode-config.ts:423](../../lib/server/agent/vm/opencode-config.ts#L423) |
| `run_background` → **retiré du jeu de tools** | `bash "npm run dev &"` → **passe**, et devient un orphelin sans registre | [tools.ts:1383](../../lib/server/agent/tools.ts#L1383) |

**La lecture qui compte n'est pas « ces gardes sont contournables ».** C'est
qu'ils sont contournables *par le chemin le plus sale*. Chaque ligne du tableau
enseigne au modèle que la manière propre est refusée et que le shell marche —
c'est-à-dire qu'elle **déplace le travail vers l'endroit où nous ne voyons plus
rien**, où il n'y a ni `metadata.filepath`, ni `workdir`, ni compte de fichiers
changés, ni registre d'enfants.

Un garde-fou qui pousse le modèle vers `bash` ne réduit pas le risque : il réduit
notre **observabilité** du risque. C'est le meilleur argument pour l'allègement,
et il est indépendant de toute question de confiance.

---

## 3. Inventaire de la cage — 16 contraintes, et ce qui les motive encore

`local` = le tour joue sur la machine de l'utilisateur (`isLocalJob`).
**Motif** = la raison écrite dans le code. **Encore vrai en local ?** = verdict de
cet audit.

| # | Contrainte | Où | Motif écrit | Encore vrai en local ? |
| --- | --- | --- | --- | --- |
| 1 | `git commit` / `push` / `reset` / `restore` / `checkout --` / `rebase` / `cherry-pick` / `stash drop` / `clean -f` / `--amend` refusés | [command-guard.ts:94-101](../../lib/server/agent/command-guard.ts#L94-L101) | « le harness commite et pousse à la fin de chaque tour » | **NON** — il ne commite plus (§1) |
| 2 | Tout token de chemin portant un segment `.git` refusé, **lectures comprises** | [command-guard.ts:441-475](../../lib/server/agent/command-guard.ts#L441-L475) | hooks + `.git/config` porte le token de push | **partiellement** — en local il n'y a pas de token de forge dans `.git/config` (il voyage par `authUrl`), et `cat .git/HEAD` est inoffensif |
| 3 | `git -C`, `--git-dir`, `--work-tree` refusés en bloc | [command-guard.ts:232](../../lib/server/agent/command-guard.ts#L232) | « le harness possède UN dépôt » | **à trancher** — c'est le corollaire direct de D3 (§8, Q1) |
| 4 | Écritures `git config` sur clés exécutantes | [command-guard.ts:274-297](../../lib/server/agent/command-guard.ts#L274-L297) | persistance qui survit au run, dans le terminal de l'humain | **OUI, et c'est le garde-fou le plus justifié du lot.** À garder tel quel |
| 5 | `external_directory: "deny"` | [opencode-config.ts:423](../../lib/server/agent/vm/opencode-config.ts#L423) | « la microVM n'a qu'un dépôt » | **NON** — la prémisse nomme la microVM |
| 6 | `read: "ask"` + refus des `.env*` | [opencode-config.ts:377](../../lib/server/agent/vm/opencode-config.ts#L377), [opencode-permissions.ts:302](../../lib/server/agent/vm/opencode-permissions.ts#L302) | le `.env` réel de l'utilisateur | **oui sur l'intention, non sur la forme** — le shell passe (§2), et un `ask` global coûte **un aller-retour HTTP par lecture** |
| 7 | `bash: "ask"` | [opencode-config.ts:392](../../lib/server/agent/vm/opencode-config.ts#L392) | c'est ce qui donne la main à `command-guard` | **oui**, mais le prix est un aller-retour **par commande** pour une liste qui ne vise que git |
| 8 | `webfetch` refuse les adresses privées | [opencode-permissions.ts:331](../../lib/server/agent/vm/opencode-permissions.ts#L331), [local-guard.ts](../../lib/server/agent/vm/local-guard.ts) | proxy LLM, pont de tools, serveurs de dév, NAS, VPN | **oui pour le proxy et le pont** (ils sont sur la loopback et le pont n'authentifie rien), **non pour `localhost:3000`** |
| 9 | Permission inconnue → `reject` | [opencode-permissions.ts:347](../../lib/server/agent/vm/opencode-permissions.ts#L347) | ne pas autoriser ce qu'on n'a jamais lu | **oui comme posture, mais c'est un cliquet** : chaque montée d'opencode **retire** de la capacité au lieu d'en ajouter (`lsp`, `plan_enter`/`plan_exit`, `doom_loop`, `skill`) |
| 10 | `run_background` retiré | [tools.ts:1383](../../lib/server/agent/tools.ts#L1383) | `setsid` survit au ⌘Q, aucun registre | **NON** — le registre existe : [vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts). Le commentaire dit lui-même « réouvrable le jour où… » |
| 11 | `skill: false` | [opencode-config.ts:214](../../lib/server/agent/vm/opencode-config.ts#L214) | « les skills lisent le disque de la microVM ; il n'y en a aucune » | **NON** — sur la machine il y en a (`~/.config/opencode/skill`, et le dépôt en porte) |
| 12 | `todowrite: false` | [opencode-config.ts:214](../../lib/server/agent/vm/opencode-config.ts#L214) | notre checklist EST le plan du ticket | **oui comme produit**, mais un refacto local à 20 étapes publie 20 écritures réseau sur une surface partagée |
| 13 | `websearch: false` | [opencode-config.ts:214](../../lib/server/agent/vm/opencode-config.ts#L214) | plafond + facturation | **OUI.** À garder |
| 14 | `OPENCODE_PURE` + `OPENCODE_DISABLE_PROJECT_CONFIG` | [opencode-config.ts:762-763](../../lib/server/agent/vm/opencode-config.ts#L762-L763) | exécution de code arbitraire depuis le contenu d'un dépôt | **oui pour les plugins**, **discutable pour le reste** : ça emporte aussi les MCP du dépôt et les `AGENTS.md`/`CLAUDE.md` **imbriqués** (seuls ceux de la racine sont rendus) |
| 15 | `ask_user` **TERMINE le tour** | [supervisor.ts:1428](../../lib/server/agent/vm/supervisor.ts#L1428) | « tenir une microVM ouverte coûterait des heures de compute » | **NON** — la prémisse nomme la microVM, et la mesure existe déjà (§11.3.2 de l'audit précédent, `opencode-wait.probe.test.ts`) |
| 16 | Porte de livraison sur le 1er `create_pr` (typecheck + tests + auto-relecture) | [delivery-gate.ts](../../lib/server/agent/delivery-gate.ts) | contrôle accroché à un geste, jamais un tour réouvert | **oui sur la doctrine**, mais en local c'est **le seul chemin de livraison** (§1) : elle est donc devenue un péage obligatoire, et elle tourne sur le Mac de l'utilisateur |

**Bilan : 7 « NON » (1, 5, 10, 11, 15, + 2 et 14 partiels).** Cinq d'entre eux
portent un motif qui **nomme explicitement la microVM** — c'est la signature d'une
contrainte héritée, pas d'une décision de produit.

---

## 4. Ce qui est DÉJÀ délégué, et ce qui est DÉJÀ réglé

À lire avant de proposer quoi que ce soit : **le sentiment « on refait le travail
d'opencode » est largement périmé.** La grande délégation a eu lieu (MIN-286,
−18 100 lignes : `agent-loop.ts` et `subagent.ts` supprimés).

Sont **déjà** à opencode : la boucle de rounds, l'appel modèle, le streaming, les
retries, la compaction du contexte, les tools de fichier et de shell, les
sous-agents, le prompt système, le critère de fin de tour, l'historique de la
conversation.

Et **trois choses que cet audit s'attendait à trouver et qui sont déjà faites** :

| Ce que je cherchais | État réel |
| --- | --- |
| L'export/rejeu du journal, inutile en local puisque la SQLite d'opencode persiste 7 jours | **déjà court-circuité** : `if (local) return` dans `syncJournal` ([supervisor.ts:1000](../../lib/server/agent/vm/supervisor.ts#L1000)), et la reprise sonde la base au lieu de rejouer ([:836-844](../../lib/server/agent/vm/supervisor.ts#L836-L844)) |
| Le layout global qui empêche deux runs sur une machine | **déjà réglé** (MIN-354, `HarnessLayout` par run) |
| Le serveur opencode orphelin entre deux tours | **déjà réglé** (MIN-293, `children.json` + relecture au ⌘Q et au démarrage) |

**Conséquence de conception : il n'y a plus de grande délégation à faire.** Ce
qui reste autour d'opencode est le produit (le fil, les ~37 tools de domaine, le
ledger, la PR) et ce qu'opencode ne sait pas faire (le coût par round, le Stop,
l'horloge du tour). **L'allègement demandé n'est donc pas un transfert de
responsabilité vers opencode : c'est le retrait de contraintes.** Le gain se
compte en lignes de garde-fou supprimées, pas en modules délégués.

---

## 5. Parité — les six écarts qui se voient à l'usage

Comparé à ce que Claude Code, Codex et l'opencode nu font sur la machine de
quelqu'un. Rangés par **ce que ça coûte à un vrai tour de travail**, pas par
gravité théorique.

### 5.1 L'agent ne peut pas faire tourner ce qu'il écrit — *l'écart n°1*

`run_background` retiré (#10) **et** `webfetch` qui refuse la loopback (#8). Un
agent local ne peut donc ni lancer `npm run dev`, ni aller voir la page rendre,
ni lancer un watcher, ni exercer une route. C'est la boucle de feedback la plus
courte qui existe — et c'est précisément celle que l'app de bureau rend possible
pour la première fois, puisque le port est celui de la machine de l'utilisateur.

Ce que font les autres : Claude Code lance des jobs de fond et les liste ;
opencode nu n'a pas de mode fond mais son `bash` n'est pas amputé.

**Et le motif est déjà tombé** : `children.json` existe et sert le serveur
opencode. Étendre le registre aux jobs de fond est un lot borné.

### 5.2 Une question tue le tour — *l'écart n°2*

`ask_user` est terminal (#15). Sur la machine de quelqu'un qui est **devant
l'écran**, une question devrait suspendre et reprendre — c'est ce que fait
`POST /question/:id/reply`, mesuré (bloque sans timeout, ne termine pas le tour).

Le motif écrit — le coût d'une microVM ouverte — vaut **zéro** ici.

C'est le plus gros gain de produit du dossier, et il **supprime** du code : le
détour actuel (rejet de la question → coupure du tour → réponse qui revient
déguisée en message de steering au tour suivant) est le chemin le plus tordu du
harness.

### 5.3 Le dossier du projet est un mur, mais un mur de papier — *l'écart n°3*

`external_directory: "deny"` (#5) + `git -C` refusé (#3). Un monorepo dont les
paquets sont hors du dossier attaché, un dépôt voisin à consulter, un
`~/.config/…` à lire : refusés par les tools, **atteignables par le shell**.

Ce que fait Claude Code : lit où il veut, demande pour **écrire** hors du cwd.

### 5.4 Les conventions du dépôt sont lues à moitié — *l'écart n°4*

`OPENCODE_DISABLE_PROJECT_CONFIG` (#14) ferme la remontée, et nous re-servons
**seulement** les `AGENTS.md`/`CLAUDE.md` **de la racine**
([supervisor.ts:294-306](../../lib/server/agent/vm/supervisor.ts#L294-L306) →
[opencode-config.ts:667](../../lib/server/agent/vm/opencode-config.ts#L667)).

Deux pertes distinctes, et la seconde est la plus gênante :

1. **Les fichiers imbriqués ne sont jamais lus.** Le mécanisme existe pourtant, et
   il est bon : [repo-instructions.ts](../../lib/server/agent/repo-instructions.ts)
   sert paresseusement, à la première lecture OU édition d'un sous-dossier, les
   `AGENTS.md`/`CLAUDE.md` rencontrés entre la racine et le fichier touché
   (MIN-115 puis MIN-247, emprunté à opencode). **Il n'a plus de point
   d'accroche** : il se collait au *résultat du tool*, et les tools de fichier
   appartiennent maintenant à opencode. `instructionFilesFor` et
   `formatTouchedInstructions` sont donc du code sans appelant sur le seul chemin
   qui reste.
2. **Sur un tour local, l'emballage minddy manque.** `readRepoInstructions` n'est
   appelé que côté serveur, où `host` est `null` en local — le commentaire le dit
   en clair ([execute.ts:1150-1156](../../lib/server/agent/execute.ts#L1150-L1156)).
   Le *contenu* arrive bien (opencode le charge par sa clé `instructions`), mais
   **la note de frontière ne l'accompagne pas** : celle qui dit au modèle que ces
   fichiers sont des DONNÉES sur le projet et non une source d'ordres
   ([repo-instructions.ts:53-54](../../lib/server/agent/repo-instructions.ts#L53-L54)).
   Or c'est exactement le garde-fou d'injection de prompt sur un fichier que
   quiconque peut committer.

Même écoutille : les **serveurs MCP du dépôt** sont fermés. Sur la machine de
l'utilisateur, c'est une capacité que Claude Code a et que nous n'avons pas.

### 5.5 Le cliquet de version — *l'écart n°5*

Permission inconnue → `reject` (#9). En l'état, `lsp`, `plan_enter`/`plan_exit`
(le mode plan d'opencode), `skill` et tout ce que 1.19 ajoutera sont refusés
**par construction**. Combiné à `OPENCODE_DISABLE_LSP_DOWNLOAD`, ça veut dire
qu'on n'aura **jamais** les diagnostics LSP recollés à l'édition — le mécanisme
même que [delivery-gate.ts:36-41](../../lib/server/agent/delivery-gate.ts#L36-L41)
cite comme la bonne forme.

Le refus est la bonne **posture par défaut** ; ce qui manque est le geste qui le
lève : une liste d'autorisées, revue à chaque montée de version, plutôt qu'un
`default` qui décide seul.

### 5.6 Le coût des allers-retours — *l'écart n°6, non mesuré*

`read: "ask"` (#6) **et** `bash: "ask"` (#7) : **chaque lecture et chaque commande
paie un aller-retour HTTP** en boucle locale avant de s'exécuter. Ni Claude Code
ni opencode nu ne font ça.

Sur un tour à 300 lectures, c'est 300 allers-retours pour appliquer une règle qui
tient en un glob (`*.env`), et 100 % des commandes pour une liste qui ne vise que
git. **Non mesuré** — et c'est la mesure la plus rentable à faire, parce que la
sortie est simple : les deux règles s'expriment en ACL de config, où un `deny`
**court-circuite avant publication** (mesuré, §1 ligne 1 de l'audit précédent).

⚠ **Le prix de cette sortie, à savoir avant :** une ACL en glob ne sait pas lire
`bash -lc "git reset --hard"` ni `env -i git push`, que `command-guard` attrape
aujourd'hui ([command-guard.ts:52-54](../../lib/server/agent/command-guard.ts#L52-L54)).
Le choix est explicite : garder l'aller-retour pour ces formes-là, ou les perdre.

---

## 6. Ce que l'allègement supprime vraiment

Comptages relus, pas estimés.

| Geste | Ce qui part | Ce qui reste |
| --- | --- | --- |
| Rendre `git commit` au modèle (#1) | `ALWAYS_FORBIDDEN` perd `commit`/`push`, `refusal()` et sa phrase, les 3 lignes de prompt qui la redisent | `reset`/`restore`/`checkout --`/`clean -f` — ils détruisent du travail humain, et ça ne dépend d'aucune décision |
| `ask_user` bloquant en local (#15) | le rejet de question, l'`abort`, `askedUser`, le retour par steering, la branche `agent_question` du rapport | tout le chemin cloud, à l'identique |
| Ouvrir `external_directory` (#5) | le `case` mort de [opencode-permissions.ts:279-283](../../lib/server/agent/vm/opencode-permissions.ts#L279-L283) (déjà nommé branche morte), la ligne de config | `assertNotGit`, `resolveWithin`, `realPathOf` — ils gardent le **dépôt**, pas le disque |
| ACL au lieu d'`ask` sur `read` (#6) | l'aller-retour par lecture, le `case "read"` | `isSecretFile`, lu aussi par le scan de secrets |
| Rendre `run_background` (#10) | la ligne de filtre de `tools.ts` | à **écrire** : l'inscription des jobs au registre d'enfants |
| Permissions autorisées nommées (#9) | rien | à **écrire** : la liste, et un test qui échoue quand opencode en ajoute une |

**Ordre de grandeur : quelques centaines de lignes de garde-fou, pas des
milliers.** Le gain réel de ce chantier est de **comportement** (§5.1, §5.2), pas
de volume — et il faut le dire, parce que c'est exactement l'erreur que le §11.3
de l'audit précédent avait déjà eu à corriger une fois.

---

## 7. Ce qui doit rester, quelle que soit la décision

Non négociable, et aucun de ces points ne bride le modèle dans son travail :

1. **`git config` sur les clés exécutantes** (#4) — c'est la seule contrainte du
   lot dont la victime est l'utilisateur **après** la fin du run, dans son propre
   terminal. Rien ne la remplace.
2. **`reset` / `restore` / `checkout -- <fichier>` / `clean -f` / `stash drop`**
   — ils détruisent du travail non commité qui n'est pas celui de l'agent. Claude
   Code ne les refuse pas, mais Claude Code ne travaille pas non plus dans une
   session lancée depuis un ticket, sans personne devant l'écran.
3. **`webfetch` vers le proxy LLM et le pont de tools** — le pont
   **n'authentifie rien**, et le proxy porte la clé du modèle. Refuser
   `localhost:3000` est un dommage collatéral de cette règle, pas son objet :
   les deux se distinguent par le **port**, qui est connu du superviseur.
4. **`websearch: false`** (#13) — plafond et facturation.
5. **L'invariant d'admission** (§7 de l'audit précédent) : un run d'ancrage `pr`,
   de webhook, de mention, de routine, de chaîne ou du board public **ne part
   jamais en local**. Ce n'est pas une cage sur l'agent, c'est une règle de
   routage — et c'est ce qui permet de desserrer tout le reste.
6. **Le refus BYOK en local** et la garde de chemin du proxy LLM.
7. **`scrubPaths` / `foreignPaths`** ([local-uplink.ts](../../lib/server/agent/vm/local-uplink.ts))
   — ce qui monte dans `agent_run_events` est lu par tout le projet, 30 jours.
   Ouvrir la lecture hors dossier **augmente** l'enjeu de ce module ; il ne
   bride pas le modèle d'un octet.

**Le point n°5 est la clé du dossier.** C'est parce que le contenu tiers ne
descend jamais sur une machine que l'agent local peut être traité comme un outil
de l'utilisateur plutôt que comme du code non fiable. Toute la marge de manœuvre
du §8 en dépend.

---

## 8. Décisions du product owner (2026-08-15)

Quatre décisions prises après lecture de cet audit. **Elles annulent D3 du
2026-08-14** et remplacent le périmètre par une règle de prompt adossée à une
vraie question.

### D5. Le disque entier, et l'écriture ailleurs se DEMANDE

L'agent lit et écrit où il veut sur la machine, **mais le prompt système lui
impose de demander explicitement à l'utilisateur avant d'écrire hors de son
dossier.**

**Ce que ça retire :**

- `external_directory: "deny"` ([opencode-config.ts:423](../../lib/server/agent/vm/opencode-config.ts#L423))
  et le `case` correspondant, déjà nommé branche morte
  ([opencode-permissions.ts:279-283](../../lib/server/agent/vm/opencode-permissions.ts#L279-L283)) ;
- le refus en bloc de `git -C` / `--git-dir` / `--work-tree`
  ([command-guard.ts:232](../../lib/server/agent/command-guard.ts#L232)) — c'est
  le même périmètre, dit par un autre mot ;
- **le refus d'écriture du `case "edit"`** ([opencode-permissions.ts:241-254](../../lib/server/agent/vm/opencode-permissions.ts#L241-L254)) :
  aujourd'hui `absoluteInRepo` LÈVE sur tout chemin hors dépôt. C'est lui qui fait
  la frontière réelle, pas la ligne de config ;
- par conséquent la garde de lien symbolique de
  [local-guard.ts](../../lib/server/agent/vm/local-guard.ts) : elle n'existe que
  pour empêcher `ln -s` de faire sortir une écriture d'un périmètre qui n'existe
  plus. La garde de **résolution de nom** du `webfetch`, elle, reste (§7.3).

**Ce que ça oblige, et deux points sont durs :**

1. **La règle est une politesse, pas un mur — et il faut l'écrire comme telle.**
   Un modèle qui ne la lit pas écrit ailleurs sans demander, et rien ne l'arrête.
   C'est un choix assumé (le §2 montre que le mur d'avant ne tenait de toute façon
   que les tools honnêtes) ; ce qui n'est pas assumable, c'est de le décrire
   ailleurs comme une garantie. L'écran d'opt-in doit dire ce que l'agent peut
   atteindre.
2. **TCC devient bloquant, et ce n'était qu'un risque tant que D3 tenait.** Le
   bundle ne porte aucune `NS…FolderUsageDescription` (§D4 du 14/08) : dès que
   l'agent touche `~/Documents`, `~/Desktop`, `~/Downloads` ou iCloud Drive,
   macOS refuse **et la fenêtre de demande ne s'ouvre même pas**. Le refus est
   muet. Et ça coûte une republication + une renotarisation, donc ça ne se
   rattrape pas en fin de chantier.

**Ce qui devient plus important, pas moins :**
[local-uplink.ts](../../lib/server/agent/vm/local-uplink.ts). Ce qui monte dans
`agent_run_events` est lu par tout le projet, 30 jours — et le périmètre de
lecture vient de s'étendre au disque. `scrubPaths` / `foreignPaths` sont désormais
le **seul** rempart entre les fichiers personnels et la base de prod.

> **Piste, à trancher au lot :** plutôt que `external_directory: "allow"`, le
> mettre en **`ask` avec réponse automatique `once` + un event neutre**. Le
> verdict ne bride rien, et le fil garde une trace de chaque sortie de dossier —
> exactement le contraire de la situation du §2, où le shell sortait sans laisser
> de trace. Coût : un aller-retour sur les 10 commandes qui publient.

### D6. Le modèle commite, mais seulement quand on le lui a demandé

`git commit` est rendu au modèle. **Par défaut il ne commite pas** : il laisse le
travail dans l'arbre et dit ce qui a bougé. Il commite quand l'utilisateur le
demande — et il suit alors les `AGENTS.md` / `CLAUDE.md` du dépôt s'il en existe.

**Ce que ça retire :** `commit` de `ALWAYS_FORBIDDEN`
([command-guard.ts:94-101](../../lib/server/agent/command-guard.ts#L94-L101)), la
phrase de `refusal()` qui promettait un commit de harness, et les deux moitiés
contradictoires de [prompt.ts:177](../../lib/server/agent/prompt.ts#L177). **Le
défaut du §1 se referme par une suppression.**

**Ce que ça oblige :**

- **Servir les conventions imbriquées et leur note de frontière** (§5.4). « Suivre
  `AGENTS.md`/`CLAUDE.md` » n'a de sens que si l'agent les a lus : aujourd'hui il
  n'a que ceux de la racine, et en local il les reçoit **sans** la note qui dit
  que ce sont des données et non des ordres. Ce n'est plus un rang 3.
- **Réécrire le bloc git du prompt une fois pour de bon** : ce que le modèle fait
  par défaut (rien), ce qu'il fait sur demande (commiter), ce qui reste refusé
  (détruire du travail).

> **Sous-question restée ouverte, et je recommande de la fermer maintenant :
> `git push`.** Elle n'était pas dans la question posée. Recommandation : **le
> laisser refusé**, parce que `create_pr` possède déjà le remote (il mint le
> token, applique la porte de livraison et relie la PR au ticket) et qu'un `push`
> nu contournerait les trois. Le modèle commite en local, `create_pr` publie.

### D7. `ask_user` suspend le tour en local

Retenu. `POST /question/:id/reply` bloque sans timeout et rend la main au modèle
sans terminer le tour — déjà mesuré
([opencode-wait.probe.test.ts](../../lib/server/agent/vm/opencode-wait.probe.test.ts),
`MDY_OPENCODE_WAIT_LIVE=1`). Le motif du refus actuel nomme la microVM
([supervisor.ts:1416-1427](../../lib/server/agent/vm/supervisor.ts#L1416-L1427)) et
vaut zéro sur un Mac.

**Et c'est ce qui rend D5 applicable.** ⚠ **Contrainte d'ordre, pas une
préférence :** « demander avant d'écrire ailleurs » exige une question
**bloquante**. Tant qu'`ask_user` termine le tour, la règle de D5 se lit
« meurs avant d'écrire ailleurs » — l'agent poserait sa question, le tour
s'arrêterait, et l'écriture n'aurait lieu qu'au tour suivant, s'il y en a un.
**D7 doit être livré avant D5.**

### D8. `run_background` est rendu, avec inscription au registre

Retenu, plus la distinction du port pour `webfetch` (§7.3) — le proxy LLM et le
pont de tools restent refusés, le serveur de dév de l'utilisateur passe. Le
registre existe déjà
([vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts)) et sert le
serveur opencode ; il faut l'étendre aux jobs de fond, ce que le commentaire de
[tools.ts:1350-1366](../../lib/server/agent/tools.ts#L1350-L1366) annonçait comme
la condition de réouverture.

---

## 9. Ordre de bataille

Chaque lot vérifiable seul. **L'ordre n'est pas libre entre 1 et 3** (cf. D7).

| Lot | Contenu | Décision | État (2026-08-15) |
| --- | --- | --- | --- |
| **0** | **Réaligner les trois textes du §1** sur le code | aucune — à faire quoi qu'il arrive | ✅ fait (avec le lot 5) |
| **1** | `ask_user` suspend le tour en local ; suppression du détour par le steering | D7 | ✅ fait |
| **2** | `run_background` + inscription au registre d'enfants ; `webfetch` distingue le port | D8 | ✅ fait |
| **3** | Périmètre : `external_directory`, `case "edit"`, `git -C`, garde de lien symbolique — **et la règle de prompt** | D5 (après 1) | ✅ fait |
| **4** | TCC : les `NS…UsageDescription`, republication + renotarisation | D5 | ⚠️ **sans objet — la trouvaille était périmée** |
| **5** | Livraison : `git commit` rendu, bloc git du prompt réécrit | D6 | ✅ fait |
| **6** | Conventions imbriquées + note de frontière en local (§5.4) | D6 | ✅ fait |
| **7** | Liste des permissions autorisées + test qui échoue à la prochaine montée d'opencode (§5.5) | aucune | ✅ fait |
| **8** | Mesurer le coût des allers-retours `read`/`bash`, puis ACL si ça paie (§5.6) | mesure | ✅ fait — `ask` gardé, l'ACL ne paie pas |
| **9** | Serveurs MCP du dépôt, `skill`, `todowrite` (§3 #11, #12) | à cadrer | ✅ fait — découverte implicite fermée, tools inchangés |

**Le lot 0 part seul et tout de suite.** Les lots 1 et 2 sont ceux dont la
différence se voit au premier tour.

---

### 9bis. Ce que la mise en œuvre a appris (2026-08-15, après coup)

Trois choses que l'audit n'avait pas vues, et une qu'il avait vue de travers.

**Le §1 était pire que décrit, et pour une raison qui n'est dans aucun des trois
textes cités.** Le bloc git servi à un tour LOCAL n'était même pas celui du §1 :
`execute.ts` compose l'ancrage avec `currentRepo: isCurrentRepoJob({repoMode})`,
or `repoMode` y est la constante `"clone"` — un placeholder que la MACHINE
remplace par `"current"` (`assignmentToJob`), **après** que l'ancrage a été
composé. Le tour local lisait donc le bloc du CLOUD : « the harness commits and
pushes whatever you changed at the end of each turn ». Quatrième version du même
fait, et la plus fausse. Le fait à dire au modèle est `run.local_exec`, pas un
champ que quelqu'un d'autre écrira plus tard.

**Le lot 4 était déjà fait.** Les six `NS…UsageDescription` (Documents, Desktop,
Downloads, RemovableVolumes, NetworkVolumes, Microphone) sont dans
`desktop/electron-builder.yml` depuis MIN-359 — c'est-à-dire **avant `1f1ad7d`**,
la base de lecture que cet audit se donne. Ni republication ni renotarisation à
prévoir. À vérifier avant de rouvrir : `git show 1f1ad7d:desktop/electron-builder.yml`.

**Le lot 6 n'avait plus de point d'accroche possible, et il en fallait un
nouveau.** `collectTouchedInstructions` se collait au résultat d'un tool de
fichier ; ces tools appartiennent à opencode. Mesuré dans le binaire 1.18.16 :
`InstructionContext.observe` remonte bien les `AGENTS.md`, mais **entre le
`directory` de la session et la racine du projet seulement**, et sous
`OPENCODE_DISABLE_PROJECT_CONFIG` — donc jamais chez nous. Les imbriqués passent
désormais par un **document unique** que le superviseur compose et plafonne
(`formatServedInstructions`), servi en `instructions` : c'est la seule forme qui
permette à la fois de borner ce qui entre dans le prompt système (opencode lit EN
ENTIER ce qu'on lui nomme) et d'y mettre la note de frontière une fois.

**Et un piège de rédaction, pour la prochaine fois** : « SUSPENDS » contient
« ENDS ». Un test qui affirme `not.toContain("ENDS your turn")` sur le texte qui
dit `SUSPENDS your turn` ne peut pas passer. Les assertions de prompt portent sur
la phrase entière, jamais sur le verbe.

**Le token `.git` de `command-guard`** (§3 #2) n'est dans aucun lot : il reste
refusé. C'est le seul reste de périmètre qui garde encore quelque chose de réel
(les hooks du dépôt de l'utilisateur), et son coût — ne pas pouvoir `cat
.git/HEAD` — est nul, `git` sait tout dire de son propre état.

---

### 9ter. Mesures des lots 8 et 9 (2026-08-15)

**Le lot 8 tranche pour conserver les allers-retours.** La sonde
[`opencode-cost.probe.test.ts`](../../lib/server/agent/vm/opencode-cost.probe.test.ts)
mesure, sur `opencode-ai@1.18.16` et 30 appels, un surcoût de 0,40 ms par lecture
et 5,67 ms par commande. Le motif d'ACL `*.env` couvre bien la racine, les
sous-dossiers et les chemins hors dépôt, mais son refus est générique : il ne
peut pas orienter le modèle vers `.env.example`. Le gain ne compense ni cette
perte de guidage ni l'incapacité d'une ACL à comprendre une commande shell
composée. **Décision : `read: "ask"` et `bash: "ask"` restent.**

**Le lot 9 ferme une découverte qui n'était pas documentée.** La sonde
[`opencode-capabilities.probe.test.ts`](../../lib/server/agent/vm/opencode-capabilities.probe.test.ts)
établit que `skill` lit `~/.claude/skills`, `~/.agents/skills` et les skills du
dépôt depuis `$HOME`, indépendamment des dossiers `XDG_*` relocalisés par le
harness. `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` coupe cette découverte implicite
tout en laissant fonctionner une liste `skills.paths` explicitement nommée.
**Décision : `skill` reste désactivé et l'écoutille est posée dans tous les
mondes ; le jour où Minddy sert ses propres skills, il les nomme.**

`todowrite`, lui, ne publie aucune permission et n'écrit rien hors d'opencode :
son retrait reste un choix de produit (une seule checklist), pas une économie de
réseau. La vraie écriture partagée est le miroir de `update_plan` vers le ticket ;
le superviseur ne la rejoue désormais plus pour un plan strictement identique,
tout en conservant chaque event dans le journal. Enfin, les MCP déclarés par le
dépôt restent coupés par `OPENCODE_DISABLE_PROJECT_CONFIG`, tandis qu'un MCP
explicitement fourni dans la configuration Minddy demeure possible.
