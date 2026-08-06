"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  Button,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Spinner,
  cn,
} from "mangue-ui";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { WizardStepper } from "@/components/wizard/wizard-stepper";

/**
 * La modale d'un wizard — la forme, une fois pour toutes.
 *
 * Le dessin est celui du wizard de création de projet, qui le tenait d'AutoKap
 * (project-wizard-dialog.tsx) : grande modale fixe (tokens
 * `--spacing-dialog-w/h`), stepper à pilules seul en haut, colonne centrée qui
 * porte le titre et le sous-titre de l'étape alignés à gauche, puis le corps de
 * l'étape ; en bas de cette même colonne, un CTA pleine largeur et le retour en
 * lien discret. Le corps glisse d'une étape à l'autre, le reste ne bouge pas.
 *
 * Un wizard qui passe par ici n'a donc plus à décider ni de sa modale, ni de sa
 * progression, ni de son animation, ni de ses boutons : il décrit ses étapes
 * (`WizardStep[]`) et dit où il en est. Ce qui reste à sa charge est ce qui lui
 * appartient vraiment — quand une étape est valide, ce que « Continuer »
 * déclenche, ce qu'il crée à la fin.
 *
 * La navigation est CONTRÔLÉE (`stepIndex` + `onStepIndexChange`) : les étapes
 * d'un vrai parcours dépendent des réponses (l'origine du projet décide de
 * l'amorce, le mode d'intégration décide du SSO), et une reprise après un
 * aller-retour hors de l'app doit pouvoir rouvrir le wizard à l'étape voulue.
 * Un index posé au-dehors sait faire tout ça ; un index caché ici, non.
 *
 * Le shell ne fait reculer que vers les étapes DÉJÀ validées — jamais avancer :
 * sauter en avant contournerait la validation de l'étape en cours.
 *
 * Il sait aussi retenir une fermeture accidentelle (`dismissConfirm`), ce qu'un
 * parcours de plusieurs étapes finit toujours par demander : un clic à côté ne
 * doit pas emporter ce qu'on est en train de faire.
 */

export interface WizardStep<Id extends string = string> {
  id: Id;
  /** Titre de l'étape, au-dessus de son contenu. */
  title: string;
  /** Une ligne pour situer l'étape. Facultative : un titre qui se suffit se suffit. */
  subtitle?: ReactNode;
  content: ReactNode;
  /**
   * Colonne élargie (max-w-2xl au lieu de max-w-lg) : pour les étapes qu'on
   * REGARDE avant de les lire — des cartes illustrées côte à côte, pas des
   * champs.
   */
  wide?: boolean;
  /**
   * L'étape avance d'elle-même (une carte cliquée EST le geste) : pas de CTA.
   * Un « Continuer » y demanderait un second clic pour confirmer ce qui vient
   * d'être dit.
   */
  hideSubmit?: boolean;
  /** Défaut : « Continuer ». À passer pour « Terminer », « Passer », « Générer »… */
  submitLabel?: string;
  submitDisabled?: boolean;
  /**
   * Étape sans retour : ce qui la précède a produit des effets qu'un pas en
   * arrière ne défait pas (une clé créée, un projet créé). Ni lien de retour,
   * ni pilule cliquable.
   */
  lockBack?: boolean;
}

export function WizardDialog<Id extends string>({
  open,
  onOpenChange,
  label,
  steps,
  stepIndex,
  onStepIndexChange,
  onSubmit,
  submitting = false,
  error,
  dismissConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nom de la modale pour les lecteurs d'écran — celui du wizard, pas de l'étape. */
  label: string;
  /** Les étapes du parcours TEL QU'IL EST : la liste peut changer en route. */
  steps: WizardStep<Id>[];
  stepIndex: number;
  /** Reculer (pilule d'une étape passée, lien de retour). */
  onStepIndexChange: (index: number) => void;
  /** Le CTA a été activé sur cette étape — à l'appelant d'avancer, ou pas. */
  onSubmit: (stepId: Id) => void;
  submitting?: boolean;
  /** Message d'échec, sous le corps de l'étape. */
  error?: ReactNode;
  /**
   * Les deux fermetures ACCIDENTELLES — le clic au-dehors et Échap — demandent
   * confirmation, avec ces mots-là. Le bouton de fermeture, lui, n'est jamais
   * intercepté : cliquer une croix est un geste explicite, et le faire répéter
   * n'empêcherait aucune erreur, ça n'ajouterait qu'un clic à qui veut sortir.
   *
   * Passer `undefined` là où il n'y a plus rien à perdre (la dernière étape,
   * la première) : une question sans enjeu apprend à répondre sans lire.
   */
  dismissConfirm?: {
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel: string;
  };
}) {
  const tCommon = useTranslations("Common");
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);

  // Une étape peut disparaître de la liste sous l'index (l'utilisateur change
  // une réponse en amont) : on borne plutôt que de rendre du vide.
  const index = Math.min(Math.max(stepIndex, 0), Math.max(steps.length - 1, 0));
  const step = steps[index];
  const isLast = index >= steps.length - 1;

  if (!step) return null;

  const goToStep = (target: number) => {
    if (submitting || step.lockBack) return;
    if (target >= 0 && target < index) onStepIndexChange(target);
  };

  /**
   * La garde est posée SUR LA MODALE, et pas sur son contenu : toutes les
   * fermetures que la modale déclenche d'elle-même — clic au-dehors, Échap, et
   * le glissé vers le bas de la feuille mobile — passent par ce
   * `onOpenChange`, alors que les crochets `onInteractOutside` /
   * `onEscapeKeyDown` du contenu n'existent que dans la version bureau (en
   * dessous de 480 px, mangue-ui rend un `Drawer`, qui ne les reçoit pas).
   *
   * Le bouton de fermeture, lui, appelle `onOpenChange` EN DIRECT, sans passer
   * par la modale : il n'est donc pas intercepté, et c'est voulu.
   */
  const handleModalOpenChange = (next: boolean) => {
    if (!next && dismissConfirm) {
      setConfirmingDismiss(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleModalOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
      >
        {/* Le nom de la modale est celui du wizard : il ne change pas d'une
            étape à l'autre. Le titre de l'étape, lui, est un titre DANS la
            modale — il est visible, dans la colonne, avec ce qu'il annonce. */}
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{step.title}</DialogDescription>

        <div className="absolute top-4 right-4 z-30">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onOpenChange(false)}
            aria-label={tCommon("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* En-tête : uniquement où l'on en est. La progression est la seule
            chose qui ne bouge pas d'une étape à l'autre — elle tient le haut de
            la modale, à la hauteur du bouton de fermeture. */}
        <div className="flex shrink-0 justify-center px-6 pt-5 pb-2">
          <WizardStepper
            className="pt-2.5"
            currentStep={index + 1}
            totalSteps={steps.length}
            onStepClick={(s) => goToStep(s - 1)}
            getStepLabel={(s) => steps[s - 1]?.title}
          />
        </div>

        {/* Une étape plus HAUTE que la modale doit rester atteignable.
            `items-center` centrait le formulaire dans une boîte qui défile :
            dès qu'il débordait, son HAUT passait au-dessus du point de départ
            du défilement et devenait inaccessible — on ne pouvait plus remonter
            au premier champ. Des marges `auto` centrent tout aussi bien tant
            qu'il reste de la place, et retombent à zéro dès qu'il n'y en a
            plus : le formulaire repart alors du haut et se parcourt en
            entier. */}
        <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pt-4 pb-12">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(step.id);
            }}
            className={cn(
              "my-auto flex w-full flex-col items-center gap-7",
              step.wide ? "max-w-2xl" : "max-w-lg",
            )}
          >
            <div className="w-full overflow-hidden p-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex w-full flex-col gap-6"
                >
                  {/* Titre et sous-titre : posés au-dessus de ce qu'ils
                      annoncent, dans la même colonne et alignés sur son bord
                      gauche, pas relégués dans un coin de l'en-tête. Ils
                      voyagent avec le contenu, donc ils changent dans le même
                      mouvement. */}
                  <div className="space-y-1.5 text-left">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {step.title}
                    </h2>
                    {step.subtitle && (
                      <p className="max-w-lg text-sm text-muted-foreground">
                        {step.subtitle}
                      </p>
                    )}
                  </div>

                  {step.content}
                </motion.div>
              </AnimatePresence>
            </div>

            {error && (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex w-full flex-col items-center gap-3">
              {!step.hideSubmit && (
                <Button
                  type="submit"
                  className="h-10 w-full"
                  disabled={submitting || step.submitDisabled}
                >
                  {submitting && <Spinner />}
                  {step.submitLabel ?? tCommon("continue")}
                  {!submitting && !isLast && (
                    <ArrowRight className="ml-1 h-4 w-4" />
                  )}
                </Button>
              )}
              {index > 0 && !step.lockBack && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="bg-transparent text-xs text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-50"
                  onClick={() => goToStep(index - 1)}
                  disabled={submitting}
                >
                  <ArrowLeft className="size-3.5" />
                  {tCommon("back")}
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Rendue DANS la modale : c'est ce qui l'inscrit au-dessus d'elle dans
            la pile de calques de Radix, donc le clic qui la ferme ne redescend
            pas fermer le wizard derrière. Hors du `<form>`, aussi : son bouton
            de confirmation n'a rien à soumettre. */}
        {dismissConfirm && (
          <ConfirmDeleteDialog
            open={confirmingDismiss}
            onOpenChange={setConfirmingDismiss}
            title={dismissConfirm.title}
            description={dismissConfirm.description}
            confirmLabel={dismissConfirm.confirmLabel}
            cancelLabel={dismissConfirm.cancelLabel}
            onConfirm={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
