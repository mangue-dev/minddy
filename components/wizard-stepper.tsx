import { cn } from "mangue-ui";

/**
 * Indicateur d'étapes du wizard (MIN-62), porté d'AutoKap (wizard-stepper.tsx) :
 * une rangée de pilules — l'étape active est une barre large, les étapes
 * passées sont courtes, atténuées et cliquables pour revenir en arrière, les
 * étapes à venir restent verrouillées (pas encore validées).
 */
export function WizardStepper({
  currentStep,
  totalSteps,
  className,
  onStepClick,
  getStepLabel,
}: {
  currentStep: number;
  totalSteps: number;
  className?: string;
  /** Rend les étapes passées cliquables pour y sauter directement. */
  onStepClick?: (step: number) => void;
  /** Label accessible / tooltip natif d'une étape (son titre). */
  getStepLabel?: (step: number) => string;
}) {
  return (
    <ol
      className={cn("flex items-center justify-center gap-1.5", className)}
      role="list"
    >
      {Array.from({ length: totalSteps }).map((_, idx) => {
        const stepNumber = idx + 1;
        const active = stepNumber === currentStep;
        const completed = stepNumber < currentStep;
        const clickable = Boolean(onStepClick) && completed;

        const bar = (
          <span
            className={cn(
              "block h-1.5 rounded-full transition-all",
              active && "w-6 bg-foreground",
              completed && "w-1.5 bg-foreground/40",
              !active && !completed && "w-1.5 bg-muted",
              clickable && "group-hover:w-3 group-hover:bg-foreground",
            )}
          />
        );

        const label = getStepLabel?.(stepNumber);

        return (
          <li
            key={stepNumber}
            className="flex items-center"
            aria-current={active ? "step" : undefined}
          >
            {clickable ? (
              <button
                type="button"
                onClick={() => onStepClick?.(stepNumber)}
                aria-label={label}
                title={label}
                className="group -my-2 flex cursor-pointer items-center px-0.5 py-2"
              >
                {bar}
              </button>
            ) : (
              <span className="-my-2 flex items-center px-0.5 py-2">{bar}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
