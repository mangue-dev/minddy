import { getTranslations } from "next-intl/server";
import { cn } from "mangue-ui";
import { ArrowDown, ArrowRight, Mic } from "lucide-react";
import { PriorityIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";

/**
 * La dictée vocale, en figure plutôt qu'en capture.
 *
 * POURQUOI PAS UNE CAPTURE. Le popover de dictée n'est monté qu'après un
 * `getUserMedia` réussi : sans périphérique audio, il n'existe pas, et un robot
 * de capture n'en a pas. Mais surtout, une capture montrerait un chronomètre et
 * une forme d'onde — c'est-à-dire qu'on enregistre, pas ce que ça donne. Or
 * l'argument de la section n'est pas « il y a un micro », c'est « une phrase
 * dite se range dans les bons champs ». Ça, une capture ne peut pas le montrer :
 * il faudrait deux instants dans la même image.
 *
 * La figure les met côte à côte : la prise à gauche, le ticket rempli à droite,
 * et des repères numérotés qui relient chaque morceau de la phrase au champ
 * qu'il a rempli.
 *
 * FIDÉLITÉ AU PRODUIT. Rien n'est redessiné :
 *   - la carte de prise reprend la géométrie du vrai popover (16 barres de 3 px,
 *     3 px de gouttière, hauteurs entre 4 et 32 px) et ses propres libellés,
 *     lus dans le namespace `Dictate` ;
 *   - la priorité et l'assigné sont rendus par `PriorityIndicator` et
 *     `UserAvatar`, les composants du board ;
 *   - les noms de champs viennent de `Field`, la priorité de `Priority`.
 * Si le produit change ces éléments, la figure change avec lui.
 *
 * Composant SERVEUR : aucun JavaScript n'est envoyé pour cette section. La forme
 * d'onde est figée — un enregistrement en cours qui s'anime tout seul sur une
 * page d'accueil serait du mouvement gratuit, et la sobriété est l'argument.
 */

/** Enveloppe d'une voix qui parle. Bornes du vrai composant : 4 px → 32 px. */
const WAVEFORM = [6, 11, 19, 27, 32, 23, 14, 8, 12, 21, 29, 24, 17, 10, 14, 7];

/** Repère qui relie un morceau de la phrase au champ qu'il a rempli. */
function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-border bg-muted font-mono text-[10px] leading-none text-muted-foreground",
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * Un morceau de la phrase dictée, souligné et numéroté.
 *
 * L'enveloppe reste `inline` : en `inline-flex` elle ouvrait une boîte, et la
 * ponctuation qui suit le repère se détachait d'un blanc (« à Léa 4 . »).
 * `whitespace-nowrap` garde le repère collé à son fragment au passage à la ligne.
 */
function Fragment({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="decoration-brand/40 underline decoration-2 underline-offset-4">
        {children}
      </span>
      <Marker n={n} className="ml-1 align-middle" />
    </span>
  );
}

/** Une ligne de propriété, comme dans le panneau d'un ticket. */
function Row({
  n,
  label,
  children,
}: {
  n: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-2.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Marker n={n} />
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-sm font-medium">{children}</span>
    </div>
  );
}

export async function VoiceDictationFigure() {
  const t = await getTranslations("Landing");
  const tDictate = await getTranslations("Dictate");
  const tField = await getTranslations("Field");
  const tPriority = await getTranslations("Priority");

  const assignee = t("voiceFigureAssignee");

  return (
    <figure className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      {/* Pas d'`items-center` : la colonne de droite est la plus haute, et
          centrer chaque colonne décalait vers le bas l'intitulé de gauche.
          Les colonnes s'étirent donc, les deux intitulés s'alignent, et seule
          la flèche se recentre. */}
      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-8">
        {/* ── Ce que vous dites ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("voiceFigureSpoken")}
          </p>

          {/* La prise : même géométrie que le popover de `DictateButton`. */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Mic className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">0:07</span>
                <span>{tDictate("maxDuration")}</span>
              </div>
              <div className="mt-1.5 flex h-8 items-center gap-[3px]" aria-hidden>
                {WAVEFORM.map((height, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-brand"
                    style={{ height: `${height}px` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <blockquote className="text-[15px] leading-relaxed text-pretty">
            {t.rich("voiceFigureQuote", {
              f1: (chunks) => <Fragment n={1}>{chunks}</Fragment>,
              f2: (chunks) => <Fragment n={2}>{chunks}</Fragment>,
              f3: (chunks) => <Fragment n={3}>{chunks}</Fragment>,
              f4: (chunks) => <Fragment n={4}>{chunks}</Fragment>,
            })}
          </blockquote>
        </div>

        {/* Le sens de lecture : à droite sur grand écran, vers le bas sinon. */}
        <div className="flex justify-center self-center text-muted-foreground" aria-hidden>
          <ArrowDown className="size-5 md:hidden" />
          <ArrowRight className="hidden size-5 md:block" />
        </div>

        {/* ── Ce que minddy en fait ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("voiceFigureResult")}
          </p>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-start gap-2">
              <Marker n={1} />
              <h3 className="text-base leading-snug font-semibold">
                {t("voiceFigureTitle")}
              </h3>
            </div>

            <Row n={2} label={tField("priority")}>
              <PriorityIndicator priority="high" />
              {tPriority("high")}
            </Row>
            <Row n={3} label={tField("dueDate")}>
              {t("voiceFigureDue")}
            </Row>
            <Row n={4} label={tField("assignee")}>
              <UserAvatar
                name={assignee}
                seed={assignee}
                className="size-5 text-[9px]"
              />
              {assignee}
            </Row>
          </div>
        </div>
      </div>

      <figcaption className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        {t("voiceFigureCaption")}
      </figcaption>
    </figure>
  );
}
