import { getTranslations } from "next-intl/server";
import { Check, GitPullRequest, ListChecks, MessageSquareDashed } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { PriorityIndicator, StatusIndicator } from "@/components/issue-indicators";
import { NumoFace } from "@/components/numo-face";

/**
 * La boucle agent, en figure — l'image du hero (MIN-148).
 *
 * POURQUOI PAS UNE CAPTURE. La boucle ne tient sur aucun écran : elle se joue
 * sur trois (`workflowIssue`, `workflowAgent`, `workflowPr`), et trois captures
 * rétrécies côte à côte dans un hero ne se lisent pas. Surtout, le hero montrait
 * jusqu'ici le board — or un board ressemble forcément à un board, et le poser
 * en première image invitait une comparaison de tracker à tracker, sur le
 * terrain de Linear. Ici l'image dit ce que personne d'autre ne peut montrer :
 * un ticket, et sous lui le plan que l'agent a écrit, ce qu'il a exécuté, la
 * pull request qui s'y rattache, et votre relecture.
 *
 * La forme suit l'argument : UNE carte, pas quatre. « Un seul ticket porte
 * tout » se démontre en le dessinant, pas en l'écrivant.
 *
 * FIDÉLITÉ AU PRODUIT, comme `voice-dictation-figure.tsx` :
 *   - le statut et la priorité sont rendus par `StatusIndicator` et
 *     `PriorityIndicator`, les composants du board ;
 *   - les cases à cocher reprennent la géométrie exacte de `TaskRow`
 *     (components/plan-task-row.tsx) : 16 px, rayon 4, cochée en `primary`,
 *     texte barré et grisé ;
 *   - les libellés de la barre de revue sont ceux de la vraie barre
 *     (`PullRequests.reviewApprove` / `reviewRequestChanges`), pas une
 *     reformulation marketing ;
 *   - le vert de la pull request ouverte est celui de GitHub, comme
 *     `PR_STATE_STYLES` — recopié et non importé, ce module-là est client.
 *
 * Composant SERVEUR : le hero n'envoie pas une ligne de JavaScript pour cette
 * image, et rien ne s'anime tout seul. C'est aussi ce qui la rend légère pour le
 * LCP — du texte et deux SVG au lieu d'une capture en 16/10.
 */

/** Les trois tâches du plan, toutes cochées : la boucle montrée est finie. */
const PLAN_TASKS = ["repro", "signature", "retry"] as const;

/** La branche de l'agent : du code, donc jamais traduit. */
const BRANCH = "fix/stripe-webhook-500";

/** Un temps de la boucle : pastille sur le rail, intitulé, contenu. */
function Beat({
  icon,
  label,
  last,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3">
      {/* Le rail : la pastille, puis le trait qui descend vers le temps
          suivant. Il vit DANS la colonne et non en position absolue — sa
          hauteur est donc celle du contenu, quelle que soit la longueur du
          texte une fois traduit. */}
      <div className="flex flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          {icon}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
      </div>

      <div className={cn("min-w-0", !last && "pb-5")}>
        {/* `h-7` : l'intitulé occupe la hauteur de la pastille, les deux
            s'alignent sans décalage optique. */}
        <p className="flex h-7 items-center text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

/** Le cadre d'un bloc de contenu — même fond que les encarts de la landing. */
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-muted/30 p-3", className)}>
      {children}
    </div>
  );
}

export async function AgentLoopFigure() {
  const [t, tPr] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("PullRequests"),
  ]);

  return (
    <figure className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7">
      {/* ── Le ticket : le seul geste qui reste le vôtre ─────────────────── */}
      <header className="flex items-start gap-3 border-b border-border pb-5">
        <StatusIndicator status="in_progress" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* Identifiant en dur : c'est un décor, pas une donnée. MIN-42 parce
              que minddy se suit lui-même dans minddy. */}
          <p className="font-mono text-xs text-muted-foreground">MIN-42</p>
          <p className="mt-0.5 text-base leading-snug font-semibold text-pretty">
            {t("heroLoopIssueTitle")}
          </p>
        </div>
        <PriorityIndicator priority="high" className="mt-1" />
      </header>

      <ol className="mt-5">
        {/* ① Le plan, écrit par l'agent ─────────────────────────────────── */}
        <Beat icon={<ListChecks className="size-3.5" />} label={t("heroLoopStepPlan")}>
          <Panel>
            <ul className="flex flex-col gap-2">
              {PLAN_TASKS.map((task) => (
                <li key={task} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground line-through">
                    {t(`heroLoopTask_${task}`)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </Beat>

        {/* ② L'exécution ────────────────────────────────────────────────── */}
        <Beat icon={<NumoFace className="h-3.5 w-auto" />} label={t("heroLoopStepRun")}>
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="font-mono text-xs text-foreground/90">{BRANCH}</span>
            <span className="text-xs text-muted-foreground">{t("heroLoopRunDetail")}</span>
          </Panel>
        </Beat>

        {/* ③ La pull request, rattachée au ticket ────────────────────────── */}
        <Beat icon={<GitPullRequest className="size-3.5" />} label={t("heroLoopStepPr")}>
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <GitPullRequest className="size-4 shrink-0 text-green-700 dark:text-green-400" />
              #128
            </span>
            <span className="font-mono text-xs tabular-nums">
              <span className="text-green-700 dark:text-green-400">+82</span>{" "}
              <span className="text-destructive">−14</span>
            </span>
          </Panel>
        </Beat>

        {/* ④ La vérification — le temps qui ne se délègue pas ────────────── */}
        <Beat icon={<Check className="size-3.5" />} label={t("heroLoopStepReview")} last>
          {/* Des pastilles, pas des boutons : rien n'est cliquable ici, et un
              bouton plein appellerait le clic que la vraie action mérite. */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm">
              <Check className="size-3.5 shrink-0 text-green-700 dark:text-green-400" />
              {tPr("reviewApprove")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <MessageSquareDashed className="size-3.5 shrink-0" />
              {tPr("reviewRequestChanges")}
            </span>
          </div>
        </Beat>
      </ol>
    </figure>
  );
}
