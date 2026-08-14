# Remplacer notre boucle d'agent par opencode headless

> **DÉCISION PRISE le 2026-08-12 : on y va.** Les trois sondes du lot 0 passent
> (reprise §2.2, coût §2.5, packaging §2.7), aucune ne réduit le chantier, et
> Clément a validé le virage. Le repli qu'envisageait le plan — « opencode dans un
> tour, checkpoint maison autour » — est sans objet : la reprise fonctionne. Ce
> document cesse d'être un dossier d'instruction pour devenir la **référence de
> mise en œuvre** des lots 1 à 3.
>
> **Date** : 2026-08-12 · **Ticket** : MIN-286
>
> **Bases épinglées** : minddy à `77a7503` ; **opencode `opencode-ai@1.18.16`**
> (npm, licence MIT), le binaire natif, pas le dépôt.
>
> **Méthode.** Tout ce que ce document affirme d'opencode a été **mesuré sur ce
> binaire-là**, serveur headless démarré et piloté en HTTP : la doc publique est
> muette ou fausse sur au moins cinq des points qui décident du chantier. Quand
> une ligne vient d'une lecture de source et non d'une exécution, c'est dit.
> Les mesures qui ont coûté du modèle (vraie clé OpenRouter, dépôt jetable) sont
> datées et chiffrées ; les mesures de surface (liste des tools, schéma de config,
> agents, permissions) ne coûtent rien et se rejouent en trente secondes :
>
> ```bash
> opencode serve --port 4211 --hostname 127.0.0.1     # OPENCODE_DB=/tmp/oc.db
> curl -s "localhost:4211/experimental/tool/ids?directory=$REPO"
> curl -s "localhost:4211/experimental/tool?directory=$REPO&provider=openrouter&model=$M&agent=build"
> curl -s "localhost:4211/api/agent?directory=$REPO"
> curl -s localhost:4211/doc          # OpenAPI complet : 162 routes
> ```
>
> **Ce document n'est pas une comparaison.** Le dossier « qui vaut quoi » est
> [docs/harness-2026-08.md](harness-2026-08.md), et il est toujours d'actualité.
> Ici, la décision est prise : on adopte opencode. Ce qui suit est la **frontière**
> et l'**inventaire de parité** — ce qui cesse d'être notre code, et ce qui doit
> le rester.

---

## 1. La frontière

La microVM fait tourner `opencode serve`. Un **superviseur** mince — l'actuel
[vm/main.ts](../lib/server/agent/vm/main.ts), vidé de sa boucle — le pilote en
HTTP, traduit son flux `/event` en `agent_run_events`, et rend le `VmTurnReport`
que le plan de contrôle attend déjà
([vm/protocol.ts](../lib/server/agent/vm/protocol.ts)). La fonction Vercel ne
change pas de rôle : elle lance, elle sert le plan de contrôle, elle ne boucle pas.

| Reste à nous, et pour toujours | Passe à opencode |
| --- | --- |
| Le plan de contrôle et ses routes | La boucle de tours (prompt → tools → réponse) |
| Le ledger, les quotas, les plafonds | L'appel modèle, le streaming, les retries |
| Le fil d'events du produit (`agent_run_events`) | La troncature de sortie, la compaction |
| Les tools de **domaine** (ticket, carnet, pages, PR) | Les tools de **fichier** et le shell |
| La forge (clone, branche, commit, push, PR) | L'état de session (SQLite + journal d'events) |
| Les règles de livraison (gate, self-review, plan closure) | La délégation à des sous-agents |

**Aucun secret n'entre dans la VM.** Inchangé : le `transform` du firewall pose la
clé en sortie, opencode envoie le placeholder (`llmPlaceholderKey` du `VmJob`).
Le test miroir de
[vm-bundle-secrets.test.ts](../lib/server/agent/vm-bundle-secrets.test.ts) doit
exister pour le `OPENCODE_CONFIG_CONTENT` produit.

**Ce que ce virage suppose, et qu'il faut dire** : on adopte la cadence de release
d'un tiers sur le chemin le plus critique du produit. C'est le prix assumé — le
même raisonnement que « on construit un tracker, pas un agent de code ».

---

## 2. Ce qui a été mesuré

### 2.1 Les cinq points de parité (2026-08-12, run réel, ~0,01 $)

| Question | Mesure |
| --- | --- |
| Traçabilité du coût | **Par message assistant, donc par round** : `cost` (USD) + `tokens {input, output, reasoning, cache:{read, write}}` + `modelID` + `providerID` + `finish`. Relevé : `cost: 0.000994616`, `cache.read: 1792`. |
| Choix du modèle | **Par requête** : `model: {providerID, modelID}`. Deux modèles dans la **même** session, chacun facturé à son prix (deepseek 0,00026 $ puis haiku 0,0114 $). 345 modèles OpenRouter chargés avec prix et fenêtre. |
| BYOK | `provider.<id>.options.{apiKey, baseURL}` en config, et `OPENCODE_CONFIG_CONTENT` / `OPENCODE_AUTH_CONTENT` passent **tout par variable d'environnement, sans fichier**. |
| Tools de domaine | Un tool maison déposé en `.opencode/tool/*.ts` est **servi au modèle et appelé** : `read_minddy_issue(identifier: "MIN-286")` → appel complet avec `callID`, `input`, `output`, horodatage début/fin. |
| Interruption | `POST /session/:id/abort` rend en **40 ms**, la requête en vol se termine proprement. |

### 2.2 La reprise — le point qui pouvait tuer le chantier (2026-08-12, 0,006 $)

Deux serveurs isolés par `OPENCODE_DB`, base B **vide**, dépôt B **recloné à un
autre chemin**. `POST /sync/history` exporte l'historique en **événements**
(`{aggregateID, seq, type, data}`), `POST /sync/replay` le rejoue chez B :
session restaurée **avec son id**, ses 9 messages, son coût cumulé à l'identique
(0,00393204 $), et le modèle a **restitué le mot secret du premier tour** sur une
machine qui n'avait jamais vu la conversation. **86 events, 61 Ko, replay en 95 ms.**
Et c'est **incrémental** par `seq` : 5 events / 3,6 Ko pour le dernier tour.

Trois conséquences :

- **(a)** le checkpoint cesse d'être un gros document réécrit à chaque tour : il
  devient un **journal append-only**. `VM_MAX_CHECKPOINT_BYTES`
  ([protocol.ts:52](../lib/server/agent/vm/protocol.ts)) et tout `fitCheckpoint`
  deviennent sans objet ;
- **(b)** le `projectID` d'opencode est le **hash du premier commit** du dépôt,
  pas un chemin (`2be2c2a3…` sur le dépôt de sonde) : un clone neuf dans une
  microVM neuve retombe seul sur la bonne identité de projet ;
- **(c)** piège qu'aucune doc ne dit : l'export rend du **snake_case**
  (`aggregate_id`), le replay attend du **camelCase** (`aggregateID`).

Ce qui **ne voyage pas** : le travail non commité. Attendu, et déjà couvert par la
branche WIP poussée en fin de tour.

### 2.3 Ce que la surface du binaire dit (mesuré le 2026-08-12, coût nul)

- **14 tools intégrés**, et pas un de plus :
  `invalid, question, bash, read, glob, grep, edit, write, task, webfetch, todowrite, websearch, skill, apply_patch`.
- **Deux d'entre eux sont conditionnels, et la condition est la nôtre.**
  `apply_patch` remplace `edit`/`write` sur les modèles `gpt-*` — mesuré :
  `openai/gpt-5.5` reçoit `apply_patch` **sans** `edit`/`write`, `deepseek-v4-flash`
  reçoit l'inverse. C'est exactement `usesApplyPatch`
  ([patch.ts](../lib/server/agent/patch.ts), MIN-115), déjà rendu.
- **`websearch` n'est PAS servi sur `openrouter`** — mesuré : absent des trois jeux
  de tools rendus. La source le confirme (`webSearchEnabled` : provider `opencode`,
  ou clé Exa / Parallel). **Notre `web_search` ne disparaît donc pas** : il doit être
  un tool de domaine de toute façon, ce que le plafond et la facturation exigeaient
  déjà (§3).
- **`read` lit aussi les répertoires** (« For directories, entries are returned one
  per line … with a trailing `/` »). `list_dir` a donc un vis-à-vis, contrairement
  à ce qu'on croyait.
- **`bash` est un shell PERSISTANT** (« a persistent bash session »), avec `workdir`.
  C'est une **correction d'un défaut de chez nous** : notre `runShell` repart d'un
  `sh -c` neuf à chaque appel, et 29 commandes de production préfixent un `cd`
  ([agent-harness-comparison.md](agent-harness-comparison.md) §3.6). Timeout par
  défaut 120 s (le nôtre : `RUN_COMMAND_TIMEOUT_MS` = 180 s, à reporter en config).
  Troncature à 2 000 lignes / 50 Ko avec bascule vers un fichier relisable —
  réglable par `tool_output.{max_lines, max_bytes}`.
- **`task` sait reprendre une fille et la mettre en fond** : `task_id` continue la
  session d'un sous-agent, et le lancement en fond est notifié au retour. Nos trois
  tools de délégation (`spawn_agent`, `agent_status`, `list_agents`) tombent dans
  celui-là plus `/experimental/session/:id/background`.
- **Les agents livrés couvrent nos deux modes de sous-agent** :
  `explore` (mode `subagent`) porte déjà notre doctrine — permissions `* deny`,
  puis `grep/glob/read/webfetch/websearch allow`. `general` = notre `implement`.
  La lecture seule y est une **propriété du jeu de permissions**, pas une phrase de
  prompt : même doctrine que `subagentToolsFor`.
- **Les permissions sont une ACL ordonnée**, pas trois booléens :
  `{action, resource, effect: allow|ask|deny}`, dernière règle gagnante, `resource`
  en glob. L'agent `plan` livré le montre : `edit * deny` puis
  `edit .opencode/plans/*.md allow`. C'est ce qui exprimera notre `writesToRepo: false`
  d'une session de relecture, et nos `read *.env ask` sont déjà là par défaut.
- **La config porte tout ce dont la parité a besoin** (schéma OpenAPI) :
  `agent.<id>.{prompt, tools, permission, model, temperature, maxSteps}`,
  `tools` (carte nom → booléen ; **attention, elle ne RETIRE pas l'intégré, elle
  le passe en `deny`** — c'est le jeu de tools de l'agent qui le fait
  disparaître, cf. §2.8), `instructions[]`, `subagent_depth`
  (notre hiérarchie à un niveau), `plugin[]`, `provider`, `small_model`,
  `compaction.{auto, prune, tail_turns, preserve_recent_tokens, reserved}`,
  `shell`, `tool_output`.
- **162 routes** au total, dont celles dont le superviseur dépend :
  `/session/:id/{prompt, wait, interrupt, permission/:id/reply, question/:id/reply, message, history, event}`,
  `/global/health`, `/event`, `/config/providers`, `/experimental/tool`.

### 2.4 Piège : le serveur porte DEUX générations d'API

Le même binaire sert `/session/*` (héritée) **et** `/api/session/*` (v2), et elles
**n'ont pas les mêmes routes**. Relevé dans l'OpenAPI du 1.18.16 :

| Ce dont le superviseur a besoin | Où c'est |
| --- | --- |
| `abort`, `children`, `fork`, `shell`, `prompt_async`, `diff`, `todo` | **héritée** : `/session/:id/…` |
| `wait` (⚠️ **répond 503**, cf. §2.10), `question/:id/reply`, `history`, `context`, `interrupt`, `compact` | **v2** : `/api/session/:id/…` |
| `message` (POST = poster un tour), `permission/:id/reply` | les **deux** |

Il n'y a **pas** de `POST /session/:id/prompt` : côté héritée, poster un tour c'est
`POST /session/:id/message` (bloquant, rend le message assistant complet — c'est ce
que les sondes utilisent), et `prompt` n'existe que sur `/api`. Une faute d'un
segment ne rend pas un 404 mais **la page HTML du TUI**, donc un
`JSON.parse` qui explose sur `<!doctype` : erreur rencontrée, à connaître.
Pour un tour long, la paire est `POST /session/:id/prompt_async` (204 immédiat)
puis `POST /api/session/:id/wait` — deux préfixes différents pour les deux moitiés
du même geste. À isoler dans un client unique, sinon la faute se répétera partout.
Et `/sync/history` rend bien du `snake_case` (`aggregate_id`) là où `/sync/replay`
attend du `camelCase` : c'est **dans le schéma**, ce n'est pas un accident de sonde.

### 2.5 Le coût : écart NUL sur 5 générations (2026-08-12, 0,008 $)

C'était la question qui décidait du branchement du ledger. **Elle est tranchée, et
dans le bon sens.**

Montage : un **proxy local** entre opencode et OpenRouter (`baseURL` pointé sur
`127.0.0.1`), qui relaie tel quel et note l'`id` de chaque génération lu dans le
flux SSE. Après le tour, `GET /api/v1/generation?id=…` rend le coût **facturé** de
chacune. Cinq générations, deux modèles, un tour réel avec `read`, `bash` et `glob`.

| # | Modèle | `cost` d'opencode | Facturé par OpenRouter | Écart |
| --- | --- | --- | --- | --- |
| 1 | `anthropic/claude-haiku-4.5` | 0,00246325 | 0,00246325 | **0** |
| 2 | `anthropic/claude-haiku-4.5` | 0,00148755 | 0,00148755 | **0** |
| 3 | `anthropic/claude-haiku-4.5` | 0,00162075 | 0,00162075 | **0** |
| 4 | `anthropic/claude-haiku-4.5` | 0,00123180 | 0,00123180 | **0** |
| 5 | `deepseek/deepseek-chat-v3.1` | 0,00113352 | 0,00113352 | **0** |

Exact **round par round**, pas seulement sur le total, et **cache compris** : le
découpage en tokens se réconcilie lui aussi à l'unité près
(`input + cache.read + cache.write` = `native_tokens_prompt` sur les cinq).

**Et pourtant opencode n'interroge pas OpenRouter sur le coût.** Il le calcule,
prix du catalogue models.dev × tokens, en décimal exact
(`Session.getUsage`, `session.ts:337`) — aucun `usage: {include: true}` n'est
envoyé. L'égalité vient de ce que models.dev **recopie** la grille d'OpenRouter.
Ce qui se conclut, et ce qui ne se conclut pas :

- ✅ **le `cost` d'opencode est utilisable au ledger tel quel** : ce n'est pas une
  approximation à 5 %, c'est le même nombre ;
- ⚠️ **le risque n'est pas arithmétique, il est de CATALOGUE.** Un prix qui change
  chez OpenRouter et qui traîne chez models.dev, un modèle routé vers un
  fournisseur sous-jacent à un autre tarif, une variante `:floor`/`:nitro` : là,
  l'écart apparaîtra, et rien dans opencode ne le signalera.

> **Réglé depuis, au lot 1 (§2.8)** : on ne dépend plus du catalogue de models.dev.
> Le provider qu'on déclare porte **nos** prix, lus dans l'index OpenRouter — la
> même source que le multiplicateur et le plafond de plan. Le risque de dérive
> devient un risque sur NOTRE index, qu'on sait déjà surveiller.

### 2.6 `generation_id` : récupérable, pour ~40 lignes

Opencode ne l'expose nulle part — les clés d'un message assistant sont
`id, sessionID, role, time, parentID, modelID, providerID, mode, agent, path, cost,
tokens, finish`, et c'est tout. **Mais la sonde l'a récupéré 5 fois sur 5** en
s'interposant : c'est le proxy local du §2.5.

Transposé en production, ça marche : le `baseURL` d'opencode devient
`127.0.0.1:<port>` **dans la microVM**, le superviseur relaie vers l'URL de
complétion réelle — toujours avec le placeholder, donc toujours transformé par le
firewall, `network-policy.ts` inchangé et aucun secret dans la VM. Le proxy est
aussi l'endroit où poser `usage: {include: true}` si on veut le coût du
fournisseur plutôt que celui du catalogue.

**Recommandation** : brancher le ledger sur le `cost` d'opencode (`estimated: false`,
c'est le même nombre), et poser le proxy dans le superviseur dès le lot 1 — il ne
coûte presque rien, il rend `generation_id` pour le support et la réconciliation,
et c'est lui qui rattrapera une dérive de catalogue le jour où elle arrivera.

### 2.7 Le packaging dans la microVM : oui, et le démarrage coûte 1,3 s

Mesuré le 2026-08-12 dans une **vraie** microVM Vercel Sandbox, runtime `node24` —
le même que le code agent (`SANDBOX_RUNTIME`,
[repo-host.ts:37](../lib/server/agent/repo-host.ts)) —, 2 vCPU, 4,28 Go de RAM. La
sonde est dans le dépôt et se rejoue :
[opencode-packaging.probe.test.ts](../lib/server/agent/vm/opencode-packaging.probe.test.ts).

| Mesure | Valeur |
| --- | --- |
| `npm i opencode-ai@1.18.16` | **10,6 s** (10,6 / 11,5 / 11,8 / 9,5 s sur quatre passages) |
| Poids sur disque | **351 Mo** de `node_modules` (binaire natif : 144 Mo) |
| Démarrage à froid → `/global/health` | **1 336 ms** |
| Démarrage à chaud | **1 238 ms** |
| Démarrage sans catalogue en ligne (`OPENCODE_DISABLE_MODELS_FETCH=1`) | **1 248 ms**, `healthy: true` |
| Tools servis dans la VM | les 14, identiques au poste |

**Ce que ça change concrètement** : le seul coût réel est l'**installation**, pas le
démarrage. Et il se supprime — `sandbox.ts` sait déjà booter sur une image
pré-chauffée (`AGENT_SANDBOX_SNAPSHOT_ID`). **Recommandation : cuire opencode dans
ce snapshot**, et le coût du virage sur le chemin critique tombe à ~1,3 s par
microVM neuve.

**FAIT le 2026-08-12** :
[scripts/create-agent-snapshot.ts](../scripts/create-agent-snapshot.ts) installe
opencode dans `/vercel/oc` avant de figer l'image, et la question qui restait
ouverte est tranchée par la mesure — **`/vercel/oc` survit bien à la prise
d'image**, alors qu'il est hors de `/vercel/sandbox`, le répertoire de travail des
runs. Le script rejoue donc un reboot sur son propre snapshot et n'annonce l'id
qu'après avoir vu `opencode --version` répondre dessus : sans ce contrôle, une
image qui n'aurait rien cuit rendrait un id parfaitement valide, et la seule trace
en serait une lenteur que personne ne relie jamais à ici. Relevé : **12 s
d'installation, 351 Mo, image de 0,54 Go**, `expiration: 0` (**jamais** — un
snapshot de base est une image de produit ; ceux des runs, eux, expirent bien).

Deux conséquences écrites dans le code plutôt que dans une mémoire :

- le snapshot est à **rejouer après tout bump d'`OPENCODE_VERSION`** ;
- et si on l'oublie, `opencode-host.ts` compare désormais la version **posée sur le
  disque** à son épingle, et réinstalle quand elles divergent. Un simple test
  d'existence aurait trouvé le binaire d'hier très bien, et tous les runs
  auraient tourné sur l'ancien moteur pendant que le dépôt jure le contraire.

Le démarrage sans catalogue en ligne marche aussi, ce qui veut dire qu'un run ne
dépend pas de la disponibilité de models.dev — à confirmer sur les **prix**
(le catalogue embarqué doit être frais, cf. le risque de dérive du §2.5).

**PIÈGE DE RECETTE, et il a coûté trois passages** : dans un `sh -c` du Sandbox,
lancer un serveur en `nohup … &` (ou `setsid … &`, fds redirigés, `</dev/null`
compris) **fait tomber la commande RPC** — `TypeError: terminated` /
`UND_ERR_SOCKET` en ~25 s, sans une seule ligne de sortie, et le `detached: true`
du SDK n'y change rien. Le même serveur **au premier plan démarre parfaitement**.
La forme qui marche : garder le serveur au premier plan, lire la ligne
« listening » sur le tube pour chronométrer, interroger l'API depuis la même
commande, et borner le tout par `timeout` sous les 75 s au bout desquels la socket
RPC se ferme de toute façon. C'est la forme qu'a la sonde.

### 2.8 La config d'un tour : quatre mesures qui la dessinent (lot 1, coût nul)

Mesuré le 2026-08-12 en écrivant [opencode-config.ts](../lib/server/agent/vm/opencode-config.ts),
sur le même binaire, avec un **faux endpoint OpenAI-compatible local** — il rend
un flux SSE canonique et **journalise le corps de chaque requête**. C'est ce qui
permet de vérifier ce qui part vraiment au modèle sans dépenser un centime, et
trois des quatre points ci-dessous ne se voient QUE là.

1. **Un modèle déclaré sans `cost` rend `cost: 0`.** Tokens exacts
   (`input: 1000, output: 200`), coût nul. Avec `cost: {input: 3, output: 15}`
   déclaré dans le provider, opencode rend **0,006 $** — exact au décimal.
   **Conséquence, et elle est structurante** : on déclare **notre propre
   provider** (`minddy`, sur `@ai-sdk/openai-compatible`, la seule couche que nos
   cinq providers parlent tous) **avec NOS prix**, ceux de l'index OpenRouter. Le
   coût qu'opencode rend est alors le nôtre, et le seul risque que la sonde de
   coût avait laissé ouvert — la **dérive du catalogue** models.dev (§2.5) —
   disparaît. D'où `VmJob.pricing` ([protocol.ts](../lib/server/agent/vm/protocol.ts)),
   rempli par `getModelPricing` ([model.ts](../lib/server/agent/model.ts)) depuis
   le même index, cache compris. Prix inconnus (BYOK hors index) → pas de `cost`,
   et l'usage devra s'écrire `estimated` plutôt qu'à zéro.
2. **`reasoning_effort` à plat est RETIRÉ du corps** sur l'appel principal —
   opencode possède cette clé. La forme **imbriquée** `options.reasoning = {effort}`
   passe intacte, et un champ quelconque (`extra_marker`) passe aussi : ce n'est
   donc pas un filtre général, c'est cette clé-là. Le piège est qu'elle **survit
   sur le petit modèle** (titre), donc une vérification superficielle la voit
   partir. Pour nous : OpenRouter est servi (c'est déjà notre forme,
   `reasoningField: "reasoning"`), mais les couches compat **openai / anthropic /
   google perdent leur niveau de raisonnement** en 1.18.16 — c'est le proxy local
   du superviseur (§2.6) qui le réinjectera, sa deuxième raison d'être.
3. **`tools: {x: false}` n'ENLÈVE pas l'intégré `x`** : il reste servi au modèle
   et opencode en fait une permission `deny` (mesuré sur `todowrite`). Ce qui le
   fait disparaître, c'est le jeu de tools de l'**agent** (`agent.<id>.tools`).
   La config pose donc les deux — la carte globale pour la permission, le jeu de
   l'agent pour l'absence. §2.3 disait « c'est par là que `websearch` et
   `todowrite` sortiront » : c'est vrai du résultat, faux du mécanisme.
4. **`agent.<id>.prompt` REMPLACE le prompt système intégré**, et `instructions`
   est une liste de **chemins de fichier** dont le contenu est ajouté au message
   système (marqueur retrouvé dans le corps). L'ancrage minddy voyage donc par un
   fichier écrit sous `HARNESS_DIR`, hors du dépôt. Accessoirement : un id de
   modèle **à slash** (`minddy/deepseek/deepseek-chat-v3.1`) est coupé au PREMIER
   slash et résout correctement, de la config jusqu'au corps de requête.

### 2.9 Les tools de domaine : 32 sur 32, avec nos schémas (lot 1, coût nul)

Mesuré le 2026-08-12 en écrivant [opencode-tools.ts](../lib/server/agent/vm/opencode-tools.ts),
et **rejouable** : [opencode-tools.probe.test.ts](../lib/server/agent/vm/opencode-tools.probe.test.ts)
(gardée par `MDY_OPENCODE_TOOLS_PROBE=1`) installe le binaire, écrit les fichiers
de production, démarre un serveur et compare les schémas servis aux nôtres. **7,5 s.**

| Ce qu'il fallait savoir | Mesure |
| --- | --- |
| Nos tools sont-ils servis ? | **32 sur 32**, descriptions identiques à l'octet, schémas structurellement identiques (types, enums, descriptions, partage requis/optionnel). |
| Un tool est-il vraiment APPELÉ ? | Oui, de bout en bout : modèle → tool généré → pont local → résultat dans la conversation, avec `callID` et `sessionID`. |
| Faut-il installer quoi que ce soit ? | Non. `@opencode-ai/plugin` est résolu par le runtime du binaire ; aucun `node_modules` à poser. |

Trois pièges, et le premier décide de la forme du générateur :

1. **Deux formes de déclaration, une seule utilisable.** L'objet nu
   (`export default { description, args, execute }`) traite `args` comme une
   carte *nom → schéma* et **rend TOUT obligatoire** — y poser un JSON Schema
   complet produit un schéma absurde (`required: ["properties",
   "additionalProperties"]`, mesuré) que le modèle reçoit tel quel, sans une
   erreur. La forme `tool({...})` accepte `tool.schema` (zod) avec `.optional()`
   et rend le schéma exact. Nos tools ont des paramètres optionnels partout : le
   générateur **émet donc du zod**, traduit depuis les schémas de `tools.ts`.
2. **Un tool peut vivre hors du dépôt** : `$XDG_CONFIG_HOME/opencode/tool/*.ts`
   est chargé comme le `.opencode/tool/` d'un projet. Ce n'est pas une
   préférence — dans le dépôt, les 32 fichiers entreraient dans le `git add -A`
   de fin de tour et seraient commités chez l'utilisateur.
3. **`process.env` est lisible depuis un tool**, ce qui permet à l'adresse du
   pont de descendre sans être écrite en dur dans le code généré.

**Une inflexion du cadrage, assumée** : le tool généré poste au **superviseur**
(127.0.0.1) et non directement au plan de contrôle. La garantie ne bouge pas —
c'est le superviseur qui fait l'appel sortant, donc toujours l'OIDC du firewall et
aucun secret dans la VM — mais elle rend possible ce qu'un appel direct
interdisait : les compteurs de TOUR (plafond de recherches web, plafond d'images,
ancres de review déjà posées), `create_pr` qui est coupé en deux (la VM pousse, la
fonction ouvre), et les règles de livraison qui doivent voir passer les appels.

**Ce qui reste ouvert, et qu'il faudra trancher au lot 2** : les IMAGES. Le tool
généré rend du texte ; `read_resource` sur une maquette rend aujourd'hui une image
que le modèle regarde vraiment (MIN-111). Le contexte d'exécution d'un tool
opencode expose `metadata` et des parts — à mesurer avant de brancher le ledger.

### 2.10 Le pilotage d'un tour : deux routes du §2.4 sont fausses (lot 1)

Mesuré le 2026-08-12 en écrivant le client
([opencode-client.ts](../lib/server/agent/vm/opencode-client.ts)) et le
superviseur ([supervisor.ts](../lib/server/agent/vm/supervisor.ts)).

| Route | Ce que le §2.4 en disait | Ce qu'elle fait |
| --- | --- | --- |
| `POST /api/session/:id/wait` | la moitié v2 du couple prompt/wait | **503** — « Session wait is not available yet ». Elle est dans l'OpenAPI, le serveur ne l'implémente pas. |
| réponse à une permission | `POST /permission/:id/reply` | Elle EXISTE et c'est celle-là qu'il faut (corrigé au lot 2, §2.13) : corps `{reply, message?}`. `POST /session/:id/permissions/:permissionID` marche aussi mais est `deprecated` **et n'a pas de `message`**. |

Conséquence directe, et elle est meilleure que le plan : **la fin d'un tour se lit
sur `session.idle` du flux `/event`**, qu'on consomme de toute façon pour le fil.
Aucune requête HTTP ne reste ouverte pendant les heures que dure un tour.
Vérifié de bout en bout contre le binaire : santé, création de session,
`prompt_async` (204), flux jusqu'à `session.idle`, `abort` (200).

**Le piège du snake_case (§2.2) mord aussi À LA LECTURE**, et c'est le défaut que
le premier jet du superviseur portait : le curseur d'export incrémental se dérive
d'`aggregateID`, que `/sync/history` **n'envoie pas** (il rend `aggregate_id`). Le
curseur restait donc vide, et chaque tour ré-exportait l'historique entier — qui
grossit jusqu'à ne plus passer, sans qu'aucun test ne tombe. La normalisation est
désormais faite **dès la lecture**, pas seulement avant le replay. Relevé sur le
binaire : 131 events exportés, tous en camelCase après passage du client.

### 2.11 Les trois sondes du lot 0, ensemble

| Sonde | Verdict | Coût de la mesure |
| --- | --- | --- |
| Reprise d'une session sur une autre machine | **passe** — journal d'events rejouable, incrémental | 0,006 $ |
| Coût au ledger | **passe** — écart nul, `generation_id` récupérable | 0,008 $ |
| Packaging dans la microVM | **passe** — 1,3 s de démarrage, 10,6 s d'install supprimables par snapshot | quelques minutes de Sandbox |

Aucune ne bloque. Le chantier peut passer au lot 1 — reste la **décision** de
Clément, qui est un point du plan à elle seule.


### 2.12 Le ledger d'un tour : le proxy est posé, et le flux est celui du SERVEUR (lot 2)

Écrit le 2026-08-12 en branchant `ai_usage`
([supervisor.ts](../lib/server/agent/vm/supervisor.ts), `TurnLedger` ;
[llm-proxy.ts](../lib/server/agent/vm/llm-proxy.ts)).

Le proxy du §2.6 **existe** : opencode parle à `127.0.0.1`, le superviseur relaie
vers le fournisseur avec le placeholder, `network-policy.ts` ne change pas. Il rend
trois choses qui n'ont aucun autre point d'observation — le `generation_id`, le
**coût facturé** (`usage: {include: true}`, qui prime sur celui qu'opencode
calcule), et le `reasoning_effort` à plat que le §2.8 avait vu disparaître du corps.

Ce que le branchement a fait apparaître, et qu'aucune doc ne dit :

1. **Le flux `/event` est celui du SERVEUR, pas d'une session.** Quand le modèle
   délègue, la fille ouvre sa propre session et ses frames arrivent mêlées à celles
   de la mère. Trois défauts en découlaient, tous silencieux : un `session.idle`
   de fille **terminait le tour**, le texte de la fille entrait dans la réponse
   (donc dans le message de commit), et sa dépense se rangeait dans la bande de
   `seq` du parent. Tout ce qui se traduit porte donc maintenant sa `sessionId`, et
   les filles écrivent dans la bande `subagentUsageSeq` — la convention de la
   boucle maison, pour que l'ordre d'un run se lise pareil aux deux moteurs.
2. **La réponse du tour était TOUJOURS vide**, et le test qui l'a montrée n'existait
   pas : `message.updated` (fin de round) arrive **avant** `session.idle`, et c'est
   lui qui vide le texte du direct. Le tour lisait sa réponse dans ce sac déjà vidé.
   Le fil n'affichait rien et le message de commit retombait sur sa forme générique.
   Le dernier round terminé est désormais gardé à part (`replyOf`).
3. **Le checkpoint doit porter `usageSeq`.** `execute.ts` le relit
   (`run.checkpoint?.usageSeq ?? …`) ; sans lui, un tour repris renumérote ses
   lignes par-dessus celles du tour d'avant. Rien n'est perdu — pas de contrainte
   d'unicité, la dépense se somme — mais l'ordre des appels d'un run devient faux,
   ce qui est exactement ce qu'un `seq` sert à dire.

**Le plafond de dépense se tient au même endroit**, à la frontière de round : le
cumul des `message.updated` contre `budgetUsd`, relu toutes les minutes
(`BUDGET_REFRESH_INTERVAL_MS`, déplacée en [agent-models.ts](../lib/agent-models.ts)
pour que le superviseur ne réimporte pas la boucle que le lot 3 supprime), puis
`abort` et statut `budget_exhausted` — pas `error`, sinon la fonction retenterait
un run qui n'a plus de quoi payer. **Ce qui reste à mesurer** : ce qu'opencode
facture d'un round coupé en vol. S'il pose un `finish` sur le message avorté, la
ligne s'écrit comme un round ordinaire ; sinon la dépense sort des compteurs, et
c'est le défaut que MIN-216 avait fermé côté boucle maison
([abandoned-spend.ts](../lib/server/agent/abandoned-spend.ts), gardé pour ça).

L'appariement round → génération se fait par modèle, puis par tokens de sortie,
sinon dans l'ordre d'arrivée : **exact en séquentiel**, seulement probable quand
deux filles tournent en parallèle sur le même modèle. Ce qui se joue là est une
référence de réconciliation, pas une dépense — les tokens et le coût viennent du
round, jamais de l'appariement.

### 2.13 Les garde-fous et `ask_user` : ce que la permission publie (lot 2)

Mesuré le 2026-08-12 avec un **faux fournisseur local** qui scripte les appels de
tool — le modèle ne tourne pas, la mesure ne coûte rien, et elle porte sur le vrai
binaire ([opencode-permissions.ts](../lib/server/agent/vm/opencode-permissions.ts)).

| Ce qu'on voulait savoir | Mesure |
| --- | --- |
| Ce qu'une permission publie | `permission.asked` → `{id, sessionID, permission, patterns, metadata, always, tool: {messageID, callID}}`. **Forme héritée**, pas `permission.v2.asked`. |
| `bash: "ask"` demande-t-il pour tout ? | **Oui**, `echo hi` comprise : `metadata.command` porte la commande. Le garde-fou voit donc exactement ce que voyait `run_command`. |
| Ce qu'une écriture publie | `permission: "edit"`, `metadata.filepath` **ABSOLU** (+ un `diff`), quel que soit le tool (`write`, `edit`, `apply_patch`). Hors dépôt, une `external_directory` la précède. |
| Comment un refus parle au modèle | `POST /permission/:id/reply {reply: "reject", message}` → le tool revient en `error` : « The user rejected permission … with the following feedback: *message* ». Le refus reste donc **une erreur de tool**, comme chez nous. |
| Ce que `question` fait | `question.asked` → `{id, sessionID, questions: [{question, header, options: [{label, description}], multiple}], tool: {callID}}`, et le tool **BLOQUE** jusqu'à `POST /question/:id/reply` ou `/reject`. |
| Ce qu'un `abort` laisse derrière | Le tool en vol passe en `error` (« Tool execution aborted ») et l'historique **reste apparié** : le tour suivant repart sans trou. |

Trois conséquences, et deux d'entre elles corrigent du code déjà écrit :

1. **`.git/` n'est gardé par personne chez opencode** — mesuré : un `write` sur
   `<dépôt>/.git/config` a été **exécuté** et a écrasé le fichier. C'est
   exactement ce qu'`assertNotGit` protège (écrire un hook ou un `config` =
   exfiltration du token d'installation). D'où `permission.edit: "ask"` sur une
   session qui écrit, là où le lot 1 avait mis `allow` : c'est le `ask` qui donne
   la main au superviseur. Le piège du branchement, attrapé par un test :
   `resolveWithin` prend un chemin **relatif** et recolle un absolu sous le dépôt
   (`/etc/passwd` → `<dépôt>/etc/passwd`), donc ne refuse rien — or `filepath` est
   justement absolu.
2. **Un `abort` publie `session.error` `MessageAbortedError`.** Nous coupons
   nous-mêmes dans trois cas VOULUS (plafond de dépense, question posée, deadline) :
   sans filtre, chacun écrivait un event `error` au fil et un
   `errorMessage: "Aborted"` par-dessus le vrai motif. Le traducteur l'écarte.
3. **`ask_user` reste TERMINAL, contre le grain d'opencode.** Chez nous la session
   se met en attente et la réponse revient au tour suivant par le steering ; chez
   opencode le tool bloque, et tenir une microVM ouverte le temps qu'un humain
   revienne coûterait des heures de compute pour ne rien faire. Le superviseur
   émet donc notre event `question` (même payload, la carte du feed ne sait rien
   du moteur), **écarte** la question et **coupe** la session — les deux gestes
   laissent un historique apparié. La permission `question`, elle, **n'est pas
   consultée** : ce qui retire vraiment `ask_user` d'une routine est le jeu de
   tools de l'agent, pas l'ACL.
### 2.14 Les sous-agents : le nom de l'agent EST le modèle (lot 2)

Mesuré le 2026-08-12, même montage qu'au §2.13 (faux fournisseur local, coût nul),
plus une lecture du binaire. Cinq mesures, dont trois corrigent le cadrage :

| Ce qu'on voulait savoir | Mesure |
| --- | --- |
| Le tool `task` sait-il choisir un modèle ? | **Non.** Son schéma est `{description, prompt, subagent_type, task_id, command}` — et rien d'autre. Le modèle d'une fille vient de `agent.<id>.model` (`b.model ?? le modèle du message parent`). |
| Comment le modèle apprend l'offre | Le serveur colle à la description du tool `task` : « Available agent types and the tools they have access to: » puis un `- <nom>: <description>` par agent **non primaire**. Sans `description`, il écrit « This subagent should only be called manually by the user ». |
| Comment on retire un sous-agent de l'offre | `permission.task` est évaluée avec le **nom de l'agent** comme patron : `{"*": "allow", "explore-cheap": "deny"}` fait disparaître `explore-cheap` de la liste servie. |
| Ce qu'une fille reçoit vraiment | `agent.<id>.tools` **retire** pour de bon, joker compris : `{"*": false, read: true}` → **un seul tool** dans le corps de la requête. Vérifié sur le corps, pas sur `/experimental/tool`, qui rend le registre entier sans appliquer l'agent. |
| Ce que la délégation publie | `permission.asked` `{permission: "task", patterns: ["explore-cheap"], metadata: {description, subagent_type}}`, **avant** qu'opencode ne résolve l'agent ; puis le part du tool porte `state.metadata = {parentSessionId, sessionId, model}` — le seul endroit d'où rattacher une fille à son appel. |

Quatre conséquences :

1. **Un agent par (mode × modèle).** `explore` / `general` sur le modèle du run,
   puis `explore-<slug>` / `general-<slug>` par favori. C'est la seule traduction
   possible du champ `model` de `spawn_agent`.
2. **L'offre se resserre sur les favoris curatés**, et c'est assumé : `spawn_agent`
   acceptait n'importe quel id du catalogue (`allowedIds`, ~345 modèles), qu'on ne
   peut pas énumérer en agents sans gonfler la description du tool de 700 lignes.
   Le plafond de plan reste tenu — les favoris sont déjà passés par
   `scopeSubagentModels` —, il l'est simplement **par construction** plutôt que par
   un résolveur. Un nom hors liste revient en erreur de tool, avec l'offre.
3. **Chaque modèle offert doit être TARIFÉ** dans le `provider` (même mesure qu'au
   §2.8 : pas de `cost` → `cost: 0`). Un favori dont l'index OpenRouter ne donne
   pas le prix n'est pas offert du tout — mesuré de bout en bout : une fille sur
   un modèle tarifé rend son coût comme la mère.
4. **`OPENCODE_ENABLE_PARALLEL` n'a rien à voir avec le parallélisme des filles**,
   contrairement à ce que le plan supposait : c'est le drapeau du fournisseur de
   recherche web *Parallel* (`RuntimeFlags.enableParallel`, à côté d'`enableExa`).
   Le plafond de simultané (`maxParallel`, `app_config`) se tient donc sur la
   demande de permission du `task`, qui est le seul point de contrôle qui existe.
   À savoir avec : sans `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, un `task`
   **bloque** le parent — le simultané ne vient que d'un round qui appelle `task`
   plusieurs fois.

**Piège lu dans le binaire, pas encore mordu** : `POST /permission/:id/reply` avec
`reply: "reject"` rejette AUSSI **toutes les autres permissions en attente de la
même session** (`Permission.reply`, la boucle sur `pending`). Un refus concurrent
peut donc emporter un appel légitime suspendu au même instant. Rare tant que le
superviseur répond au fil de l'eau (une demande à la fois), à garder en tête le
jour où un refus inexpliqué apparaîtra à côté d'un autre.

### 2.15 Les règles de livraison : pas de plugin, et le code de sortie du shell (lot 2)

Le plan annonçait « delivery-gate, self-review, plan-closure **réimplantés en
plugin opencode** (`tool.execute.before/after`, `session.idle`) ». **Le plugin n'a
pas lieu d'être**, et ce n'est pas un raccourci : les trois faits que ces règles
lisent arrivent déjà chez nous.

| Le fait que la règle lit | D'où il venait | D'où il vient maintenant |
| --- | --- | --- |
| `editedPaths` | nos tools `edit_file` / `write_file` / `apply_patch` | la **demande de permission** `edit`, quand le superviseur l'autorise (`metadata.filepath`, absolu — §2.13) |
| « le modèle a testé lui-même » (`VerificationSink`, MIN-262) | le code de sortie de `run_command` | **`state.metadata.exit`** du part du tool `bash` |
| le plan écrit (`planWrites`) | `watchPlanWrites` sur les tools ticket | le **même** `watchPlanWrites`, posé sur le passe-plat du pont |

Un plugin aurait donc ajouté un troisième endroit où le harness parle au modèle,
dans un fichier généré tournant *dans* opencode, sans rien rendre de plus. Les
quatre modules restent **inchangés, avec leurs tests** ; le câblage vit dans
[opencode-delivery.ts](../lib/server/agent/vm/opencode-delivery.ts).

**Deux choses à savoir, et la seconde est un piège.**

1. **Le `bash` d'opencode pose `exit` sur son `metadata`** (lu dans la source :
   `metadata: {output, exit: code, truncated, …}`), et un code **non nul ne fait
   pas échouer le tool** — le part reste `completed`. Le statut du tool ne dit
   donc RIEN du verdict de la commande : seul `metadata.exit` le dit. Et il vaut
   `null` sur une commande abandonnée ou tuée par le timeout — un code inconnu
   n'est pas un zéro, et le prendre pour tel ferait **taire** la porte de
   livraison sur un tour que personne n'a vérifié.
2. **La voix du harness (`followUp`) part dans le TEXTE du résultat de tool.** La
   boucle maison la servait en message `user` après le round, faute de pouvoir
   grossir un résultat qu'elle élidait par le milieu ; chez opencode un résultat
   de tool *est* le texte que le tool rend, et rien ne l'élide sous les plafonds
   de `tool_output` (2 000 lignes / 50 Ko — le plus gros bloc, le diff, est capé à
   12 Ko). Le pont le colle donc après le résultat, séparé d'une ligne vide.

**Ce qu'on assume** : l'édition est notée à l'**autorisation**, pas à l'exécution.
Une écriture autorisée puis ratée fait payer un type-check inutile — le sens
prudent, l'inverse laissant partir du code que la porte n'a pas vu.

### 2.16 La forge : `create_pr` est le seul tool coupé en deux (lot 2)

Les huit autres tools de forge ne bougent pas : les trois écritures d'une
relecture (`comment_pr`, `comment_pr_line`, `reply_pr_thread`) et les sept pull
requests du projet sont des **tools de domaine ordinaires** — ils passent par le
pont, qui les fait suivre au plan de contrôle, seul détenteur du token de forge
([pr-tools.ts](../lib/server/agent/pr-tools.ts) et
[project-pr-tools.ts](../lib/server/agent/project-pr-tools.ts) ne changent pas
d'une ligne). Le seul état qui fasse l'aller-retour est le **compteur d'ancres**
(`prInlineComments`) : le plafond des 5 se compte sur la vie du RUN, la fonction
l'oppose et rend celui qu'elle a atteint, le pont le garde, le checkpoint le
porte au tour suivant.

`create_pr`, lui, se coupe en deux — **la VM pousse, la fonction ouvre** —, et
c'est dans le bon sens : le dépôt est dans la microVM, le token de forge et
l'état de la pull request côté fonction. Le superviseur exécute donc la moitié
push lui-même (`supervisorTools`, [supervisor.ts](../lib/server/agent/vm/supervisor.ts))
et poste le résultat de push au plan de contrôle, qui appelle
`openPullRequestAfterPush` inchangé.

**Trois différences avec la boucle maison, et chacune répare un cas réel :**

1. **La branche est REMONTÉE, pas relue.** `agent_runs.branch_name` n'est stampé
   qu'après un push réel (MIN-123), or ce push-ci est le premier du run dans le
   cas normal : la fonction lirait une branche nulle et ouvrirait la pull request
   sur une tête vide.
2. **Le `jobsNote` est de retour** (§2.21). `bash` n'a pas de mode fond, mais
   `run_background` est reposé en tool local : un serveur de dev peut donc tourner
   au moment de la livraison. Il est tué AVANT le staging, et le modèle l'apprend
   dans la même réponse — un serveur arrêté en silence lui laisse croire qu'il
   tourne (MIN-209).
3. **Le verrou d'écriture du parent est tenu ICI.** `commitAndPush` fait
   `git add -A` sur un sandbox PARTAGÉ : livrer pendant qu'un `implement`
   travaille emporterait son travail à moitié posé. Chez opencode le tool `task`
   BLOQUE le parent, donc le cas est rare — mais un round qui appelle `task` et
   `create_pr` côte à côte le rouvre, et la demande de permission ne voit passer
   que les tools d'opencode.

**Une session de RELECTURE (`writesToRepo: false`) n'a pas ce tool du tout**, et
à trois tours de clé plutôt qu'une phrase de prompt : `agentToolsFor` ne le sert
pas à l'ancrage `pr` (donc aucun fichier généré), le pont le refuse s'il arrivait
quand même, et la config pose `permission.edit: "deny"` en retirant `edit` /
`write` / `apply_patch` du jeu de tools de l'agent (§2.8, mesure n°4 : la carte
globale pose la permission, le jeu de l'agent fait l'absence).

### 2.17 Le commit de fin de tour : où opencode pose SES fichiers (lot 2)

Le commit et le push de fin de tour ne changent pas de nature — `commitAndPush`
après `session.idle`, message dérivé de la réponse (`commitMessageFromReply`),
diff du tour par `changedFiles`. Un seul chemin de push existe dans le
superviseur, partagé avec `create_pr` (§2.16) : l'URL de push y est **re-résolue
à chaque fois**, parce qu'un tour dure des heures et un token d'installation de
forge une heure.

Ce qui demandait une mesure, c'est ce qu'opencode écrit **où**, puisque le tour
finit par un `git add -A`. Mesuré le 2026-08-12 (serveur réel sur un dépôt git
jetable, session créée) :

| Ce qu'opencode écrit | Où, par défaut | Où on le met |
| --- | --- | --- |
| l'état (sessions, messages, permissions) | `$XDG_DATA_HOME/opencode/opencode.db` | `OPENCODE_DB` → `HARNESS_DIR/opencode.db` |
| les **snapshots** de travail — des dépôts git | `$XDG_DATA_HOME/opencode/repos/` | `XDG_DATA_HOME` → `HARNESS_DIR/data` |
| les journaux | `$XDG_DATA_HOME/opencode/log/` | idem |
| les binaires téléchargés | `$XDG_CACHE_HOME/opencode/bin/` | `XDG_CACHE_HOME` → `HARNESS_DIR/cache` |
| nos 32 tools de domaine | `$XDG_CONFIG_HOME/opencode/tool/` | `XDG_CONFIG_HOME` → `HARNESS_DIR/config` |

**Le dépôt lui-même reste vierge** : après démarrage et création de session,
`git status --porcelain` ne rend rien, et il n'y a pas de `.opencode/` dans le
projet — l'état a quitté le disque du dépôt pour SQLite (§2.2).

Les deux variables ajoutées ne corrigent donc pas un défaut constaté mais en
ferment un possible : par défaut ces dossiers partent dans le `$HOME` de la
microVM — hors du dépôt, mais **hors de notre portée**, alors qu'un `$HOME`
absent ou posé sur le dépôt par une image de sandbox suffirait à ramener des
dépôts git entiers dans le commit du tour. Tout l'état d'opencode tient
maintenant sous `HARNESS_DIR`, qui est **frère** de `REPO_DIR` et donc hors de
portée de `git add -A`.

---

### 2.18 L'ancrage minddy et le prompt du tour (lot 3)

Le lot 1 avait posé `instructions: [OPENCODE_ANCHOR_FILE]` dans la config sans que
personne n'écrive ce fichier : le superviseur recevait un `SupervisorInput` que
seul un test remplissait. C'est ce que ce lot ferme, et la question à trancher
n'était pas technique — **que met-on dedans ?**

**Ce qu'on n'y met pas** : une redescription des tools d'opencode. Son prompt
système décrit déjà `read`, `edit`, `bash`, `task`, `question` ; les redire moins
bien, dans le même message système, c'est se contredire soi-même.

**Ce qu'on y met** : les trois choses qu'opencode ne peut pas savoir.

1. **Qui l'agent est** dans minddy, et à quoi la session est ancrée (ticket /
   carnet / relecture de PR).
2. **Les 32 tools de domaine** et leur doctrine — le plan du ticket appartient à
   l'utilisateur, un statut ne s'écrit jamais, une remarque ancrée est rationnée.
3. **Ce que le HARNESS impose à ses tools à lui** : git nous appartient et le shell
   refuse ce qui détruit du travail, la recherche web est la nôtre et plafonnée, une
   question TERMINE le tour, la porte de livraison du premier `create_pr`.

**Et c'est LE MÊME TEXTE que la boucle maison.** Les fragments de doctrine ont été
sortis du corps de `buildAgentSystemPrompt`
([prompt.ts](../lib/server/agent/prompt.ts)) et sont appelés par les deux moteurs ;
la seule chose qui varie est déclarée dans une table, `PromptToolNames` (`read_file`
→ `read`, `run_command` → `bash`, `spawn_agent` → `task`, `ask_user` → `question` ;
`run_background`, lui, porte le MÊME nom des deux côtés depuis §2.21). Deux gardes
tiennent l'ensemble :

- le prompt de la boucle maison est **inchangé à l'octet** — vérifié sur 192
  combinaisons d'ancrage × options pendant le refactor ;
- l'ancrage servi à opencode ne contient **aucun nom de tool de l'ancien harnais**
  ([opencode-anchor.test.ts](../lib/server/agent/opencode-anchor.test.ts)) : c'est
  le seul défaut de cette famille qui ne se voit nulle part — un modèle appelle un
  tool qui n'existe pas, round après round, et il a juste l'air bête.

Trois écarts sont écrits à la main, parce que la mesure les a rendus différents :
`task` **bloque** le parent (§2.14, donc « tu n'attends jamais, tu ne sondes
jamais » est faux ici), il n'y a **pas d'édition par lot** (§3.2), et `bash` **ne
garde pas** la sortie complète d'une commande (pas de `full_output_path` à
promettre — c'est `shellSavesOutput` dans la table, et non plus l'absence de tool
de fond, qui le dit).

Le **prompt du tour**, lui, est ce que l'amorce a mis dans les messages
utilisateur : contexte du ticket ou de la pull request, travail hérité, instructions
du dépôt, demande du lanceur. Sur un tour repris il est vide — l'historique est dans
le journal, et la demande arrive par le steering (§2.19).

### 2.19 Le steering et le « Stop » (lot 3)

Les deux gestes les plus visibles du produit, et les deux qui manquaient au
superviseur : le bouton « Stop » ne faisait rien, et un message écrit pendant un
tour restait dans la file jusqu'au tour suivant — sur un tour qui dure des heures,
c'est-à-dire indéfiniment.

**Un message ne s'injecte pas dans une session qui travaille.** Chez opencode il n'y
a pas d'historique à muter entre deux appels : il y a un tour en cours. Le geste est
donc `abort` (40 ms mesurés, la requête en vol se termine proprement) puis un
nouveau prompt **au `session.idle` qui suit** — la même frontière sûre que la boucle
maison, atteinte par l'autre bout.

Deux règles qui décident du reste :

- **On ne draine la file que quand on est en mesure de poster derrière.**
  `pullSteering` consomme ; un message drainé et non posté est perdu pour de bon,
  puisque le plan de contrôle ne re-queue un run que sur ce qui reste dans la file.
  D'où la sonde `hasPendingMessages` avant le drain.
- **Un « Stop » accompagné d'un message se poursuit dans CE tour**, et le drapeau
  est alors **consommé** — sans quoi le sondage suivant le relirait et sortirait,
  message accepté et jamais joué. C'est mot pour mot le raisonnement de
  `clearInterrupt` dans `agent-loop.ts`, et les deux moteurs le tiennent pareil.

Le sondage est **temporel** (5 s) et non par round, puisqu'il n'y a plus de round à
nous : sa granularité est celle du flux d'events. Un `bash` de trois minutes retarde
donc le stop d'autant — c'était déjà vrai de la boucle maison, qui ne relisait le
drapeau qu'entre deux rounds.

### 2.20 Pas de drapeau : opencode EST le moteur (lot 3)

La première version de ce lot posait un drapeau par projet en `app_config`, sur le
modèle du drapeau VM de MIN-224. **Clément l'a retiré**, et l'argument est le bon :
minddy a un utilisateur, et un interrupteur qu'une seule personne pourrait actionner
ne vaut pas la surface qu'il ajoute. `agent_opencode_projects` et
`agent_loop_in_vm_projects` ont donc disparu tous les deux, avec le module qui les
lisait — tout run neuf part sur opencode, dans la microVM, sans rien demander.

**Ce qui reste, et qui n'est pas le drapeau** : la colonne `agent_runs.agent_engine`,
écrite à la création et jamais relue ailleurs. Elle ne décide de rien ; elle **dit**
quel harness a joué ce run-là. Deux raisons de la garder :

1. **Un run déjà en vol garde son moteur.** Les deux ne gardent pas leur mémoire au
   même endroit (`checkpoint.messages` contre `checkpoint.opencode`) : rebasculer une
   conversation en cours ne lui ferait pas perdre un réglage, ça lui ferait perdre son
   historique. Le déploiement de la bascule est donc sans effet sur ce qui tourne.
2. **La lecture d'un incident.** « Pourquoi ce run s'est-il comporté autrement ? » se
   répond sur la ligne, pas sur l'état d'une config au moment où on regarde.

La valeur `loop` disparaîtra avec `agent-loop.ts`, quand il ne restera plus rien à
reprendre. Et `loop_in_vm` est désormais toujours vrai : la colonne est lue par les
balayeurs (`reapDeadVmRuns` la veut vraie, `requeueStuckRuns` la veut fausse), donc
elle doit dire la vérité même quand plus personne ne la décide.

Le serveur, enfin, est tenu par
[vm/opencode-host.ts](../lib/server/agent/vm/opencode-host.ts) : `spawn` d'un
enfant ordinaire depuis le process du harness (le piège du `nohup` du §2.7 ne
concernait qu'une commande RPC du Sandbox), version **épinglée**, et installation
**seulement si le binaire manque** — cuit dans `AGENT_SANDBOX_SNAPSHOT_ID` il ne
manque jamais et le tour paie 1,3 s, sinon le repli coûte les 10,6 s mesurés.

### 2.21 `run_background`, reposé en tool local (lot 3)

`bash` n'a **pas** de mode fond, et le registre `BackgroundJob` d'opencode sert
`task`, pas le shell (§3.2). Le repli qui tenait jusqu'ici était une phrase de
prompt : « ton shell est PERSISTANT, lance ton serveur en `&` et tue-le toi-même ».
Il portait la doctrine — *faire tourner le code pour de vrai* — et **aucun de ses
garde-fous** :

- rien ne tuait le serveur avant le `git add -A` de fin de tour, donc il écrivait
  dans le dépôt pendant qu'on le commitait, et il tenait la microVM éveillée après ;
- sa sortie n'était bornée par personne (`BACKGROUND_OUTPUT_CAP`, l'incrément par
  sonde) : un watcher bavard revenait en entier dans le contexte ;
- `checkCommand` ne voyait pas passer la commande — un `git push` lancé en `&`
  aurait échappé au garde-fou git de MIN-108.

Le tool est donc reposé, et **c'est le seul tool LOCAL** de ce harnais : il ne sort
jamais de la microVM. [background.ts](../lib/server/agent/background.ts) ne bouge pas
d'une ligne — la politique (plafond de 3 jobs, garde-fou, offsets, mise en forme) y
est pure, et ses tests non plus ne bougent pas. Seul le câblage est neuf :

| Ce qu'il fallait | Où |
| --- | --- |
| Le fichier servi au modèle | `opencodeToolFiles` le génère comme les 32 autres (`LOCAL_TOOL_NAMES`) |
| L'exécution | Le pont, en `supervisorTool` — pas de `cp.callTool` : le plan de contrôle n'a pas de dépôt à faire tourner |
| Les mains sur le dépôt | `repoBackgroundRunner`, déménagé d'`exec-tool.ts` vers [repo-host.ts](../lib/server/agent/repo-host.ts) — les deux moteurs s'en servent, et le lot 3 finira par supprimer le premier |
| L'arrêt avant tout staging | `create_pr` (avec son `jobsNote`) et la fin de tour, avant le push |
| Le prompt | `backgroundToolNote`, fragment PARTAGÉ : la boucle maison est inchangée à l'octet, l'ancrage d'opencode le rend avec `bash` pour shell |

**Un piège mesuré sur le binaire, qui aurait rendu le tool à moitié inutile** : le
log complet d'un job vit dans `TOOL_OUTPUT_DIR`, donc **hors du dépôt** — sans quoi
le `git add -A` de fin de tour le commiterait. Or opencode gate les lectures hors
projet derrière la permission `external_directory`, que **nous refusons** (§ garde-
fous). La note qui dit au modèle où est son log est donc devenue dépendante du
moteur : `read_file`/`grep` pour la boucle maison, **le shell** (`tail`, `grep`)
pour opencode. Le texte d'origine l'aurait envoyé contre un mur qu'on tient
nous-mêmes, et vers un tool (`read_file`) qui n'existe pas chez lui.

**Un piège de table, attrapé au passage** : `PromptToolNames.background` servait
aussi de discriminant de moteur — « pas de tool de fond » valait « pas de
`full_output_path` non plus ». Les deux se sont séparés le jour où opencode a eu un
tool de fond : le champ `shellSavesOutput` dit maintenant la seconde chose, sans
quoi l'ancrage se serait mis à promettre au modèle un fichier de sortie complète que
le `bash` d'opencode ne garde pas.

Une session de **relecture** n'en a pas : `PR_REVIEW_TOOLS` ne le porte pas, donc il
n'est ni généré, ni routé, ni annoncé — une review tient dans une session.

### 2.22 Les images de `read_resource` : elles traversent, et il fallait DEUX déclarations (lot 3)

Mesuré le 2026-08-12 sur `opencode-ai@1.18.16`, serveur réel, vraie clé, modèle de
vision, ~0,004 $ sur quatre passages. La sonde reste dans le dépôt et se rejoue :
[opencode-images.probe.test.ts](../lib/server/agent/vm/opencode-images.probe.test.ts)
(`MDY_OPENCODE_IMAGE_PROBE=1`) — le modèle doit nommer les quatre quadrants d'une
PNG 64×64 générée à l'exécution, ce qu'aucun modèle ne devine.

Le plan supposait un **prompt de relance** portant l'image après le tool. Ce n'était
pas nécessaire, et la vraie voie est meilleure : le `ToolResult` d'`@opencode-ai/plugin`
a une forme riche, `{title, output, attachments}`, et `ToolAttachment` est
`{type: "file", mime, url, filename}` — **une data URL passe telle quelle**, ce qui
tombe pile sur `AgentToolImage` ([content.ts](../lib/server/agent/content.ts)), qui
est déjà une data URL et pour la même raison (l'historique est rejoué des heures
plus tard, une URL signée a expiré).

Ce qu'opencode en fait, lu dans le corps de requête : il pose un message `user`
juste après le round, `[{type: "text", text: "Attached media from tool result:"},
{type: "image_url", image_url: {url: …}}]` — **exactement** ce que la boucle maison
construisait. Ce message n'est PAS persisté en session (vérifié sur
`/session/:id/message` : trois messages, pas quatre), donc il ne produit aucun
événement et ne peut pas entrer dans le texte du round ni dans le message de commit.

**LE PIÈGE, et il coûtait la parité en silence.** `attachment: true` sur le modèle
**ne suffit pas**. L'image traverse tout le harness, et opencode la remplace au
dernier moment par un texte :

> `ERROR: Cannot read "quad.png" (this model does not support image input). Inform the user.`

Le modèle répondait donc `NO_IMAGE` — et en production il aurait prévenu
l'utilisateur d'une limite qui n'existe pas. Ce que le binaire teste, c'est
`capabilities.input.image`, qui se déclare en config par **`modalities.input`**.
D'où les deux champs posés ensemble dans `modelDef`, sur le même `job.imageInput`.
Rien dans un type-check ni dans un test unitaire ne l'aurait dit.

Le câblage, lui, tient en trois pièces :

| Pièce | Ce qu'elle fait |
| --- | --- |
| [opencode-config.ts](../lib/server/agent/vm/opencode-config.ts) | `attachment` **et** `modalities.input: ["text","image"]` quand `job.imageInput` |
| [tool-bridge.ts](../lib/server/agent/vm/tool-bridge.ts) | les `images` du plan de contrôle deviennent une **enveloppe** `{output, attachments}`, annoncée par l'en-tête `x-minddy-attachments` |
| [opencode-tools.ts](../lib/server/agent/vm/opencode-tools.ts) | le tool généré rend l'enveloppe en `ToolResult` riche ; sans l'en-tête, il rend le texte comme avant, à l'octet |

Le **texte** du résultat ne change pas : la fiche signalétique reste ce que le
modèle lit, l'image s'y ajoute. Un fil raconte donc la même chose des deux côtés de
la bascule. Les sous-agents n'en ont pas besoin : `read_resource` est dans
`SUBAGENT_FORBIDDEN_TOOLS`, leurs modèles ne déclarent donc pas la modalité.

### 2.23 Le round coupé en vol : opencode n'en facture RIEN, le proxy si (lot 3)

Mesuré le 2026-08-12, serveur réel, vraie clé, ~0,003 $ par passage. Sonde
rejouable :
[opencode-abort.probe.test.ts](../lib/server/agent/vm/opencode-abort.probe.test.ts)
(`MDY_OPENCODE_ABORT_PROBE=1`) — elle monte le **vrai** proxy de production.

C'est la question que le plan avait laissée ouverte, et la réponse est la
mauvaise :

| Après un `abort` en pleine génération | Ce qu'on relève |
| --- | --- |
| Le message assistant d'opencode | `finish: null`, `cost: 0`, `tokens: {input: 0, output: 0}`, `error: MessageAbortedError` — alors que **179 caractères** étaient écrits |
| Notre traducteur | exige un `finish` pour écrire au ledger, à raison : sans lui il écrirait une ligne vide puis une vraie |
| Le fournisseur | a facturé **0,002827 $** (2 032 tokens de prompt, 159 de complétion) |

Toutes les sorties du superviseur sauf une passent par un `abort` — plafond de
dépense, « Stop », steering, deadline, question du modèle. La dépense sortait donc
du ledger, du quota et de la facture **sur un geste déclenchable à volonté** :
exactement le défaut que MIN-216 avait fermé côté boucle maison, rouvert par le
changement de moteur.

**Ce qui le referme, et c'est une propriété du proxy, pas une estimation** : il ne
passe aucun signal à son `fetch` amont. Quand opencode s'en va, la boucle de
lecture continue jusqu'à la dernière frame — **1 221 ms plus tard, sans une erreur
de socket** — et cette frame-là porte `usage`, donc le coût facturé et le
`generation_id`. Le superviseur appelle donc `proxy.settle()` puis `proxy.drain()`
en fin de tour (`TurnLedger.recordOrphans`) et écrit la ligne au montant du
FOURNISSEUR, `estimated: false`.

Deux choix qui vont avec :

- un flux qui n'aurait même pas rendu son `usage` (fournisseur coupé, panne
  réseau) **n'est pas écrit** : une ligne à zéro se lirait « cet appel était
  gratuit », ce qui refait le trou. Elle est journalisée, elle.
- la ligne prend un `seq` de la **mère** : le proxy voit du HTTP, pas des
  sessions. Une ligne mal rangée vaut mieux qu'une dépense qui n'existe nulle part.

`abandoned-spend.ts` reste dans le dépôt pour la boucle maison, mais le chemin
opencode ne s'en sert pas : il n'a rien à estimer.

### 2.24 Le premier run de production : mort au démarrage, muet au fil (lot 3)

Premier vrai run sur opencode en production, 2026-08-12. Le fil affiche « Ouverture
de la sandbox » puis « L'agent Numo travaille » — et plus rien, jamais. Autopsie par
la ligne du run : `error_message: "opencode did not become healthy within 60000 ms"`,
posé **6 min 30** après le démarrage du harness. Deux défauts, et le second ne se
serait vu qu'après avoir corrigé le premier.

**1. La sonde de santé n'avait pas de plafond, donc l'attente n'en avait pas non
plus.** Les logs de la microVM disent que le serveur a démarré (`opencode server
listening on http://127.0.0.1:4096`, sa base SQLite créée à T+1 s), et pourtant la
sonde n'a rien obtenu. Sur une microVM **neuve**, le disque est hydraté
paresseusement : le premier exec des 176 Mo de binaire se paie bien plus cher que
les 1,3 s mesurées au lot 0 sur une VM chaude, et pendant ce temps le serveur
**accepte la connexion sans répondre**. Un `fetch` sans signal attend alors le
`headersTimeout` d'undici — **300 s** —, ce qui explique l'écart entre les 60 000 ms
annoncés et les 6 min 30 vécues : la boucle de sondage ne bouclait pas, elle faisait
UNE requête et attendait cinq minutes. Corrigé des deux côtés : `healthy()` porte son
propre plafond (2 s), le plafond de démarrage passe à 5 min, l'erreur cite le temps
**réellement** attendu, et une ligne de journal tombe toutes les 15 s pour que le
prochain diagnostic tienne dans une lecture de logs.

**2. Les deltas de RÉFLEXION portent `field: "text"`, comme la réponse.** Lu dans le
binaire 1.18.16 (`case "reasoning-delta"` → `updatePartDelta({… field:"text"})`) puis
**capturé** contre un faux fournisseur local, coût nul
([fixtures/opencode-reasoning.ndjson](../lib/server/agent/vm/fixtures/opencode-reasoning.ndjson)) :
une frame de delta ne dit rien de ce qu'elle transporte, seul le
`message.part.updated` d'ouverture du part le dit (`type: "reasoning"`, `text: ""`,
`time.start`). Tant qu'on ne le lisait pas, la chaîne de pensée entrait dans le texte
du round — donc dans ce que le fil affiche comme la parole de l'agent, et dans le
message de commit — et le compteur de réflexion du fil (MIN-122) restait éteint : un
modèle à `reasoning_level: high` peut penser des minutes avant son premier mot, et le
fil n'avait rien à montrer pendant ce temps. La traduction tient désormais la nature
de chaque part, écarte la réflexion du sac de texte, allume `reasoningActive` au
direct et rend la trace repliée sous le **même** event `thinking` que la boucle
maison.

**Au passage, le même défaut ailleurs** : notre propre prompt, republié par la
session en `message.part.updated` de type `text`, entrait lui aussi dans la réponse
du tour (mesuré sur la fixture : la réponse commençait par « dis bonjour »). Le rôle
d'un message ne se lit que sur `message.updated` — on le retient, et les parts des
messages `user` sont écartés.

---

### 2.25 Le fil ne racontait plus le tour : trois symptômes, un seul manque (lot 3)

Deuxième run de production, 2026-08-12, `openai/gpt-5.6-luna`. Le travail est bon
(PR ouverte, tests et type-check passés), mais **l'écran ment sur trois points** :

1. le texte que le modèle écrit entre deux séries de tools apparaît en direct puis
   **disparaît** ;
2. le tour se termine normalement et le fil le rend **« interrompu »** ;
3. sur le message suivant, l'indicateur repart avec le chrono du tour **précédent**,
   dont le déroulé se vide ensuite en events bruts, sans clôture.

**Un seul manque les explique tous les trois** : le superviseur n'émettait AUCUN
event pour le texte du modèle. Le run compte 148 events — `tool_call`,
`tool_result`, `thinking (reasoning)`, `status` — et pas une bulle de texte.

- Le direct n'est persisté nulle part (c'est sa définition) : sans event derrière,
  la narration s'efface à la fin du round. → symptôme 1.
- Le fil ne connaît qu'un seul signe de fin de tour, l'event **`summary`**
  (`closesTurn`, agent-event-feed.tsx). Un tour au repos sans clôture est lu comme
  un tour arrêté en cours de route. → symptôme 2.
- Le tour restant ouvert, le travail du tour suivant s'empile dans le même
  accordéon, et le `user_message` du steering **vide** le travail non clos en items
  libres (`flush()`). → symptôme 3.

La règle de la boucle maison est reprise au mot (`agent-loop.ts`) : `thinking`
(sans `kind`, 2 000 caractères) pour le texte d'un round qui CONTINUE — chez
opencode, `message.updated` avec `finish: "tool-calls"` —, `summary` (8 000) pour la
réponse du tour, émis en fin de tour et **seulement** s'il s'est terminé
normalement : un tour coupé n'a pas de mot de la fin, et le fil doit continuer de
le dire interrompu. Le direct se tait à la fin d'un round intermédiaire (`clearLive`)
mais **garde** le texte du dernier round : son `summary` ne part qu'après l'export
du journal et le push, et l'effacer plus tôt ferait clignoter la réponse.

**Et les filles** : leur rapport ne remontait nulle part non plus. Le bloc d'un
sous-agent lit un `summary` marqué à son nom et se referme sur
`status: subagent_report` — les deux partent désormais sur son `session.idle`.

### 2.26 La relecture du chantier : quatorze défauts, et le motif qu'ils partagent

Passe de vérification du 2026-08-12, plan et dossier en main, code lu ligne à
ligne. Quatorze défauts confirmés — corrigés, chacun avec son test —, seize
soupçons réfutés. **Aucune tâche du plan n'était fausse au point de repartir en
« à faire » : ce qui manquait était toujours un maillon, jamais la brique.**

**Le motif, et il est le même six fois : une écriture complète, une lecture
absente.** Un chemin où l'on produit soigneusement une donnée que personne ne
relit ne lève rien, ne type rien de travers, et ne se voit que sur un run réel.

| Le défaut | Ce qui manquait |
| --- | --- |
| **La reprise ne reprenait rien.** `VmJob.opencode` n'était écrit par personne (`execute.ts`) : chaque tour créait une session NEUVE. Le superviseur exportait, le plan de contrôle estampillait, `AgentCheckpoint` déclarait — et la microVM ne recevait rien. La sonde du lot 0 mesurait un chemin que la prod n'empruntait jamais. | une ligne de lecture |
| **Un tour repris rejouait son amorce.** Corollaire du précédent : `messages` étant vide sous opencode, l'amorce à froid repartait, et le contexte du ticket + la demande du lanceur seraient repostés PAR-DESSUS l'historique restauré. `VmJob.opencodeInput` promet pourtant « `prompt` est vide sur un tour REPRIS ». | une branche |
| **Un flux muet gelait le tour.** « Stop », steering, sauvegarde périodique et échéance murale vivaient tous DANS le corps de la boucle d'events. Un `bash` de vingt minutes ne publie rien : plus d'horloge, et surtout plus de `last_activity_at` — le chien de garde partait sonder une microVM vivante (§2.24 en avait corrigé le symptôme, pas la cause). D'où le **battement** (`LIFECYCLE_BEAT_MS`), qui court contre l'event suivant. | un timer |
| **Le journal n'était borné par rien.** L'export est incrémental, l'ENVOI ne l'est pas : le checkpoint porte l'accumulateur entier. Le plan tenait le plafond de 4,5 Mo pour « sans objet » depuis que le checkpoint était devenu append-only — **un journal append-only se réécrit entier à chaque sauvegarde**. Passé la barre : 413 rangé en panne passagère, plus aucune sauvegarde, plus de battement de cœur, rapport final refusé. On lâche le journal (jamais on ne le rabote : `/sync/replay` veut des `seq` contigus) et on dit `turnHistoryReset`. | le plafond |
| **Un message de steering drainé pouvait mourir.** `pullSteering` CONSOMME, et le tour peut sortir entre le drainage et le post (plafond, deadline, run conclu). Accepté à l'écran, perdu pour toujours — et le run ne se réveillait pas, puisque c'est la file qui le re-queue. D'où `POST /messages`, qui le remet en file. | un chemin de retour |
| **Le plafond de sous-agents ne bornait rien.** Il se comptait sur les filles VIVANTES, or la naissance suit l'autorisation (le dépôt l'ancre lui-même : `runningAtAsk === 0`). Un round qui appelle `task` trois fois voyait ses trois demandes passer. `SubagentContext.pending` compte le crédit ouvert. | le compte des promises |
| **Une réponse d'erreur du fournisseur faisait facturer un round DEUX fois.** Le lecteur du proxy allouait dès la première ligne JSON lisible : un `{"error":…}` sur 429 devenait une génération au modèle VIDE, donc appariable à tout. Le round repartait sans son coût, et la vraie génération finissait en « orpheline ». | deux gardes (statut, et trace) |
| **`prompt_tokens` ne voulait pas dire la même chose sur les deux moteurs.** L'`input` d'opencode EXCLUT le cache. Le plan disait `input→prompt_tokens` : **c'est le plan qui avait tort**, et sa propre mesure le dit (`input + cache.read + cache.write = native_tokens_prompt`, §2.5). Le taux de hit `cached_tokens / prompt_tokens` (MIN-242) pouvait dépasser 1, et la comparaison ligne à ligne — le critère de bascule — ne comparait pas la même chose. | l'addition |
| **La porte de livraison était aveugle au shell.** `rm`, `mv`, `sed -i`, un codemod : plus de `delete_file` ni de `move_file` sous opencode, donc `editedPaths` restait vide et un tour qui n'a fait que ça livrait **sans un contrôle**. C'est l'arbre de travail qui tranche maintenant (`probeRepoTouched`), en recours seulement. | la lecture de git |
| **`abortsRequested` ne se remettait jamais à zéro.** Un `abort` peut ne rien publier (opencode répond 200 sur une session au repos), et le steering coupe justement des sessions qui viennent parfois de finir. Le crédit restait ouvert, et la coupure SUIVANTE — celle que personne n'a demandée — se faisait avaler : ni event, ni erreur, un tour rangé « terminé ». | la remise à zéro au round |
| **Une fin de tour sur `length` partait deux fois.** La narration se décidait sur « ≠ `stop` », alors que `tool-calls` est la seule fin qui CONTINUE. Le texte partait en `thinking` (2 000) puis en `summary` (8 000) — et le fil dédoublonne par égalité de texte, que deux plafonds ne rendent jamais. | le bon prédicat |
| **`update_plan` faisait une bulle.** Tool de CONTRÔLE : la boucle maison n'en émettait aucun event. Chez opencode il passe par le binaire, donc le flux publie ses parts — la checklist était racontée deux fois. | un filtre |
| **`webfetch` partait sans son URL.** Aucun vis-à-vis maison, donc aucun cas dans `toolArgSummary` : l'event partait à `{}`. Un tour de lecture web illisible au replay. | un `case` |
| **Le motif d'un refus local ne remontait plus.** `forbidden_command` sur un `run_background` mourait dans le pont : les refus cessaient d'être mesurables sur `agent_run_events`. | un rappel |

Et un quinzième, hors VM : le garde-fou d'installation de
[create-agent-snapshot.ts](../scripts/create-agent-snapshot.ts) ne pouvait pas se
déclencher — `npm i … | tail -5` rend le code de sortie de `tail`, qui réussit
toujours. Un registre en panne se serait fait prendre pour un binaire de mauvaise
version dix lignes plus bas.

**Ce que la relecture n'a PAS trouvé, et qui vaut d'être dit** : les seize
soupçons réfutés portaient presque tous sur les endroits les plus commentés du
chantier — le proxy, les permissions, l'appariement des générations, les images.
Là où le code explique pourquoi il fait ce qu'il fait, il avait raison. Les
quatorze vrais défauts vivent tous à une FRONTIÈRE : entre deux modules, entre le
plan et la VM, entre une écriture et sa lecture.

### 2.27 La deuxième relecture : sept défauts, tous sur un chemin d'EXCEPTION

Passe du 2026-08-13, menée par six lecteurs indépendants suivis d'une réfutation
contradictoire de chaque soupçon : **sept défauts confirmés et corrigés**, six
réfutés. Aucune tâche du plan ne repart en « à faire » — comme la fois d'avant,
ce qui manquait était un maillon, jamais la brique.

**Le motif, cette fois, n'est plus « une écriture sans lecture » mais « le chemin
NORMAL est traité, l'autre non ».** Chaque défaut se lit de la même manière : ce
qui devait arriver à la fin d'un round arrivait bien à la fin d'un round *réussi*,
et nulle part ailleurs.

| Le défaut | Ce qui manquait |
| --- | --- |
| **Un tour mort en vol ne facturait rien.** `recordOrphans` — le seul écrivain de la dépense d'un round qu'opencode ne facture pas (§2.23) — vivait après la boucle, donc uniquement sur le chemin heureux. Or la SEULE façon d'apprendre que le serveur opencode est mort est son flux `/event` qui se rompt : l'exception sautait la reprise, le `finally` fermait le proxy derrière, et le rapport annonçait `costUsd: 0` sur un round que le fournisseur avait facturé. Le trou de MIN-216, rouvert sur le chemin où il est le plus probable. | le `catch` |
| **Le texte d'un round coupé se recollait devant le suivant.** Le sac de texte n'était vidé qu'à la fin d'un round FACTURÉ ; un round avorté n'en a pas. Sur un steering (`abort` puis nouveau prompt sur la même session), le fragment écrit avant la coupure repartait en tête du direct, de la réponse du tour, du `summary` **et du message de commit**. | le vidage sur `MessageAbortedError` |
| **`sessionError` ne se remettait jamais à zéro.** Une erreur de session non-coupure ne SORT PAS de la boucle. Reposté par un message de steering, le tour finissait bien, poussait — et se rangeait quand même `error`, sans son `summary`, donc rendu « interrompu » par le fil. | la remise à zéro au repost |
| **Le compteur d'outils du direct était cumulatif, filles comprises.** Le fil lit `tools === 0` comme « ce texte est peut-être la réponse » (`isLiveAnswer`) ; la boucle maison envoie l'accumulateur INTERNE au round. Cumulé, il ne retombait jamais : dès qu'un tour avait appelé un tool une fois, toutes ses réponses suivantes s'affichaient comme de la narration. | la remise à zéro au round |
| **Les descriptions de tools citaient les tools de l'ANCIEN harnais.** `agentToolsFor` est la seule source, et son texte dit « use run_command for those », « exactly like edit_file ». Servi tel quel, `run_background` envoyait le modèle appeler un tool qu'opencode ne sert pas — pendant que son prompt système, lui, citait `bash` (`OPENCODE_TOOL_NAMES`). Deux vérités dans le même contexte. | la table de noms, à la génération |
| **Une RELECTURE recevait la délégation.** `primaryTools` sert `task` dès que `subagents.maxParallel > 0`, et le job posait ce plafond sans regarder `writesToRepo` — les deux prompts, eux, le conditionnaient déjà. Un run de relecture pouvait donc ouvrir des filles qui ÉDITENT le dépôt. | la même condition sur le job |
| **Suppressions et fichiers neufs faits au shell ne déclenchaient aucun contrôle.** `probeRepoTouched` (§2.26) ouvrait la porte mais remplissait `editedPaths` avec `turnDiffStat.files`, qui EXCLUT les suppressions et ne compte les fichiers neufs qu'en nombre : un tour qui ne faisait que `rm lib/x.ts` livrait sans un type-check, alors que c'est le changement qui casse le typage ailleurs. Et rien ne PÉRIMAIT la vérification du modèle (`noteVerificationStale` n'a qu'un appelant, la permission `edit`) : un `npm test` vert d'avant le `rm` faisait taire la porte. La boucle maison faisait les deux depuis `delete_file`. | `turnTouchedPaths`, et la péremption |

**Ce qui a été réfuté**, et vaut d'être noté pour ne pas y revenir : le flux `/event`
souscrit après le premier prompt (mesuré : aucune frame perdue), le steering drainé
sur un `prompt_async` en échec (le journal est rejoué avant), `recordOrphans` sur
un fournisseur non-OpenRouter, le plafond de temps du `bash` (120 s **par défaut**,
que le modèle peut monter à 600 s — l'inverse d'un plafond perdu), et le plafond
d'images par tour (`MAX_IMAGES_PER_TURN`) : le message qu'opencode fabrique d'une
pièce jointe n'est PAS persisté en session (§2.22), donc il ne repart pas à chaque
round et n'entre pas dans le journal ; il reste un écart de comportement à mesurer
pendant la semaine d'observation, pas un défaut avec une sortie fausse.

### 2.28 Un octet nul, et le tour se fige — l'incident du 2026-08-12 (23 h)

Deux symptômes rapportés le même soir, un seul défaut dessous, et il n'est pas
dans le superviseur : **il est dans ce que Postgres accepte**.

Ce qui se voit : un message de steering envoyé pendant que l'agent répond coupe sa
réponse **et ne le relance pas** — comme un « Stop ». Le tour reste « en cours »,
figé sur le même tool pendant un quart d'heure, la microVM tourne toujours, et le
message a disparu de la conversation au rechargement. Puis, quelques minutes plus
tard, la session se range toute seule avec « le processus de ce tour s'est arrêté
avant d'avoir fini ».

Ce qui s'est passé, lu dans les logs de production (runs `66023558`, `a8051d06`) :

```
[agent-runs] stampRun 66023558 → (fields) failed: unsupported Unicode escape sequence   PUT /checkpoint → 409
[agent-runs] stampRun 66023558 → completed failed: unsupported Unicode escape sequence  POST /rest → 200
```

`\u0000` ne se stocke NI en `text` NI en `jsonb` : Postgres refuse la ligne
entière. Et ce que nous écrivons vient d'un modèle et de son shell — la sortie
d'une commande qui touche un binaire, un log tronqué au milieu d'un caractère, le
journal d'événements d'opencode qui les transporte. **Un octet, et la chaîne
entière tombe, dans cet ordre :**

1. la sauvegarde périodique est refusée ⇒ **le battement de cœur s'arrête** ;
2. le plan de contrôle rend **409**, et le superviseur lit un 409 comme « le run a
   été conclu ailleurs » : il coupe le tour et rend la main. Le steering n'était
   pour rien dans la coupure — il tombait au même moment ;
3. le rapport de fin de tour ne s'écrit pas non plus, et `landVmTurn` avale
   l'échec : le run **reste `running`** alors que la VM meurt derrière ;
4. le chien de garde le constate trois minutes plus tard — d'où la phrase sur le
   processus arrêté, qui décrivait une conséquence, pas la cause.

Trois correctifs, un par maillon, et le premier suffirait à fermer le cas connu :

- **`stripUnstorable`** ([runs.ts](../lib/server/agent/runs.ts)) retire l'octet nul
  et les demi-caractères isolés de tout ce qui part en base — `stampRun`,
  `appendEvent`, `insertRunMessage`. On les retire plutôt que de refuser
  l'écriture : ils ne valent rien pour personne, et le tour vaut beaucoup.
- **Une panne d'écriture n'est plus un run conclu** : `stampRunResult` distingue
  « la garde n'a pas matché » de « la base a refusé », et le plan de contrôle rend
  **503** sur le second — le client retente, le tour continue. C'est ce qui
  transformait n'importe quel hoquet de base en mort d'un tour vivant.
- **La mise au repos aboutit** : si le checkpoint est refusé, `vm-rest` refait le
  stamp **sans lui** et le dit au fil (`checkpointRefused`). Une session repart de
  son état précédent, au lieu de rester ouverte jusqu'au chien de garde.

Et un quatrième, hors chaîne mais du même soir : `insertRunMessage` ne regardait
pas le résultat de son insert. supabase-js ne lève pas — il rend `{ error }`. La
route de steering répondait donc `ok` sur un message que **personne n'avait mis en
file** : bulle optimiste à l'écran, agent qui ne lit rien, message disparu au
rechargement. Il lève maintenant, et le composer retire sa bulle en le disant.

### 2.29 Le journal sort de la ligne du run — la mémoire d'une vraie session

Le premier tour long qui réussit (2026-08-13, run `1e8775aa`, 31 minutes, 753
events, 1,03 $) s'est terminé sur `turnHistoryReset` : **toute la conversation
perdue**. Le tour suivant, celui qui devait juste ouvrir la pull request, est donc
reparti du ticket — il a refait un plan, réexploré le dépôt, puis ouvert la PR.
Vu de l'écran : « il recommence depuis le début ». Et il a lâché son journal une
seconde fois, au bout de quatre minutes.

**Ce que pèse vraiment un journal**, mesuré sur le checkpoint d'un tour de deux
minutes : 226 events, **333 Ko**. Le détail explique tout — un
`message.part.updated` de tool porte la **sortie complète** du tool (une lecture
de 260 lignes = 22 Ko), et opencode republie le part à chaque changement d'état
(`pending`, `running`, `completed`). Le plafond de 3,2 Mo tombe donc **au bout
d'une quinzaine de lectures de fichiers**. Ce n'était pas un cas limite : c'était
l'issue NORMALE de tout tour qui travaille.

Deux plafonds, et le second ne se voyait pas :

1. le **corps** du plan de contrôle (4,5 Mo côté plateforme, 3,2 chez nous) — un
   journal append-only se réécrit entier à chaque sauvegarde ;
2. la **ligne du run**, relue par `getRun` à **chaque appel** du plan de contrôle
   (un par tool, par event, par ligne de ledger). Un journal de 333 Ko s'y payait
   des centaines de fois par tour, en pure perte.

D'où [`agent_run_journal`](../supabase/migrations/20261214090000_agent_run_journal.sql) :
le journal s'écrit en **append**, un lot par sauvegarde, et la ligne du run n'en
garde que le **pointeur** (`{sessionId, seq}`, quelques dizaines d'octets). Le
superviseur pousse ses incréments (`POST /journal`, découpés à 1,5 Mo pour tenir
dans un corps — jamais un event à cheval sur deux lots, `/sync/replay` voulant une
suite contiguë), et la fonction rassemble le tout **une fois par tour** avant de
le passer à la microVM.

Trois conséquences, dont une qui n'était pas le but : la mémoire d'une session
n'a plus de plafond de taille, le plan de contrôle cesse de transporter le journal
à chaque appel de tool, et `turnHistoryReset` n'a plus de raison de se déclencher
sur ce chemin. Le curseur, lui, **n'avance qu'une fois le lot écrit** : un envoi
qui échoue fait réexporter la même tranche au passage suivant, plutôt que de
laisser un trou définitif dans le journal.

---

### 2.30 La fenêtre d'observation, relevée en base (2026-08-14)

Premier relevé de la semaine d'observation, sur les **14 runs** de production
depuis la bascule (2026-08-12 18 h → 2026-08-14 08 h), lus en base par l'API REST
en clé service. Tous portent `agent_engine = opencode` : il n'y a plus qu'un
moteur, et c'est bien lui qui joue.

**La traçabilité tient, et elle se vérifie à l'arithmétique.** Pour chacun des
onze runs sains, `agent_runs.cost_usd` est **exactement** la somme de ses lignes
de ledger, `agent_code` + `sandbox_compute`, à l'arrondi près (0,038833 =
0,029027 + 0,009806). Sur les **394 lignes** `agent_code` de la fenêtre :

| Ce qu'on voulait ne pas perdre | Relevé |
| --- | --- |
| Coût réel, pas estimé | `estimated: false` sur **394/394** |
| Réconciliation fournisseur | `generation_id` présent sur **394/394** |
| Imputation à un humain | `user_id` présent sur **394/394** |
| Deux modèles distincts facturés chacun à son prix | oui (`gpt-5.6-luna`, `deepseek-v4-flash`) |

Total de la fenêtre : **1,42 $** sur la ligne des runs, **1,40 $** au ledger
modèle, l'écart étant le compute de microVM, lui aussi au ledger.

**Le seul défaut trouvé, et il est réel.** Les trois runs dont le process est mort
(« The agent process stopped unexpectedly ») portent `cost_usd = 0` sur leur
ligne, alors que le ledger porte leur dépense : **0,159 $** de modèle, **0,190 $**
compute compris, invisibles sur la ligne. Les trois lignes ont été recollées à la
main le 2026-08-14, au montant du ledger. La cause
est dans `reapDeadVmRuns` ([drain.ts](../lib/server/agent/drain.ts)) : le chien de
garde facturait bien le compute de la microVM, mais ne recollait jamais la
**colonne** au ledger — ce que `landVmTurn` fait pourtant sur le chemin sain
(`Math.max` du rapport de fin de tour). Ni la facture ni les plafonds n'étaient
touchés (`finance.ts` lit le ledger, `control-plane.ts` et `execute.ts` prennent
déjà le MAX des deux) : ce qui mentait, c'est **ce qu'un humain relit après un
incident**. Le trou de MIN-216, sur le dernier chemin qui ne l'avait pas rebouché.

Corrigé dans le même geste, avec ses trois tests
([vm-watchdog.test.ts](../lib/server/agent/vm-watchdog.test.ts)) : le MAX, le
non-recul quand le ledger est en retard, et l'**ordre** — la relecture du ledger
vient APRÈS `recordSandboxUsage`, sans quoi la somme relue n'emporterait pas la
ligne de compute qu'on vient d'écrire. Ce défaut n'est pas propre à opencode : le
chien de garde est commun aux deux moteurs, la bascule l'a seulement rendu
fréquent.

**Deux erreurs de la fenêtre qui ne sont pas des défauts de harnais** : un
`reasoning_effort` en double (run `c7465b6b`, 20 h 17), corrigé le soir même par
`patchCompletionBody` ; et « No endpoints available matching your guardrail
restrictions » sur `deepseek-v4-pro` — une politique de fournisseur OpenRouter,
hors de notre code.

**Ce que la fenêtre ne dit pas encore.** Elle a un jour et demi, pas une semaine,
et les trois processus morts sont tous ANTÉRIEURS aux correctifs de §2.28 et
§2.29 : les quatre runs du 2026-08-14 sont propres de bout en bout. C'est
encourageant, ce n'est pas la preuve — il faut la suite de la semaine.
`AGENT_SANDBOX_SNAPSHOT_ID` est en place sur Vercel (Production et Preview).

---

## 3. L'inventaire de parité — nos 51 tools, un par un

Source : [tools.ts](../lib/server/agent/tools.ts) (1 801 lignes). 51 tools servis,
répartis en `CORE_TOOLS` (18), `MINDDY_TOOLS` (22), `PR_TOOLS` (3),
`PROJECT_PR_TOOLS` (7) et `create_pr`.

### 3.1 Rendus par opencode — 14 tools qui cessent d'être notre code

| Le nôtre | Chez opencode | Ce qu'il faut savoir |
| --- | --- | --- |
| `read_file` | `read` | Même forme : `filePath` absolu, `offset`/`limit`, lignes numérotées, images et PDF en pièce jointe. |
| `list_dir` | `read` (sur un répertoire) | Pas de tool dédié : c'est `read` qui liste, un nom par ligne, `/` final sur les dossiers. |
| `glob` | `glob` | `pattern` + `path`. |
| `grep` | `grep` | `pattern` + `path` + `include`, ripgrep. Nos [grep-pattern.ts](../lib/server/agent/grep-pattern.ts) / [grep-scope.ts](../lib/server/agent/grep-scope.ts) tombent avec. |
| `edit_file` | `edit` | `oldString`/`newString`/`replaceAll`. Notre cascade de [edit.ts](../lib/server/agent/edit.ts) est **empruntée à opencode** : on rend l'original. |
| `write_file` | `write` | Même paire, même exclusion mutuelle avec `apply_patch`. |
| `apply_patch` | `apply_patch` | **Même bascule que la nôtre** sur `gpt-*` (mesuré §2.3). |
| `run_command` | `bash` | Shell **persistant** (gain), `workdir` (gain), timeout à reporter à 180 s. |
| `move_file` | `bash` | `mv`. Pas de tool dédié — et le garde-fou reste le nôtre (§3.4). |
| `delete_file` | `bash` | `rm`, idem. |
| `spawn_agent` | `task` | **FAIT** (§2.14) : `subagent_type` + `prompt`. Le champ `model` devient le NOM de l'agent (`explore-<slug>`), le plafond de plan est tenu par construction, le plafond de simultané par le verdict de permission. |
| `agent_status` | `task` (`task_id`) | Reprise d'une fille par son id, notification au retour d'un lancement en fond. |
| `list_agents` | — | Sans objet : le superviseur voit les sessions filles par `/session/:id/children`. |
| `ask_user` | `question` | Tool natif + `POST /session/:id/question/:requestID/reply`. Le superviseur y branche notre `ask_user`. |

### 3.2 Sans vis-à-vis natif — 2 tools à reposer nous-mêmes, **dans la VM**

Ce sont des tools **locaux** (`.opencode/tool/*.ts`, exécutés dans la microVM) et
non des tools de domaine : ils ne parlent pas au plan de contrôle.

| Le nôtre | Pourquoi il ne tombe pas | Ce qu'on fait |
| --- | --- | --- |
| `apply_edits` | Opencode n'a **pas** d'édition par lot (pas de `multiedit` en 1.18.16). | À trancher : le reposer en tool local, ou l'abandonner et laisser le modèle enchaîner des `edit`. La deuxième option coûte des rounds ; la première maintient un tool d'édition, c'est-à-dire exactement ce qu'on voulait arrêter de maintenir. **Défaut proposé : l'abandonner**, et mesurer le surcoût en rounds sur la semaine de bascule. |
| `run_background` | `bash` n'a pas de mode fond ; le registre `BackgroundJob` d'opencode sert `task`, pas le shell. | **FAIT (§2.21)** : reposé en tool LOCAL, servi par le pont et exécuté par le superviseur. [background.ts](../lib/server/agent/background.ts) ne bouge pas d'une ligne. |

### 3.3 À redéclarer en tools de DOMAINE — 35

> **FAIT au lot 1** : [opencode-tools.ts](../lib/server/agent/vm/opencode-tools.ts)
> les génère, **32 servis sur 32 avec nos schémas** (§2.9). Il n'y a pas de
> « table unique » à écrire, et c'est mieux ainsi : le générateur appelle
> `agentToolsFor` et filtre sur les `Set` de routage
> ([platform-tool-names.ts](../lib/server/agent/platform-tool-names.ts)) — la
> source EST `tools.ts`, donc rien ne peut diverger. Les 3 manquants au compte de
> 35 ne sont pas perdus : `ask_user` a un vis-à-vis natif (`question`), et
> `read_attachment` est un nom d'exécution qui n'est plus servi.

Chacun devient un `$XDG_CONFIG_HOME/opencode/tool/*.ts` — **hors du dépôt**, sans
quoi le `git add -A` de fin de tour les commiterait — qui poste au superviseur,
lequel appelle le plan de contrôle avec l'identité que lui donne l'OIDC du
firewall (même chemin que
[control-plane-client.ts](../lib/server/agent/vm/control-plane-client.ts)).

> **Le pont est écrit** : [tool-bridge.ts](../lib/server/agent/vm/tool-bridge.ts),
> un serveur local que le superviseur ouvre AVANT opencode (son adresse entre
> dans l'environnement) et dont l'URL est `MDY_SUPERVISOR_URL`. Il existe pour
> ce que **le plan de contrôle ne compte pas** — il facture ce qu'on lui demande,
> il ne sait pas ce qu'est un tour : le plafond de recherches web, les ancres de
> relecture déjà posées, la lecture d'images. Deux règles de réponse qui tiennent
> tout le reste : un tool en ÉCHEC répond **200** avec `{"error": …}` (le modèle
> doit lire l'erreur et décider — un 5xx lui ferait rendre une phrase de
> transport qui masque le motif), un **nom inconnu répond 404** (celui-là est
> notre défaut, il doit se voir).

| Famille | Tools |
| --- | --- |
| Tickets (8) | `search_issues`, `read_issue`, `read_feedback`, `read_resource`, `update_issue`, `write_issue_plan`, `append_to_plan`, `edit_issue_text` |
| Wiki (7) | `list_pages`, `search_pages`, `read_page`, `create_page`, `update_page`, `append_to_page`, `edit_page_text` |
| Carnet (4) | `read_scratchpad`, `add_scratchpad_tasks`, `update_scratchpad_task`, `set_scratchpad` |
| Création / automatisation (3) | `create_issue`, `create_routine`, `report_verdict` |
| PR du projet (7) | `list_pull_requests`, `read_pull_request`, `comment_pull_request`, `comment_pull_request_line`, `reply_pull_request_thread`, `review_pull_request`, `set_pull_request_state` |
| PR relue (3) | `comment_pr_line`, `comment_pr`, `reply_pr_thread` |
| Livraison (1) | `create_pr` |
| Plan de session (1) | `update_plan` — `todowrite` est éteint : notre checklist **est** le plan du ticket, elle se synchronise ([plan-sync.ts](../lib/server/agent/plan-sync.ts)), une todo locale ne se lit nulle part |
| Web (1) | `web_search` — **FAIT** : le `websearch` intégré est éteint (§2.3, il n'est pas servi sur OpenRouter de toute façon) et le nôtre le remplace. Le plafond du tour (`webSearchMax`, 5 — `MAX_WEB_SEARCHES_PER_TURN`) est tenu par le pont, mère et filles confondues, et le compteur sert de `seq` : deux recherches d'un même tour font deux lignes de ledger, pas une. Une recherche refusée n'atteint jamais le plan de contrôle, donc ne paie pas le forfait Exa (`WEB_SEARCH_USD_PER_CALL`, 0,005 $) |

Ce qui **ne change pas** avec eux : le ciblage par ancrage (`TARGET_SUFFIX`,
`withRequiredIssue`), les retraits structurels (`NON_INTERACTIVE_FORBIDDEN_TOOLS`
pour une routine, la lecture seule d'une relecture, `SUBAGENT_FORBIDDEN_TOOLS`).
Ils se posent désormais par la **config** (`agent.<id>.tools` + `permission`) au
lieu d'un `filter` sur un tableau — mais ce sont les mêmes règles, et elles restent
**structurelles**, pas des phrases de prompt.

### 3.4 Ce qui n'est pas un tool et ne bouge pas d'une ligne

Fonctions pures, testées, sans vis-à-vis chez opencode. Le superviseur les rejoue
sur `POST /permission/:id/reply` et dans un **plugin** (`tool.execute.before/after`,
`session.idle`).

> **FAIT au lot 2** pour les deux premières : `command-guard` et `repo-path` sont
> rejoués sur `permission.asked` par
> [opencode-permissions.ts](../lib/server/agent/vm/opencode-permissions.ts) — un
> module pur, et **leurs tests n'ont pas bougé d'une ligne** (§2.13).

[command-guard.ts](../lib/server/agent/command-guard.ts) ·
[repo-path.ts](../lib/server/agent/repo-path.ts) (`resolveWithin`, `assertNotGit`) ·
[delivery-gate.ts](../lib/server/agent/delivery-gate.ts) ·
[self-review.ts](../lib/server/agent/self-review.ts) ·
[plan-closure.ts](../lib/server/agent/plan-closure.ts) ·
[network-policy.ts](../lib/server/agent/network-policy.ts) ·
[quota.ts](../lib/server/agent/quota.ts) ·
[abandoned-spend.ts](../lib/server/agent/abandoned-spend.ts).

**Leurs tests existants doivent passer inchangés.** C'est le critère : si un de ces
tests doit bouger, c'est qu'on a déplacé une règle produit sans le vouloir.

### 3.5 À supprimer, mais seulement après la bascule

`agent-loop.ts` (2 407 l.), la moitié générique de `tools.ts`, `tool-loop.ts`,
`prune.ts`, `compact.ts`, `edit.ts`, `patch.ts`, `subagent*.ts`, `retry.ts`,
`content.ts`, `checkpoint-fit.ts`. **Chaque ligne confirmée par un `grep` avant de
partir, pas de mémoire** — et pas avant la semaine de bascule du lot 3.

---

## 4. Ce qui reste à trancher

1. ~~**Le coût au ledger**~~ → **tranché** (§2.5) : écart nul, on branche le `cost`
   d'opencode, et le proxy du superviseur garde `generation_id` (§2.6).
2. ~~**Le démarrage à froid dans le Sandbox**~~ → **tranché** (§2.7) : 1,3 s, et
   l'installation se cuit dans le snapshot pré-chauffé.
3. ~~**La décision d'y aller**~~ → **prise le 2026-08-12**, cf. l'en-tête.
4. **`apply_edits`** : abandonné (défaut proposé) ou reposé en tool local ? La seule
   question encore ouverte, et elle se tranche sur mesure — pendant la semaine de
   bascule du lot 3, au surcoût en rounds constaté, pas avant.

Le reste du chantier est dans le plan de MIN-286.
