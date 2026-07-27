# Le harness du code agent de minddy, comparé à Codex et OpenCode

> **Date** : 2026-07-27 · **Ticket** : MIN-101
>
> **Bases comparées, à commit épinglé** (les trois bougent vite ; toute affirmation
> ci-dessous est vraie *à ces commits*, et doit être relue avant d'être resservie
> dans six mois) :
>
> | Base | Dépôt | Commit |
> | --- | --- | --- |
> | minddy | ce dépôt | `58558ce29e9d0a6612ae48b8e0c8e989a8f10e5d` |
> | Codex | `openai/codex` | `294d813263de08061cb303e7b601d7ea6a5e72e8` |
> | OpenCode | `anomalyco/opencode` (branche `dev`) | `40e4d730cac33cc9e76659ae7acb16b3a6132b83` |
>
> **Méthode.** Trois passes : (1) état des lieux factuel de minddy écrit d'abord,
> fichier par fichier ; (2) lecture ciblée des deux références sur les fichiers qui
> portent les décisions de harness ; (3) confrontation aux données de production
> (`agent_run_events`, 60 derniers jours). Chaque affirmation cite un fichier réel.
>
> **Ce qui n'a pas été fait, et pourquoi.** Le plan prévoyait deux sondes dans une
> session d'agent réelle. Elles ont été remplacées par des preuves plus fortes et
> gratuites : (1) l'absence d'état du shell est *dans le code* — `runShell` repart
> d'un `sh -c` neuf à chaque appel — et corroborée par 29 commandes de production
> qui préfixent un `cd` ; (2) le comportement sur sortie longue a été établi par
> une **sonde déterministe** rejouant la chaîne de troncature réelle (§3.6), plus
> reproductible qu'un run unique et sans dépenser de crédits LLM ni de sandbox.
>
> **Cadre de priorisation.** Le différenciateur de minddy est la sobriété. Chaque
> écart passe trois filtres : (a) est-il *mesuré* ou seulement *observé* ? (b) que
> coûte-t-il en surface produit ? (c) un agent qui travaille sur un ticket minddy en
> a-t-il besoin, ou est-ce une feature de CLI ? **Un écart réel qu'on décide de ne
> pas combler est une conclusion valable** — la section « Non retenu, et pourquoi »
> en compte sept.

---

## 1. Notre harness aujourd'hui

### 1.1 Outils exposés au modèle

[lib/server/agent/tools.ts](../lib/server/agent/tools.ts) définit **13 tools de
cœur**, communs aux deux ancrages :

| Famille | Tools |
| --- | --- |
| Exploration | `read_file` (fenêtré, numéroté), `list_dir`, `glob`, `grep` |
| Édition | `edit_file`, `apply_edits` (batch multi-fichiers), `write_file`, `move_file`, `delete_file` |
| Vérification | `run_command` |
| Hors dépôt | `web_search` (runs OpenRouter uniquement, cf. `agentToolsFor`) |
| Contrôle | `update_plan`, `ask_user` |

puis, selon l'ancrage du run (MIN-84), **4 tools d'ancrage** : ticket
(`read_issue`, `read_attachment`, `write_issue_plan`, `create_pr`) ou carnet
(`read_scratchpad`, `update_scratchpad_task`, `create_issue`, `create_pr`).
Soit **17 tools au maximum** dans une session.

Constantes qui gouvernent leur comportement :

- `RUN_COMMAND_TIMEOUT_MS = 180_000` ([tools.ts:45](../lib/server/agent/tools.ts#L45)) —
  timeout dur, **non paramétrable par le modèle**, et pas de `workdir` non plus :
  la signature de `run_command` est `{ command: string }`, rien d'autre.
- `CONTROL_TOOLS = new Set(["update_plan", "ask_user"])` : traités par la boucle,
  jamais envoyés au Sandbox.
- **Pas de tool de fin de tour.** Le tour se termine quand le modèle répond en
  texte sans tool-call (fin naturelle). Un shim répond encore aux vieux
  checkpoints qui appellent `finish`
  ([agent-loop.ts:888](../lib/server/agent/agent-loop.ts#L888)).

### 1.2 Prompt système

[lib/server/agent/prompt.ts](../lib/server/agent/prompt.ts) —
`buildAgentSystemPrompt({ locale, anchor, webSearch })`. Volontairement **stable**
(il ne dépend que de la langue, de l'ancrage et de la présence de `web_search`) pour
que le préfixe soit réellement partagé par le prompt caching
([caching.ts](../lib/server/agent/caching.ts)). Sections : intro conversationnelle,
Tools, ancrage (Le ticket / Le carnet), Git et pull requests, « How to work when the
user asks for code changes » (5 étapes : Explore → Edit → Verify → Self-review →
Reply), Asking, Rules.

Autour de lui, trois messages `user` d'amorce, dans cet ordre
([execute.ts:666-724](../lib/server/agent/execute.ts#L666-L724)) :

1. `buildAgentContextMessage` — dépôt + ticket (description, plan, pièces jointes
   annoncées par nom/taille/id). Explicitement présenté comme un **snapshot**.
2. Le cas échéant, `buildInheritedPrMessage` / `buildInheritedBranchMessage` —
   l'amorce d'une session froide qui hérite d'une branche déjà avancée (MIN-68) :
   résumé de la session précédente, corps de PR, fil de review, et surtout les
   **fils ancrés à une ligne de code** (`toPrLineThreads`, avec le `diff_hunk`
   tronqué par le haut à 8 lignes — la queue porte la ligne commentée).
3. `readRepoInstructions` — `AGENTS.md` puis `CLAUDE.md`, **à la racine du clone
   uniquement**, cap `REPO_INSTRUCTIONS_MAX_BYTES = 32_000`
   ([execute.ts:346-372](../lib/server/agent/execute.ts#L346-L372)), emballés dans
   `<REPO_INSTRUCTIONS>`.

Puis la demande du lanceur en dernier message.

### 1.3 Sandbox

[lib/server/agent/sandbox.ts](../lib/server/agent/sandbox.ts) — une microVM Vercel
Sandbox par run, nommée `agent-<run.id>` :

- runtime `node24`, `persistent: true`, `resume: true`,
  `SANDBOX_TIMEOUT_MS = 45 min`, `SANDBOX_SNAPSHOT_EXPIRATION_MS = 7 jours`.
  Un run repris réveille sa VM avec son filesystem restauré ; passé l'expiration du
  snapshot, on re-clone (git est le filet durable).
- `REPO_DIR = /vercel/sandbox/repo`, clone `--depth 1` sur la branche de base puis
  bascule sur la branche de travail (`cloneRepo`).
- `runShell(sandbox, command, { cwd = REPO_DIR, timeoutMs, signal, env })` :
  **`sh -c` dans un processus neuf à chaque appel**. Aucune session, aucun état,
  aucun processus de fond.
- Plafonds de lecture : `READ_MAX_LINES = 2000`, `READ_MAX_LINE_CHARS = 2000`,
  `READ_MAX_BYTES = 250_000`, `GLOB_MAX_FILES = 100`.
- `grepRepo` = `git grep --no-color -I -E --untracked` (regex **POSIX étendue**),
  `globRepo` = `git ls-files --cached --others --exclude-standard` : les deux
  gitignore-aware, sans dépendance à installer.
- Sécurité des chemins : `resolveWithin` (rejette toute sortie de `REPO_DIR`) et
  `assertNotGit` (refuse les écritures dans `.git/` — hooks, config)
  ([repo-path.ts](../lib/server/agent/repo-path.ts)). C'est de la
  défense en profondeur : la microVM reste la vraie frontière.

### 1.4 Boucle agentique

[lib/server/agent/agent-loop.ts](../lib/server/agent/agent-loop.ts) —
`runAgentLoop` :

- `MAX_ROUNDS_PER_CHUNK = 60`, suspend au **sommet** de chaque round si la
  soft-deadline du chunk est dépassée (frontière sûre : aucun appel en vol).
- `READ_ONLY_TOOLS` = `read_file, list_dir, glob, grep, read_issue,
  read_attachment` → si **tous** les tool-calls d'un round sont read-only, ils sont
  exécutés en parallèle (`Promise.all`), résultats repoussés dans l'ordre d'origine.
- `pullSteering()` draine les messages utilisateur en attente au sommet de chaque
  round → orientation à chaud, et reprise d'un `ask_user`.
- `emitLive` republie le texte en cours d'écriture ~4×/s (`LIVE_FLUSH_MS = 250`).
- Reprises LLM : `MAX_STREAM_ATTEMPTS = 4`, backoff exponentiel plafonné à
  `MAX_RETRY_WAIT_MS = 30_000`, `Retry-After` honoré, timeout d'inactivité
  `STREAM_IDLE_TIMEOUT_MS = 60_000` réarmé à chaque octet SSE
  ([retry.ts](../lib/server/agent/retry.ts)). Épuisement d'une erreur reprenable →
  **suspend** (reprise sur fonction fraîche), pas échec.
- 400 « contexte trop long » → `dropOldestRound` jusqu'à `MAX_CONTEXT_TRIMS = 4`,
  puis même appel retenté.

### 1.5 Contexte

- **Élagage** ([prune.ts](../lib/server/agent/prune.ts)) : à chaque frontière de
  round, `pruneToolOutputs` remplace les sorties de tools les plus anciennes par
  `PRUNE_STUB`, en protégeant les `PRUNE_PROTECT_BYTES = 40_000` derniers octets, et
  seulement si l'on récupère au moins `PRUNE_MINIMUM_BYTES = 20_000`.
- **Troncature par résultat** : chaque message `role:"tool"` passe par
  `headTail(JSON.stringify(result), 6000)` — début + fin gardés, milieu élidé.
- **Compaction** ([compact.ts](../lib/server/agent/compact.ts)) : au-delà de
  `AGENT_COMPACT_TOKEN_THRESHOLD = 70_000` (ou 75 % de la fenêtre du modèle si
  connue), un sous-appel LLM résume le milieu périmé
  (`SUMMARIZE_INSTRUCTION`, 5 points), en préservant le préfixe de seed verbatim et
  `AGENT_COMPACT_KEEP_RECENT_BYTES = 48_000` de queue. Point de rupture sûr : la
  queue ne commence jamais sur un message `tool`. Plafonné à
  `MAX_COMPACTIONS_PER_CHUNK = 3`, jamais lancé s'il reste moins de
  `AGENT_COMPACT_MIN_BUDGET_MS = 60_000`.
- Le raisonnement streamé est **affiché mais jamais persisté** dans `messages`.

### 1.6 Édition

[lib/server/agent/edit.ts](../lib/server/agent/edit.ts) — cascade de **10
replacers**, du plus strict au plus tolérant : `Simple`, `LineTrimmed`,
`BlockAnchor` (ancres + similarité Levenshtein ≥ 0,65), `WhitespaceNormalized`,
`IndentationFlexible`, `UnicodeNormalized`, `EscapeNormalized`, `TrimmedBoundary`,
`ContextAware`, `MultiOccurrence`. Garde-fous : `isDisproportionateMatch` (refuse un
span bien plus large que `oldString`) et `realignBoundary` (le `\n` de frontière).
L'échec est **bruyant** (throw), jamais une corruption silencieuse. `applyEdit`
renvoie contenu + diff unifié + compteurs ; `execute.ts` renvoie au modèle un diff
capé à `EDIT_DIFF_CAP = 4000`.

### 1.7 Cycle de vie et persistance

[execute.ts](../lib/server/agent/execute.ts) — `executeAgentRun` exécute **un
chunk** :

- Budget : `AGENT_SOFT_DEADLINE_MS = 250_000` moins `COMMIT_MARGIN_MS = 25_000`,
  plancher `MIN_SOFT_DEADLINE_MS = 20_000`. Timeout dur d'un appel modèle :
  `AGENT_RUN_TIMEOUT_MS = 210_000`.
- Garde-fous anti-runaway par tour : `AGENT_MAX_CONTINUATIONS = 20`,
  `MAX_WALL_CLOCK_MS = 60 min`, `MAX_CHECKPOINT_BYTES = 8_000_000`.
- **Le checkpoint EST l'historique** (`AgentCheckpoint.messages`, persisté en base) —
  pas d'`assistant_messages` séparés.
- **Le harness possède git** : `commitAndPush` à chaque fin de tour et à chaque
  suspend (WIP). `remoteUpdated` (le remote a-t-il avancé ?) pilote la réouverture
  d'une PR refusée (`reopenIfRejectedWorkPushed`). La création de PR est une
  décision (`create_pr`), pas un automatisme.
- `changedFiles(from, to)` produit l'event `files_changed` du tour (cap
  `CHANGED_FILES_CAP = 100`).

### 1.8 Ce que le prompt demande mais que le harness n'exécute pas

C'est la frontière la plus intéressante — et c'est exactement là que les deux
références divergent le plus de nous.

| Le prompt dit… | Le harness… |
| --- | --- |
| « Never run `git commit`, `git reset --hard`, `git checkout -- `, `git rebase`, `git push`, force-push, or `--amend` » | …exécute la commande telle quelle. `run_command` n'inspecte jamais ce qu'on lui passe. |
| « Verify. Run the project's linter / type-check / build / tests » | …n'exécute rien de lui-même et ne sait pas si ça a été fait. Aucun signal, aucun event. |
| « Self-review. Run `git diff` and read your change end to end » | …ne vérifie pas que ça a eu lieu. |
| « Read the file first so `old_string` matches » | …n'impose rien : `edit_file` sur un fichier jamais lu passe si la cascade trouve le bloc. |
| « Never print secrets or the git remote URL » | …ne filtre aucune sortie. L'`authUrl` porte un token d'installation. |
| « Stay within this repository » | …**ça, si** : `resolveWithin` + `assertNotGit` sont exécutés (mais seulement sur les tools fichiers, pas sur `run_command`). |

---

## 2. Ce que nos runs disent

Requête sur `agent_run_events` (type `tool_result`), **60 derniers jours** :
1 123 résultats de tools, 2 658 events, 15 runs. *Échantillon petit — les
pourcentages sont indicatifs, les modes d'échec ne le sont pas.*

| Tool | Appels | Échecs | Taux |
| --- | ---: | ---: | ---: |
| `read_file` | 445 | 0 | 0,0 % |
| `grep` | 336 | 3 | 0,9 % |
| **`run_command`** | **224** | **30** | **13,4 %** |
| `glob` | 30 | 0 | 0,0 % |
| `list_dir` | 26 | 0 | 0,0 % |
| `edit_file` | 23 | 1 | 4,3 % |
| **`apply_edits`** | **19** | **8** | **42,1 %** |
| `read_issue` | 6 | 0 | 0,0 % |
| `create_pr` | 5 | 0 | 0,0 % |
| autres (`write_issue_plan`, `write_file`, carnet) | 15 | 0 | 0,0 % |

**Les trois modes d'échec réels.**

1. **`run_command` échoue sur l'environnement, pas sur le code.** Les erreurs les
   plus fréquentes : `sh: line 1: tsc: command not found` (7×, deux versions du
   projet) — le `npm run typecheck` part avant que les dépendances soient
   installées ; `npm error code ERESOLVE` (3×) — l'install elle-même échoue ;
   7 échecs à `exitCode: 1` avec **stdout ET stderr vides** (voir §3.6, la sonde).

2. **`apply_edits` : 42 % « d'échec » est un artefact de reporting.** Le tool
   renvoie `success: applied.every(r => r.ok === true)` : un batch de 6 fichiers
   dont 1 échoue est compté comme un échec total. Sur les 8 cas, la cause dominante
   est `No changes to apply: oldString and newString are identical.` — le modèle
   ré-applique une édition déjà faite. Un cas est un `Unknown tool: apply_edits`
   (checkpoint antérieur au câblage du tool).

3. **`grep` échoue sur la syntaxe POSIX ERE.** Les 3 échecs sont tous la même
   chose : `fatal: -e option, 'onUpdateIssue={': Unmatched \{`. Le modèle cherche
   du JSX littéral, `git grep -E` lit `{` comme un quantificateur. Notre tool
   n'offre pas de mode « chaîne littérale ».

**Ce que le modèle fait pour contourner le harness** (220 `run_command` sur toute
l'histoire du produit) :

| Motif | Occurrences | Ce que ça dit |
| --- | ---: | --- |
| `sed -n` / `nl -ba` (lecture fenêtrée) | 68 (31 %) | Le modèle relit des fichiers **hors** de `read_file`. |
| `grep` / `rg` direct | 35 (16 %) | Il contourne notre tool `grep`. |
| Préfixe `cd …` | 29 (13 %) | Dont `cd /vercel/sandbox/repo && …` — le cwd **par défaut**. Le modèle ne sait pas où il est, faute de `workdir` et de shell persistant. |
| Pipe vers `head`/`tail` | 23 (10 %) | Il borne lui-même la sortie parce qu'il a appris que le harness la coupe. |
| `cat` | 12 | Idem `sed -n`. |
| `2>&1` | 12 | Il craint de perdre `stderr`. |

**Et deux commandes git explicitement interdites par le prompt ont été exécutées** :
`git checkout -- components/app-shell-chrome.tsx` (2026-07-14) et
`cd /vercel/sandbox/repo && git checkout -- package-lock.json && git diff --stat`
(2026-07-15). Le prompt dit « never » ; le harness a obéi au modèle. **C'est un
écart mesuré, pas observé.**

---

## 3. Différences observées, axe par axe

### 3.1 Outils exposés au modèle

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Exploration | `read_file`, `list_dir`, `glob`, `grep` (git grep, POSIX ERE) | Via shell (`rg` recommandé par le prompt) | `read`, `glob`, `grep` (**ripgrep**) |
| Édition | `edit_file` / `apply_edits` / `write_file` / `move_file` / `delete_file` (string replace) | `apply_patch` **freeform à grammaire Lark** ([apply_patch.lark](https://github.com/openai/codex/blob/294d813/codex-rs/core/src/tools/handlers/apply_patch.lark)) — décodage contraint | `edit`+`write` **ou** `apply_patch`, **choisi selon le modèle** : `gpt-*` (hors `oss`/`gpt-4`) → `apply_patch` ([registry.ts](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/registry.ts)) |
| Shell | `run_command { command }` | `exec_command` (PTY, `session_id`), `write_stdin`, `shell_command` | `shell { command, timeout, workdir }` |
| Web | `web_search` (OpenRouter only) | `web.run`, `tool_search` (BM25 sur tools différés) | `websearch`, `webfetch` |
| Délégation | — | `spawn_agent`, `send_input`, `send_message`, `followup_task`, `wait_agent`, `list_agents`, `resume_agent`, `close_agent`, `interrupt_agent` | `task` (sous-agents, avec `task_id` pour reprendre la même session) |
| Multimodal | — | `view_image` (« View a local image file … when visual inspection is needed ») | `read` renvoie images et PDF **en pièces jointes** ([read.txt](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/read.txt)) |
| Introspection du contexte | — | `get_context_remaining` → `{ tokens_left }` ; `new_context` (« Start a new context window ») | — |
| Sémantique du code | — | — | `lsp` (expérimental) : `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `callHierarchy` |
| Réparation d'appel invalide | — | — | tool `invalid` : les args malformés reviennent au modèle en message d'erreur au lieu de casser le round |
| Permissions | — | `request_permissions` : le modèle **demande** plus d'accès fs/réseau en cours de tour | `ctx.ask({ permission, patterns })` sur chaque tool |
| Checklist | `update_plan` | `update_plan` | `todowrite` |
| Questions | `ask_user` (1–4, options, « (Recommended) », `multi_select`) | `request_user_input` (1–3, options `label`+`description`, « (Recommended) », `autoResolutionMs`) | `question` (options, « (Recommended) », `multiple`) |

> **Verdict — écart réel et coûteux sur trois points** : (a) aucune entrée visuelle,
> alors qu'une maquette jointe à un ticket est un cas d'usage *natif de minddy* ;
> (b) le shell est le tool le plus utilisé et le plus pauvre en paramètres ;
> (c) `grep` en POSIX ERE casse sur du JSX, mesurément.
> Sur `ask_user` : **pas d'écart** — le nôtre est au niveau de `request_user_input`.
>
> *Révision du 2026-07-28* : la ligne « la délégation est une feature de CLI
> multi-fenêtres » ne tient pas. Elle décrit la *forme* qu'elle prend chez Codex
> (neuf tools, agents nommés, mailbox) sans regarder ce qu'elle permet. **Écart
> réel, retenu** sous une forme réduite à un seul tool → MIN-112. Sur les
> permissions, en revanche, le verdict tient : voir §3.2.

### 3.2 Sandbox : isolation, filesystem, réseau

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Isolation | microVM Vercel Sandbox par run, `node24`, `persistent: true` | `SandboxPolicy` : `ReadOnly` / `WorkspaceWrite` / `ExternalSandbox` / `DangerFullAccess` ([protocol.rs:995](https://github.com/openai/codex/blob/294d813/codex-rs/protocol/src/protocol.rs#L995)) | Aucune — tourne sur la machine de l'utilisateur, protégé par le système de permissions |
| Périmètre d'écriture | tout `REPO_DIR` ; `resolveWithin` + `assertNotGit` sur les tools fichiers | `WritableRoot` avec `read_only_subpaths` — `.codex`, `.git`, **notamment `.git/hooks`**, refusés *même sous une racine écrivable* | permission par pattern de chemin |
| Réseau | ouvert (le clone/push en dépend) | `network_access` explicite par policy ; approbations réseau dédiées ([network_approval.rs](https://github.com/openai/codex/blob/294d813/codex-rs/core/src/tools/network_approval.rs), 1 141 lignes) | permission |
| Garde-fou sur les commandes | **aucun** — le prompt seul | `exec_policy.rs` (1 154 lignes) : DSL de règles, `is_safe_git_command` (seuls `git status`/`log`/`diff`/`show`/`branch` à arguments lecture seule sont sûrs — **`git fetch` non**), `dangerous_command_match` (`ForcedRm`…), `BANNED_PREFIX_SUGGESTIONS` | `ctx.ask` avant chaque `shell`, analyse tree-sitter des chemins touchés |
| Approbations | — | `with_cached_approval` + `ApprovedForSession` | `always`/`patterns` par permission |

> **Verdict — écart réel, partiellement hors de notre modèle produit.** Notre
> isolation (microVM jetable, une par run) est *structurellement plus forte* que
> celle de Codex en local et sans commune mesure avec OpenCode : nous n'avons rien à
> protéger d'un `rm -rf`. Mais l'absence totale de garde-fou **exécuté** sur les
> commandes git est un écart réel *et mesuré* (§2) : ce que le harness protège n'est
> pas la machine, c'est **le travail de l'utilisateur sur la branche**. Le système
> d'approbations interactives, lui, n'a aucun sens chez nous (l'agent tourne dans le
> cloud, personne ne regarde) — c'est le contre-exemple parfait d'une feature de CLI.

### 3.3 Cycle de feedback : plan → implémentation → vérification

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Plan de session | `update_plan` + miroir vers le plan du ticket (`syncPlan`) | `update_plan` avec **exemples de bons et de mauvais plans** dans le prompt ([default.md:72-121](https://github.com/openai/codex/blob/294d813/codex-rs/protocol/src/prompts/base_instructions/default.md)) | `todowrite` ; mode `plan` **lecture seule** avec fichier de plan sur disque, et `plan-enter`/`plan-exit` |
| Retour après édition | diff unifié (cap 4 000 car.) | rien (« Do not waste tokens by re-reading files after `apply_patch`. The tool call will fail if it didn't work. ») | diff **+ diagnostics LSP du fichier réinjectés** : `LSP errors detected in this file, please fix:` ([edit.ts:201](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/edit.ts#L201), idem `write.ts`, `apply_patch.ts`) |
| Doctrine de vérification | 5 lignes de prompt (« Verify », « Self-review ») | une section entière « Validating your work » : commencer par le test le plus spécifique puis élargir, **ne pas ajouter de tests à un dépôt qui n'en a pas**, formatage : 3 itérations max puis on rend la main, comportement proactif **conditionné au mode d'approbation** | prompt du tool `shell` |
| Bascule de mode | — | modes de collaboration (`ModeKind`) qui pilotent la disponibilité des tools | agents `plan` / `build`, avec **rappels synthétiques injectés à la bascule** ([reminders.ts](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/session/reminders.ts)) |

> **Verdict — écart réel et coûteux sur un point : le retour après édition.**
> OpenCode referme la boucle *dans le tool lui-même* : tu édites, tu reçois les
> erreurs de typage. Chez nous il faut un `run_command` de plus, que le modèle ne
> fait pas toujours, et dont la sortie est massacrée (§3.6). Le reste (modes,
> plan-mode lecture seule) est de l'ergonomie de CLI — et notre miroir
> `update_plan` → plan du ticket n'a d'équivalent nulle part : **c'est nous qui
> sommes devant**.

### 3.4 Persistance entre les tours

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Historique | `AgentCheckpoint.messages` en base ; cap `MAX_CHECKPOINT_BYTES = 8 Mo` | `context_manager/history.rs` + `normalize.rs` | messages/parts en base, `message-v2.ts` |
| État du workspace | **snapshot persistant de la microVM** (7 j) + branche git poussée à chaque tour | filesystem de l'utilisateur (il ne bouge pas) | idem |
| Session froide qui hérite | `buildInheritedPrMessage` : résumé de la session précédente + PR + fil de review + **fils ancrés ligne à ligne** | — | — |
| Retour arrière | — | — | `revert.ts` : retour à un message donné via snapshots, `unrevert` |
| Élagage | `pruneToolOutputs` (protège 40 Ko, seuil 20 Ko) | `normalize.rs` | `truncate` au moment de l'appel |
| Compaction | sous-appel LLM, seuil 70 k tokens ou 75 % de la fenêtre, garde 48 Ko de queue | trois voies : locale (`compact.rs`), **distante** (`compact_remote_v2.rs`, 864 lignes), et **budget de tokens** → *nouvelle fenêtre de contexte sans résumé* (`compact_token_budget.rs`) | `overflow.ts` : `COMPACTION_BUFFER = 20_000` réservés, déclenche quand `tokens >= model.limit.input - reserved` |
| Le modèle sait-il où il en est ? | **non** — on compacte dans son dos | **oui** : `get_context_remaining`, et il peut demander `new_context` lui-même | non |

> **Verdict — pas d'écart sur la persistance, écart réel sur le contexte.** Notre
> persistance est la plus ambitieuse des trois, parce que c'est la seule qui doit
> survivre à une fonction serverless qui meurt : snapshot + branche git +
> checkpoint. Le `revert` d'OpenCode est une feature d'éditeur interactif ; chez
> nous git le fait déjà.
>
> *Révision du 2026-07-28* : j'écrivais « notre compaction règle le problème ». Elle
> le réglerait — **elle n'a jamais tourné**. Zéro event de phase `compacted` ou
> `context_trim` depuis la mise en service, parce que le seuil vaut 75 % de la
> fenêtre du modèle et que les modèles utilisés ont des fenêtres de 1 000 000 à
> 1 050 000 tokens : seuil effectif ~787 000, contre ~140 000 tokens pour notre plus
> gros checkpoint (558 Ko, 569 messages). Deux conséquences : le seuil est calibré
> sur la mauvaise variable — avec une fenêtre de 1 M, ce qui plafonne une session
> longue est le **coût par round**, pas la fenêtre — et un filet jamais tendu est un
> filet troué jusqu'à preuve du contraire. → MIN-113.

### 3.5 Self-correction et réessai

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Réessai réseau/LLM | 4 tentatives, backoff exponentiel, `Retry-After`, timeout d'inactivité 60 s, puis **suspend** au lieu d'échouer | — | `RETRY_INITIAL_DELAY = 2000`, facteur 2, plafond 30 s sans en-tête, `retry-after` et `retry-after-ms` honorés |
| Contexte trop long (400) | `dropOldestRound` × 4 puis retente | compaction | compaction |
| Édition ratée | cascade de **10 replacers**, échec bruyant | grammaire Lark : le modèle **ne peut pas** produire un patch mal formé | cascade de **9 replacers** (les nôtres + un de moins : pas de `UnicodeNormalizedReplacer`) |
| Appel de tool malformé | le round casse ou l'arg devient `""` (`safeParse` renvoie `{}`) | validation de schéma | **tool `invalid`** : l'erreur de validation revient au modèle comme sortie de tool, le round continue |
| Après une édition | rien | rien | **diagnostics LSP** |

> **Verdict — un écart réel (`invalid`), un point où nous sommes devant.**
> Notre cascade d'édition est *strictement supérieure* à celle d'OpenCode dont elle
> est dérivée (on a ajouté `UnicodeNormalizedReplacer` — les modèles émettent des
> tirets cadratins et des guillemets courbes là où le fichier a de l'ASCII). Le tool
> `invalid` d'OpenCode, lui, comble un trou réel : `safeParse` avale silencieusement
> un JSON d'arguments malformé et exécute le tool avec `{}`.

### 3.6 Gros fichiers et navigation

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Lecture | 2 000 lignes par défaut, `offset`/`limit`, **pied de page explicite** : « Showing lines X-Y of Z. Use offset/limit to read more. » | via shell | 2 000 lignes, `offset`/`limit`, lignes > 2 000 car. tronquées |
| Sortie de commande | `cap(stdout, 4000)` + `cap(stderr, 2000)` — **troncature par la TÊTE, la queue est perdue** ([execute.ts:326-338](../lib/server/agent/execute.ts#L326-L338)) puis `headTail(…, 6000)` | budget en **tokens** (`max_output_tokens`, défaut 10 000, plafond 1 MiB / ~256 k tokens), paramétrable **par appel** | 2 000 lignes / 50 KiB (configurable), et **au-delà : la sortie complète est écrite sur disque**, le modèle reçoit un aperçu + « Full output saved to: `<file>` — Use Grep to search the full content or Read with offset/limit » ([truncate.ts:129-137](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/truncate.ts#L129-L137)) |
| Consigne au modèle | — | — | « Do NOT use `head`, `tail`, or other truncation commands to limit output; the full output will already be captured to a file » |
| Sortie élaguée du contexte | `PRUNE_STUB` : « Re-read the file or re-run the search if you still need it. » | — | fichier sur disque, toujours relisible |

> **Verdict — écart réel, coûteux, et le plus grave du document.**
>
> **Sonde déterministe.** J'ai fait passer une sortie type de `npm test` en échec
> (407 lignes : 400 lignes de coches vertes, puis le récapitulatif — nom du test
> raté, assertion, `Test Files 1 failed`) dans la chaîne de troncature réelle
> (`cap(4000)` de [execute.ts](../lib/server/agent/execute.ts) puis
> `headTail(6000)` de [agent-loop.ts](../lib/server/agent/agent-loop.ts)) :
>
> ```
> stdout brut : 16 595 caractères, 407 lignes
> après cap(4000)          : le verdict final est-il présent ?  NON
>                            le nom du test en échec ?          NON
> après headTail(6000)     : verdict final présent ?            NON
> dernières lignes vues par le modèle :
>    ✓ lib/foo/bar-97.test.ts (7 tests) 10ms
>    ✓ lib/foo/bar-98.test.ts (7 tests) 11ms
>    ✓ lib/foo/bar-99.test.ts (7… [truncated]","stderr":""}
> ```
>
> **Le modèle voit cent tests verts et `exitCode: 1`, sans savoir ce qui a cassé.**
> `headTail` existe précisément pour garder la queue — mais `cap()` l'a déjà détruite
> en amont. Ce n'est pas une hypothèse : c'est le chemin de code exécuté à chaque
> `run_command`. Et ça explique directement les 23 pipes vers `head`/`tail` et les
> 12 `2>&1` de la §2 : le modèle a appris à se défendre du harness.

### 3.7 Tests et vérification

| | minddy | Codex | OpenCode |
| --- | --- | --- | --- |
| Doctrine | 1 ligne : « run the project's linter / type-check / build / tests » | section « Validating your work » : du plus spécifique au plus large, **jamais de tests dans un dépôt sans tests**, 3 itérations max sur le formatage, proactivité conditionnée au mode d'approbation | prompt du tool `shell` |
| Où le projet déclare ses commandes | `AGENTS.md`/`CLAUDE.md` **à la racine du clone seulement**, 32 000 octets | `AGENTS.md` **hiérarchique** : de la racine du projet jusqu'au cwd, concaténés dans cet ordre, `AGENTS.override.md` local, `project_doc_max_bytes` = **32 KiB** ([config/mod.rs:206](https://github.com/openai/codex/blob/294d813/codex-rs/core/src/config/mod.rs#L206)) | `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` (déprécié), + globaux `~/.config/opencode/AGENTS.md` et `~/.claude/CLAUDE.md` ; « the first project-level match wins so we don't stack from every ancestor » |
| Environnement prêt ? | non — l'agent découvre que `node_modules` est vide | l'environnement est celui de l'utilisateur | idem |
| Signal de vérification | aucun event, aucune trace | — | — |

> **Verdict — écart réel et coûteux, mais pas là où on l'attendait.** Notre cap de
> 32 Ko est déjà aligné sur Codex (le commentaire d'`execute.ts` le dit). La
> hiérarchie d'`AGENTS.md` est un raffinement de monorepo dont nous n'avons pas
> besoin. **Le vrai écart est en amont** : chez Codex et OpenCode, le dépôt est déjà
> installé — chez nous, une microVM fraîche a un `node_modules` vide, et
> `tsc: command not found` est notre erreur la plus fréquente (§2). Ce n'est pas un
> écart de harness au sens strict, c'est le prix de notre modèle d'exécution.

---

## 4. Opportunités priorisées

| # | Opportunité | Impact | Coût | Surface produit | Fichiers |
| --- | --- | --- | --- | --- | --- |
| **1** | **Garder la QUEUE des sorties de commande** (`headTail` au lieu de `cap`) | Très fort — sans ça, l'agent ne peut pas lire un test qui échoue | Trivial (2 lignes) | Nulle | [execute.ts:326-338](../lib/server/agent/execute.ts#L326-L338) |
| **2** | **Sortie longue déposée dans la sandbox et relisible** (modèle OpenCode) | Fort — supprime la perte d'information *et* les contournements `head`/`tail` | Moyen | Nulle (le tool ne change pas de signature) | `execute.ts`, `sandbox.ts` |
| **3** | **Garde-fou exécuté sur les commandes git destructrices** | Fort — protège le travail de l'utilisateur ; écart **mesuré** (2 occurrences) | Faible | Nulle | nouveau `lib/server/agent/command-guard.ts`, branché dans `makeExecTool` |
| **4** | **Diagnostics de type réinjectés après édition** | Fort — referme la boucle édition→erreur dans le tool | Moyen-fort (il faut un type-checker dans la VM) | Nulle | `execute.ts` (`edit_file`, `apply_edits`, `write_file`) |
| **5** | **`workdir` et `timeout_ms` sur `run_command`** | Moyen — 13 % des commandes préfixent un `cd` inutile | Trivial | Nulle (paramètres optionnels) | `tools.ts`, `execute.ts` |
| **6** | **Mode littéral sur `grep` (`fixed_strings`)** | Moyen — 3 échecs mesurés, tous du JSX | Trivial | Nulle | `tools.ts`, `sandbox.ts` (`-F` au lieu de `-E`) |
| **7** | **Entrée visuelle : les images des pièces jointes vues par le modèle** | Moyen-fort sur *notre* cas d'usage (maquette jointe à un ticket) | Fort (l'historique passe en `content: Array<Part>`) | Faible | `agent-loop.ts`, `issue-tools.ts`, `prompt.ts`, `compact.ts` |
| **8** | **`success` honnête sur `apply_edits`** (succès partiel ≠ échec) | Faible en fonctionnel, fort en lisibilité des métriques | Trivial | Nulle | `execute.ts:324` |
| **9** | **Tool `invalid` : réparer un appel malformé au lieu de le subir** | Faible (non mesuré chez nous) | Faible | Nulle | `agent-loop.ts` (`safeParse`) |
| **10** | **`apply_patch` servi aux modèles `gpt-*`** (10 runs / 15) | Moyen — le format sur lequel ces modèles sont entraînés | Moyen | Nulle (le tool remplace `edit_file`/`write_file` selon le modèle) | `tools.ts`, nouveau `patch.ts`, `execute.ts` |
| **11** | **Sous-agents, hiérarchie à un niveau** | Fort en capacité, nul en fiabilité | Fort | **Réelle** — c'est la seule ligne du tableau qui ajoute une notion produit | `tools.ts`, `agent-loop.ts`, nouveau `subagent.ts` |
| **12** | **Commandes en arrière-plan** (serveur de dev, poll, stop) | Fort — l'agent peut enfin voir tourner ce qu'il écrit | Moyen | Faible (3 tools, ou 1 tool à 3 actions) | `tools.ts`, `sandbox.ts`, `execute.ts` |
| **13** | **Gestion du contexte : la calibrer, la tester, la signaler au modèle** | Fort — aujourd'hui c'est du code jamais exécuté | Moyen | Nulle | `agent-loop.ts`, `compact.ts`, `lib/agent-models.ts` |
| **14** | **`AGENTS.md` / `CLAUDE.md` des sous-dossiers touchés** | Faible-moyen | Faible | Nulle | `execute.ts` (`readRepoInstructions`) |

### Non retenu, et pourquoi

**Un seul** écart réel que nous décidons de ne pas combler :

- **Système d'approbations interactives** (Codex `request_permissions`,
  OpenCode `ctx.ask`). L'agent tourne dans le cloud, souvent pendant que
  l'utilisateur fait autre chose. Une approbation qui bloque est une session morte.
  Et l'isolation rend la question théorique : la microVM est jetable, l'agent peut
  y faire à peu près ce qu'il veut sans conséquence. `ask_user` couvre déjà le seul
  cas qui compte — une *décision produit* qui bloque. **Décision confirmée après
  revue.**

Et **une variante** écartée au profit d'une autre forme (voir §5, R12) :

- **`get_context_remaining` comme tool que le modèle interroge.** Faire dépenser un
  tour au modèle pour demander son budget restant est un mauvais échange quand le
  harness, lui, connaît déjà le chiffre à chaque round (`lastPromptTokens`). On
  garde l'idée — que le modèle SACHE où il en est — mais en la lui **poussant** au
  moment utile plutôt qu'en la lui faisant tirer.

> ### Révision du 2026-07-28 — six écarts réintégrés
>
> La première version de ce document en écartait sept. La revue en a récupéré six,
> dont **deux sur une erreur d'analyse de ma part** et **quatre sur une décision
> produit assumée** (« minddy doit pouvoir faire n'importe quel travail, pas
> seulement du travail sobre »). Quatre chiffres, mesurés après coup, ont tranché :
>
> | Mesure | Valeur | Ce que ça invalide |
> | --- | --- | --- |
> | Modèle dominant des runs | **`openai/gpt-5.6-luna` : 10 runs / 15** | « notre défaut est DeepSeek, `apply_patch` ne sert à rien » |
> | Forme du tool `apply_patch` d'OpenCode | **tool normal, un paramètre `patchText: string`** — aucune grammaire, aucun support provider | « le format patch n'est pas portable » |
> | Fenêtres de contexte des modèles utilisés | **1 050 000 / 1 048 576 / 1 000 000 tokens** → seuil de compaction à ~787 000 | « notre compaction couvre les sessions longues » |
> | Events `status` de phase `compacted` / `context_trim` | **0, depuis toujours** | idem — la machinerie n'a **jamais tourné** |
>
> **Ce que je m'étais trompé.**
>
> - **`apply_patch`.** J'avais raison sur Codex (grammaire Lark = décodage contraint,
>   non portable via OpenRouter) et j'en ai tiré une conclusion fausse sur le
>   *format*. OpenCode implémente le même format comme un **tool ordinaire à un
>   paramètre string** ([apply_patch.ts:18-20](https://github.com/anomalyco/opencode/blob/40e4d73/packages/opencode/src/tool/apply_patch.ts#L18-L20))
>   — zéro dépendance provider. Et il ne le sert qu'aux modèles `gpt-*`, qui sont
>   précisément 10 de nos 15 runs. → **retenu, R8.**
> - **La gestion du contexte.** J'ai écrit « pas d'écart pénalisant » parce que la
>   machinerie existe. Elle existe, mais **elle n'a jamais été exercée une seule
>   fois en production** : avec des fenêtres à 1 M tokens, le seuil à 75 % est à
>   787 k, et notre plus gros checkpoint fait ~140 k tokens. Du code de secours
>   jamais exécuté est du code cassé jusqu'à preuve du contraire, et le vrai plafond
>   n'est pas la fenêtre — c'est le **coût par round** (on renvoie 140 k tokens à
>   chaque appel) et `MAX_CHECKPOINT_BYTES`. → **retenu, R12.**
>
> **Ce qui relève d'une décision produit, pas d'une erreur d'analyse.**
>
> - **Sous-agents.** Mon argument (coût, opacité, surface de prompt) reste vrai ;
>   il est simplement subordonné à un choix : déléguer est un mode de travail
>   normal en 2026, et un harness qui ne sait pas le faire plafonne. **Hiérarchie
>   à un seul niveau** — un sous-agent ne peut pas en lancer d'autres. → **R9.**
> - **Commandes en arrière-plan.** J'avais rejeté le shell à sessions de Codex, et
>   ça reste juste : une session PTY ne survivrait pas à notre suspend/resume. Mais
>   je m'étais arrêté à la mécanique au lieu de regarder la capacité qu'elle porte —
>   **lancer un serveur de dev et vérifier que l'application tourne vraiment**.
>   Aujourd'hui `run_command` bloque jusqu'à 180 s puis tue le processus : notre
>   agent ne peut pas voir son propre travail fonctionner. → **R10** (start / poll /
>   stop, pas de PTY).
> - **Hiérarchie d'`AGENTS.md`.** « Raffinement de monorepo » était exact et
>   insuffisant : c'est surtout très bon marché, et un dépôt sur deux met un
>   `CLAUDE.md` dans un sous-dossier. → **R11.**
> - **Tool `lsp`.** Maintenu hors périmètre **immédiat**, mais plus par principe :
>   il devient une suite naturelle de R4 (MIN-110). Si la mesure montre qu'un
>   serveur de langage peut vivre dans la microVM, « trouver toutes les références »
>   — que `grep` approxime mal — suit presque gratuitement. **Conditionné à la
>   mesure de MIN-110**, pas refusé.

---

## 5. Recommandations concrètes

### R1 — Garder la queue des sorties de commande *(rang 1)*

**Quoi.** Dans [execute.ts](../lib/server/agent/execute.ts), case `run_command` :
remplacer `cap(r.stdout, 4000)` / `cap(r.stderr, 2000)` par `headTail(...)`, déjà
exporté par [prune.ts](../lib/server/agent/prune.ts).

**Risque.** Aucun : `headTail` retourne la chaîne telle quelle sous le seuil, donc
aucun comportement ne change sur les sorties courtes.

**Mesurable.** Rejouer la sonde du §3.6 en test (`execute.test.ts`) : le verdict
final doit être présent. En production, le taux d'échec de `run_command` suivi de
`run_command` immédiatement retenté avec `| tail` doit tomber à zéro.

### R2 — Sortie longue déposée dans la sandbox *(rang 1)*

**Quoi.** Au-delà du seuil, écrire la sortie complète dans
`/vercel/sandbox/tool-output/<runId>-<seq>.log` (hors `REPO_DIR`, donc jamais
commitée) et renvoyer au modèle l'aperçu + le chemin, avec la consigne d'OpenCode :
« Use `grep` to search the full content or `read_file` with offset/limit ». Il faut
donc autoriser `read_file`/`grep` sur ce chemin précis (une exception nommée dans
`resolveWithin`, pas une ouverture générale).

**Où.** `makeExecTool` (`run_command`) dans `execute.ts` ; helper d'écriture dans
`sandbox.ts` ; paragraphe dans `buildAgentSystemPrompt` disant explicitement de **ne
pas** piper vers `head`/`tail`.

**Risque.** Le fichier doit rester hors du dépôt (sinon il part au commit) et être
nettoyé avec la VM. Le snapshot persistant les garde 7 jours — acceptable.

**Mesurable.** La part de `run_command` contenant `| head`/`| tail` (10 % aujourd'hui,
§2) doit tendre vers zéro.

### R3 — Garde-fou exécuté sur les commandes destructrices *(rang 1)*

**Quoi.** Un module pur `lib/server/agent/command-guard.ts`, testable comme
`repo-path.ts` : `checkCommand(command: string): { allowed: boolean; reason?: string }`.
Refuse — **en renvoyant une erreur de tool au modèle, pas en cassant le round** —
`git commit`, `git push`, `git reset --hard`, `git checkout --`, `git rebase`,
`git cherry-pick`, `--amend`, `--force`/`-f` sur un push. Le message d'erreur doit
expliquer *pourquoi* (« the harness owns git : it commits and pushes at the end of
each turn ») pour que le modèle s'adapte plutôt qu'insiste.

**Où.** Branché en tête du case `run_command` de `makeExecTool`. Le prompt garde son
paragraphe : la règle est la même, elle devient simplement vraie.

**Risque.** Un faux positif bloquerait une commande légitime. D'où : liste **fermée
et courte** de motifs, jamais une heuristique. Ne pas viser `git add` (inoffensif) ni
le git en lecture. Codex fait le même choix avec `is_known_safe_command` : `git
status`/`log`/`diff`/`show` sûrs, le reste au cas par cas.

**Mesurable.** Un event `tool_result` avec `success: false` et
`reason: "forbidden_command"` par tentative → la requête de §2 devient un compteur
de suivi, et une valeur non nulle signale un modèle qui se bat contre le harness.

### R4 — Diagnostics de type après édition *(rang 2)*

**Quoi.** Après un `edit_file` / `apply_edits` / `write_file` réussi, si le dépôt a
un type-checker déclaré (`package.json` → `scripts.typecheck`, ou `tsconfig.json`
présent), lancer une vérification **ciblée sur le fichier édité** et ajouter au
résultat du tool un bloc `Type errors detected in this file, please fix:` — la
formulation exacte d'OpenCode, dont on sait qu'elle fonctionne.

**Risque — le vrai sujet.** Un `tsc --noEmit` complet coûte des dizaines de secondes
et mangerait la soft-deadline. Ce ticket doit donc **commencer par mesurer** le coût
sur un dépôt réel avant de décider : soit un serveur `tsc --watch` maintenu vivant
dans la VM, soit une vérification différée (un seul type-check en fin de tour plutôt
qu'un par édition), soit l'abandon. **Ne pas implémenter avant d'avoir ce chiffre.**

**Mesurable.** Nombre de tours qui se terminent avec des erreurs de typage
introduites par l'agent — aujourd'hui inconnu, ce qui est déjà un problème.

### R5 — `workdir` et `timeout_ms` sur `run_command` *(rang 2)*

**Quoi.** Deux paramètres optionnels sur `run_command` dans `tools.ts`, passés à
`runShell` (qui les accepte déjà : `opts.cwd`, `opts.timeoutMs`). Description du
tool reprenant la formule d'OpenCode : « AVOID using `cd <dir> && <cmd>` ; use the
`workdir` parameter instead ». Borner `timeout_ms` par `RUN_COMMAND_TIMEOUT_MS`.

**Risque.** `workdir` doit passer par `resolveWithin` — sinon on vient de rouvrir la
sortie du dépôt qu'on ferme partout ailleurs.

**Mesurable.** Part des `run_command` contenant un `cd` (13 % aujourd'hui).

### R6 — Mode littéral sur `grep` *(rang 2)*

**Quoi.** Paramètre `fixed_strings?: boolean` → `git grep -F` au lieu de `-E`
(`grepRepo` dans `sandbox.ts`). Et surtout : quand `git grep` échoue avec
`Unmatched \{` ou `Unmatched \(`, **retenter automatiquement en `-F`** et le dire
dans le résultat (« pattern retried as a literal string ») — le modèle cherche du
JSX, pas une regex.

**Mesurable.** Le taux d'échec de `grep` (0,9 % aujourd'hui) doit tomber à zéro sur
les erreurs `Unmatched`.

### R7 — Entrée visuelle *(rang 2 depuis le 2026-07-28, à cadrer séparément)*

**Quoi.** `AgentChatMessage.content` doit accepter `Array<{type:"text"|"image_url"}>`
et `read_attachment` renvoyer l'image en partie image quand le modèle du run est
multimodal. Touche `agent-loop.ts` (sérialisation), `compact.ts` (`messageBytes`,
`serializeForSummary`), `prune.ts` (l'élagage ne doit pas manger une image encore
utile), `caching.ts`.

**Pourquoi c'est différent chez nous.** Codex et OpenCode donnent au modèle une image
*du disque*. Chez nous, l'image est **une pièce jointe du ticket** — une maquette que
quelqu'un a déposée en écrivant l'issue. C'est le seul point de ce document où le
besoin est *plus* fort que chez les références, pas moins.

**Risque.** Coût par tour et un checkpoint qui grossit. **La compatibilité, elle,
n'est plus un risque** : les `input_modalities` de l'index OpenRouter donnent
`["file","image","text"]` pour `openai/gpt-5.6-luna` et
`["text","image","file"]` pour `anthropic/claude-sonnet-5` — soit **11 de nos 15
runs**. Seul `deepseek/deepseek-v4-flash` est `["text"]`. Ça monte le rang de R7 :
la capacité manque à la grande majorité des sessions réelles.

### R8 — `apply_patch` pour les modèles `gpt-*` *(rang 2)*

**Quoi.** Un tool `apply_patch` à un seul paramètre `patch: string`, au format
`*** Begin Patch` / `*** Update File:` / `@@` / `+-` — celui de Codex et
d'OpenCode. Servi **à la place** d'`edit_file`/`write_file` quand le modèle du run
est un `gpt-*` (la règle exacte d'OpenCode : `includes("gpt-") && !includes("oss")
&& !includes("gpt-4")`), sinon rien ne change.

**Pourquoi maintenant.** 10 de nos 15 runs tournent sur `openai/gpt-5.6-luna`.
C'est le format sur lequel cette famille est entraînée, et il porte du **contexte**
(`@@ def greet():`) là où `old_string` porte une chaîne exacte — donc il tolère
mieux une lecture approximative du fichier.

**Ce que ça n'apporte PAS.** De la fiabilité de matching : `edit_file` est à 4,3 %
d'échec et l'unique cas est une édition idempotente. Ne pas vendre ce ticket comme
un correctif de bug — c'est une adaptation au modèle, à valider par comparaison.

**Risque.** Deux moteurs d'édition à maintenir. D'où : le parseur de patch produit
des `{oldString, newString}` qu'on fait passer par la **cascade existante**
d'[edit.ts](../lib/server/agent/edit.ts), au lieu d'écrire un second applicateur.

**Mesurable.** Taux d'échec d'`apply_patch` vs `edit_file` sur les runs `gpt-*`, et
nombre d'éditions par tour (le format groupe plusieurs hunks).

### R9 — Sous-agents, hiérarchie à un niveau *(rang 2)*

**Quoi.** Un tool `spawn_agent { task, mode }` qui lance une session fille dans
**la même sandbox**, avec son propre historique, et renvoie au parent un rapport
texte. Deux modes : `explore` (jeu de tools en lecture seule) et `implement` (jeu
complet). Le sous-agent **n'a pas** `spawn_agent` : la hiérarchie s'arrête à un
niveau, par construction et non par consigne.

**Les trois contraintes qui décident du design.**

1. **La sandbox est partagée**, contrairement à Codex et OpenCode où chaque agent
   voit le même disque parce que c'est le disque de l'utilisateur. Chez nous deux
   sous-agents qui écrivent en parallèle se marchent dessus dans un dépôt git dont
   le harness fait `git add -A` en fin de tour. Règle : **les `explore` peuvent
   être parallèles, les `implement` sont sérialisés** — un seul écrivain à la fois.
2. **Le budget se compte par `ai_usage.user_id`.** Chaque appel d'un sous-agent
   doit passer par `recordAiUsage` avec le `user_id` et le `run_id` du parent,
   dans une bande de `seq` dédiée (comme `WEB_SEARCH_SEQ_BASE` et
   `SANDBOX_USAGE_SEQ_BASE`). Sinon la délégation devient un trou de facturation.
3. **La soft-deadline est celle du parent.** Un sous-agent reçoit une fraction du
   budget restant du chunk et rend la main avant, sinon un `spawn_agent` peut faire
   rater le commit de fin de tour.

**Risque principal — l'opacité.** Un agent qui délègue devient illisible dans le
fil. Il faut donc que le sous-agent émette ses events sur le même `run_id`, avec un
marqueur de parenté, et que le fil les rende repliés sous l'appel.

**Mesurable.** Part des tours qui délèguent, coût moyen d'un tour avec vs sans
délégation, et surtout : le rapport du sous-agent a-t-il servi (le parent le
cite-t-il dans sa réponse) ?

### R10 — Commandes en arrière-plan *(rang 2)*

**Quoi.** `run_command` avec `background: true` renvoie un `job_id` au lieu
d'attendre ; `check_command { job_id }` renvoie la sortie accumulée depuis le
dernier appel et l'état (`running` / `exited`) ; `stop_command { job_id }` tue le
processus. Tous les jobs sont tués en fin de tour.

**La capacité que ça débloque.** Lancer `npm run dev`, attendre qu'il écoute, puis
`curl localhost:3000` — **voir tourner ce qu'on vient d'écrire**. Aujourd'hui
impossible : `run_command` bloque jusqu'à `RUN_COMMAND_TIMEOUT_MS` (180 s) puis tue.
C'est le manque qui empêche l'agent de vérifier autre chose que des tests unitaires.

**Ce qu'on ne fait PAS.** Pas de PTY, pas de `write_stdin`, pas de session shell qui
survit au tour. Une session interactive ne survivrait ni au suspend/resume ni à
l'arrêt de la microVM par le reaper — et l'interactivité n'est utile qu'à un humain
devant un terminal.

**Risque.** Un processus oublié qui consomme la microVM. D'où : plafond de jobs
simultanés (3), kill inconditionnel en fin de tour, et sortie accumulée sur disque
via le mécanisme de R2.

### R11 — Instructions des sous-dossiers touchés *(rang 3)*

**Quoi.** `readRepoInstructions` lit aujourd'hui `AGENTS.md` et `CLAUDE.md` **à la
racine du clone**. Y ajouter, à la première édition dans un sous-dossier, les
`AGENTS.md`/`CLAUDE.md` rencontrés entre la racine et ce fichier — la règle de
Codex, mais **paresseuse** : on ne charge que ce que l'agent touche, au lieu de
concaténer tout l'arbre à l'amorce.

**Pourquoi paresseux.** Le cap global reste 32 Ko. Charger tout l'arbre d'un
monorepo à l'amorce le remplirait de conventions de paquets que l'agent ne touchera
jamais, au détriment de celles de la racine.

### R12 — Gestion du contexte : calibrer, tester, signaler *(rang 2)*

**Le vrai problème, mesuré.** La compaction n'a **jamais tourné** : zéro event
`status` de phase `compacted` ou `context_trim` depuis la mise en service. Cause :
`compactThreshold = contextWindow * 0.75`, et les modèles utilisés ont des fenêtres
de 1 000 000 à 1 050 000 tokens → seuil à ~787 000, quand notre plus gros checkpoint
pèse ~140 000 tokens (558 Ko de JSON, 569 messages).

**Trois conséquences, trois gestes.**

1. **Le seuil est calibré sur la mauvaise variable.** Avec une fenêtre de 1 M, ce
   qui plafonne une session longue n'est pas la fenêtre — c'est le **coût par
   round** (on renvoie tout l'historique à chaque appel) et `MAX_CHECKPOINT_BYTES`.
   → borner le seuil par un plafond absolu en plus du ratio :
   `min(contextWindow * 0.75, plafond_coût)` dans
   [agent-loop.ts](../lib/server/agent/agent-loop.ts).
2. **Du code de secours jamais exécuté est du code cassé jusqu'à preuve du
   contraire.** `planCompaction`, `dropOldestRound` et `pruneToolOutputs` ont des
   tests unitaires, mais le chemin complet (sous-appel de résumé, reconstruction de
   l'historique, round suivant qui repart dessus) n'a jamais tourné pour de vrai.
   → un test d'intégration qui force le seuil à 5 000 tokens et fait tourner une
   vraie session.
3. **Le modèle ne sait pas qu'on l'a compacté.** Il reçoit un message `user`
   préfixé `COMPACT_SUMMARY_PREFIX` au milieu de son propre raisonnement. Plutôt
   qu'un tool `get_context_remaining` qu'il devrait penser à appeler, **lui pousser
   l'information au moment utile** : quand `lastPromptTokens` dépasse ~70 % du
   seuil, injecter une ligne « you are approaching the context limit — wrap up the
   current step and reply » avant l'appel. Il conclut proprement au lieu d'être
   coupé.

**Mesurable.** Les events de phase `compacted` doivent devenir non nuls après
recalibrage — et si `compacted` monte sans que la qualité tombe, le seuil est bon.

---

## 6. Tickets de suite

Créés depuis ce document, liés à MIN-101 :

| Ticket | Rang | Recommandation |
| --- | --- | --- |
| **MIN-107** — *Ne plus perdre la fin des sorties de `run_command`* | 1 | R1 + R2 — la queue des sorties de commande, et la sortie longue relisible |
| **MIN-108** — *Faire exécuter par le harness les interdits git qu'il se contente de dire* | 1 | R3 — garde-fou exécuté sur les commandes destructrices |
| **MIN-109** — *Trois frictions mesurées sur les tools* | 2 | R5 + R6 + R8 — `workdir`/`timeout_ms`, `grep` littéral, `success` honnête sur `apply_edits` |
| **MIN-110** — *Renvoyer les erreurs de typage juste après l'édition* | 2 | R4 — diagnostics après édition (**commence par mesurer le coût**, et l'abandon est une issue valable) |
| **MIN-111** — *Que l'agent VOIE les maquettes jointes aux tickets* | 2 | R7 — entrée visuelle (**remonté** : 11 runs / 15 tournent sur un modèle qui accepte les images) |

Créés à la revue du 2026-07-28, avec les six écarts réintégrés :

| Ticket | Rang | Recommandation |
| --- | --- | --- |
| **MIN-112** — *Sous-agents, un seul niveau* | 2 | R9 — délégation, `explore` parallèles / `implement` sérialisés, facturation au owner |
| **MIN-113** — *La compaction n'a jamais tourné* | 2 | R12 — recalibrer le seuil sur le coût, exercer le chemin complet, prévenir le modèle |
| **MIN-114** — *Commandes en arrière-plan* | 2 | R10 — lancer un serveur de dev et voir tourner son travail (bloqué par MIN-107) |
| **MIN-115** — *`apply_patch` pour `gpt-*` + instructions des sous-dossiers* | 3 | R8 + R11 |

Deux opportunités n'ont **pas** de ticket, et c'est délibéré :

- **Le tool `invalid`** (opportunité 9) : l'écart est réel chez OpenCode, mais nous
  n'avons aucune occurrence mesurée d'un appel de tool malformé. On attend un signal.
- **Le tool `lsp`** : requalifié en *conditionné à la mesure de MIN-110*. Si un
  serveur de langage peut vivre dans la microVM, il suit presque gratuitement ;
  sinon la question ne se pose pas. Noté en commentaire sur MIN-110.

---

## Annexe — reproduire les mesures

Les scripts de la passe 3 vivent dans le scratchpad de la session (non commités).
Pour les rejouer, l'essentiel tient en une requête PostgREST sur
`agent_run_events` avec la clé de service :

```
GET {SUPABASE_URL}/rest/v1/agent_run_events
    ?select=payload,created_at
    &type=eq.tool_result
    &created_at=gte.{ISO}
```

puis agrégation sur `payload->>'name'` et `payload->>'success'`. Attention : les
events antérieurs au 2026-07-18 portent un payload de forme ancienne
(`{ id, name, args }` où `args` est le JSON brut) — les payloads récents portent le
résumé destructuré (`{ id, name, command }` pour `run_command`). Toute agrégation
qui ignore la forme ancienne perd la moitié des `run_command`.
