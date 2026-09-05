/** Keep the reading order consistent across every landing chapter. */
export function SectionHeading({ title, description, id }: { title: string; description: string; id?: string }) {
  return (
    <header className="mb-10 max-w-3xl sm:mb-12">
      <h2 id={id} className="text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-4xl">{title}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{description}</p>
    </header>
  );
}
