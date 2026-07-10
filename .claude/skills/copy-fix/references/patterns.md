# Application patterns

Detect the stack first, then apply the matching pattern. The examples target the common target-app
stack (Next.js + Tailwind + shadcn/ui + lucide-react). If a project uses a different tooltip
primitive (Radix directly, Mantine, MUI, custom), use that one instead of introducing a new dep.

## Progressive disclosure — inline text → info `(i)` icon + tooltip

Detect an existing tooltip primitive before writing anything:
- shadcn/ui: `@/components/ui/tooltip` exporting `Tooltip`, `TooltipTrigger`, `TooltipContent`,
  `TooltipProvider`.
- Radix: `@radix-ui/react-tooltip`.
- If none exists, DO NOT add a dependency or hand-roll one. Report it and leave the text inline.

shadcn/ui + lucide pattern (icon = `Info` from `lucide-react`):

```tsx
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <button type="button" aria-label="Plus d'infos" className="inline-flex">
      <Info className="h-4 w-4 text-muted-foreground" />
    </button>
  </TooltipTrigger>
  <TooltipContent>{/* the moved-out explanation text */}</TooltipContent>
</Tooltip>
```

Notes:
- Keep the primary label as plain text next to the icon; only the secondary detail moves into
  `TooltipContent`.
- Always set an `aria-label` on the trigger — the icon carries meaning for screen readers.
- Ensure a `TooltipProvider` exists somewhere up the tree (shadcn usually has one at the app root);
  if not, wrap locally.

## Length limit — truncate + full text on hover/tap

Single line (Tailwind):

```tsx
<span className="block max-w-[<budget>] truncate" title={fullText}>{fullText}</span>
```

Multi-line clamp:

```tsx
<p className="line-clamp-2">{fullText}</p>
```

Notes:
- `title={fullText}` gives a native tooltip cheaply; for a styled tooltip, reuse the primitive above.
- `line-clamp-*` needs the Tailwind line-clamp utilities (built in since Tailwind ≥3.3).
- Truncation is a display fallback, not a copy fix — the string should already have been shortened
  by a `rewrite` finding when the text itself was the problem. Truncation is for text whose full
  length is legitimately needed but won't fit.

## i18n editing

- `next-intl`: values live in `messages/<locale>.json`, nested by key path. Edit the value at the
  exact key path from the finding's `location`. Don't reorder or reformat the whole file — change
  only the target value.
- `react-i18next`: usually `public/locales/<locale>/<ns>.json` or `locales/`. Same rule.
- `.po`: edit the `msgstr` for the matching `msgid`; leave `msgid` untouched.
- After editing a key's value, grep the other locale files for the **same key** and list them for
  re-translation in the report. Never translate them yourself.