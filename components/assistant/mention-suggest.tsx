"use client";

// La liste de suggestions du « @ » dans le composer de Numo — le pendant, pour
// un contentEditable, de celle des commentaires (components/mention-textarea).
// Elle s'ouvre au-dessus du composer (qui est collé en bas de son panneau) et
// se pilote entièrement au clavier.

import { cn } from "mangue-ui";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";

export interface MentionOption {
  type: "member" | "project";
  id: string;
  /** Ce qui s'écrit après le « @ ». */
  label: string;
  /** Membres : graine du portrait. */
  avatarSeed?: string;
  /** Projets : le favicon importé, quand il y en a un (sinon l'orbe). */
  iconUrl?: string | null;
  /** Termes de recherche en plus du libellé (e-mail, clé de projet). */
  keywords?: string[];
}

/** Les options qui correspondent à la requête tapée après le « @ ». */
export function filterMentions(
  options: MentionOption[],
  query: string,
  limit = 6,
): MentionOption[] {
  const q = query.trim().toLowerCase();
  return options
    .filter((o) =>
      q
        ? [o.label, ...(o.keywords ?? [])].some((term) =>
            term.toLowerCase().includes(q),
          )
        : true,
    )
    .slice(0, limit);
}

export function MentionSuggestions({
  options,
  activeIndex,
  onPick,
  onHover,
  className,
}: {
  options: MentionOption[];
  activeIndex: number;
  onPick: (option: MentionOption) => void;
  onHover: (index: number) => void;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full z-50 mb-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md",
        className,
      )}
    >
      {options.map((option, index) => (
        <button
          key={`${option.type}:${option.id}`}
          type="button"
          // mousedown, pas click : le composer ne doit pas perdre le focus (le
          // blur fermerait la liste avant que le clic n'arrive).
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
            index === activeIndex && "bg-muted",
          )}
        >
          {option.type === "member" ? (
            <UserAvatar seed={option.avatarSeed} className="size-5 shrink-0" />
          ) : (
            <ProjectOrb seed={option.id} iconUrl={option.iconUrl} className="size-5" />
          )}
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
