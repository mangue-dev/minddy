import { RefreshCw, ServerOff } from "lucide-react";
import { Button } from "mangue-ui";

type ServerUnavailableStateProps = {
  description: string;
  retryLabel: string;
  title: string;
} & (
  | { onRetry: () => void; retryHref?: never }
  | { onRetry?: never; retryHref: string }
);

/** Full-screen recovery state used when the application backend is unreachable. */
export function ServerUnavailableState({
  description,
  onRetry,
  retryHref,
  retryLabel,
  title,
}: ServerUnavailableStateProps) {
  const buttonContent = (
    <>
      <RefreshCw className="size-4" aria-hidden />
      {retryLabel}
    </>
  );

  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-16"
      role="alert"
      aria-live="assertive"
    >
      <div className="mx-auto w-full max-w-lg text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-border bg-muted text-muted-foreground">
          <ServerOff className="size-7" aria-hidden />
        </div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
        <div className="mt-8">
          {onRetry ? (
            <Button type="button" size="lg" onClick={onRetry}>
              {buttonContent}
            </Button>
          ) : (
            <Button asChild size="lg">
              <a href={retryHref}>{buttonContent}</a>
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
