/**
 * LE RÉSUMÉ D'UN APPEL DE TOOL — ce que le fil affiche d'un `tool_call`, et tout
 * ce qu'il en gardera : le payload persisté dans `agent_run_events` n'a rien
 * d'autre. Un cas manquant part en `{}`, et la relecture du run affiche
 * « Recherche de « … » » ou « 0 tâche ».
 *
 * SORTI d'[agent-loop.ts](agent-loop.ts) par MIN-286, sans en changer une ligne.
 * Deux moteurs doivent désormais produire le MÊME event : la boucle maison, et le
 * traducteur du flux d'opencode ([opencode-events.ts](vm/opencode-events.ts)). Le
 * laisser privé dans la boucle aurait obligé le second à le recopier — c'est-à-dire
 * à faire diverger le fil des deux moteurs au premier tool ajouté, alors que la
 * semaine de bascule est justement là pour vérifier qu'ils racontent la même chose.
 *
 * Module PUR : ni IO, ni import server-only. Il part dans le bundle de la microVM.
 */

/** `str` borné à `max` caractères, marqué quand il a été coupé. */
export function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/** Résumé compact des args d'un tool pour le live view (jamais le contenu de fichier). */
export function toolArgSummary(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "write_file":
    case "edit_file":
    case "delete_file":
      return { path: String(args.path ?? "") };
    case "move_file":
      return { from: String(args.from ?? ""), to: String(args.to ?? "") };
    case "apply_edits": {
      // Les chemins servent la vue LIVE « fichiers changés » (bloc de diff par tour,
      // MIN-46) : sans eux, un batch multi-fichiers n'apparaît que comme un compteur.
      const changes = Array.isArray(args.changes) ? args.changes : [];
      return {
        count: changes.length,
        paths: changes
          .map((c) => String((c as Record<string, unknown>)?.path ?? ""))
          .filter(Boolean)
          .slice(0, 50),
      };
    }
    case "apply_patch": {
      // Un patch est UNE grosse chaîne : on n'en garde que les en-têtes de section,
      // pour la même raison que les chemins d'`apply_edits` — sans eux, la vue live
      // « fichiers changés » est aveugle sur les runs `gpt-*` (MIN-115). Lecture
      // par regex, jamais un parse : un patch malformé ne doit pas casser l'event.
      const paths = [...String(args.patch ?? "").matchAll(/^\*\*\* (?:Add|Update|Delete) File:(.*)$/gm)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      return { count: paths.length, paths: paths.slice(0, 50) };
    }
    // `path` et `glob` font partie de ce QU'EST la recherche : sans eux, un
    // « (no matches) » dû à une portée trop étroite est indiscernable d'une vraie
    // absence — c'est ce qui a caché le bug d'accolades des pathspecs (MIN-116).
    case "glob":
      return {
        pattern: String(args.pattern ?? ""),
        ...(args.path ? { path: String(args.path) } : {}),
      };
    case "grep":
      return {
        pattern: String(args.pattern ?? ""),
        ...(args.path ? { path: String(args.path) } : {}),
        ...(args.glob ? { glob: String(args.glob) } : {}),
        ...(args.fixed_strings === true ? { fixed_strings: true } : {}),
      };
    case "run_command":
      // `workdir` fait partie de ce QU'EST la commande : sans lui, un `pnpm test`
      // lancé dans un sous-dossier est indiscernable du même lancé à la racine —
      // dans la vue live comme dans `agent_run_events` (MIN-109).
      return {
        command: cap(String(args.command ?? ""), 100),
        ...(args.workdir ? { workdir: String(args.workdir) } : {}),
      };
    case "run_background":
      // L'action ET sa cible : « check bg-2 » et « start npm run dev » ne racontent
      // pas la même chose dans la vue live ni dans `agent_run_events`.
      return {
        action: String(args.action ?? ""),
        ...(args.command ? { command: cap(String(args.command), 100) } : {}),
        ...(args.job_id ? { job_id: String(args.job_id) } : {}),
      };
    case "create_pr":
      return { title: cap(String(args.title ?? ""), 200) };
    case "read_resource":
    case "read_attachment":
      return {
        resource_id: String(args.resource_id ?? args.attachment_id ?? ""),
      };
    case "read_feedback":
      return { feedback_post_id: String(args.feedback_post_id ?? "") };
    // Tools minddy (MIN-125). Sans ces cas, les events persistés partent avec
    // `{}` et le fil relu affiche « Recherche de « … » » ou « 0 tâche » — le
    // résumé EST ce que la relecture du run a pour raconter l'appel.
    case "search_issues":
      return { query: cap(String(args.query ?? ""), 100) };
    case "read_issue":
      // `issue` seulement quand il est passé : sur le ticket de la session, son
      // absence est l'information (« il a relu SON ticket »).
      return args.issue ? { issue: String(args.issue) } : {};
    case "write_issue_plan":
      return {
        chars: String(args.plan ?? "").length,
        ...(args.issue ? { issue: String(args.issue) } : {}),
      };
    case "update_issue":
      return {
        fields: ["title", "description", "effort"].filter((f) => args[f] !== undefined),
        ...(args.issue ? { issue: String(args.issue) } : {}),
      };
    case "create_issue":
      return { title: cap(String(args.title ?? ""), 200) };
    case "add_scratchpad_tasks":
    case "update_scratchpad_task":
      return { count: Array.isArray(args.tasks) ? args.tasks.length : 0 };
    case "set_scratchpad":
      return { chars: String(args.content ?? "").length };
    // Sous-agents (MIN-112). Sans ces cas, le payload persisté part à `{}` et le
    // bloc replié du fil n'a rien à afficher au replay : ni le mode, ni la tâche,
    // ni le modèle sur lequel la fille a tourné.
    case "spawn_agent":
      return {
        mode: String(args.mode ?? ""),
        task: cap(String(args.task ?? ""), 200),
        ...(args.model ? { model: String(args.model) } : {}),
        ...(args.thinking_effort ? { thinking_effort: String(args.thinking_effort) } : {}),
        ...(args.prompt_template ? { prompt_template: String(args.prompt_template) } : {}),
      };
    case "agent_status":
      return { id: String(args.id ?? "") };
    default:
      return {};
  }
}
