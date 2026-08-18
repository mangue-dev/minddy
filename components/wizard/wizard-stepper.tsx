import { cn } from "mangue-ui";

/**
 * Wizard steps indicator (MIN-62), ported from AutoKap (wizard-stepper.tsx):
 * a row of pills — active step is a wide bar, past steps are short, faded and clickable to go back, upcoming steps remain locked (not yet validated).
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
  /** Makes past steps clickable to jump directly to them. */
  onStepClick?: (step: number) => void;
  /** Accessible label / native tooltip of a step (its title). */
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
