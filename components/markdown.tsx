"use client";

import type { ElementType, JSX } from "react";
import ReactMarkdown, { type ExtraProps, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "mangue-ui";
import { MentionChip, NUMO_MENTION_ID } from "@/components/mention-chip";
import { memberLabel, mentionScanner } from "@/lib/mention-scan";
import { forgeImageSrc } from "@/lib/forge-image-assets";
import { usePrEndpoint } from "@/lib/pr-endpoint-context";
import type { Member } from "@/lib/types";

/* Minimal hast node shape — enough to walk text nodes and inject mention spans. */
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** Rehype plugin: turn "@Display Name" / "@numo" tokens into
    <span data-mention-*> so the renderer can swap in a MentionChip. Runs on the
    HTML AST, so surrounding markdown formatting is preserved. La règle de ce
    qui EST une mention vient de lib/mention-scan — la même qu'applique le
    composer pendant qu'on écrit. */
function rehypeMentions(members: Member[]) {
  const scan = mentionScanner(members);

  const split = (value: string): HastNode[] =>
    scan(value).map((seg) =>
      seg.mention === undefined
        ? { type: "text", value: seg.text }
        : {
            type: "element",
            tagName: "span",
            properties:
              // `member` en test, et non « pas numo » : le scanner sait aussi
              // rendre des comptes de FORGE (MIN-162), qu'aucune liste de
              // membres minddy ne produit ici — un commentaire de ticket ne cite
              // que des gens d'ici.
              seg.mention.type === "member"
                ? {
                    "data-mention-type": "member",
                    "data-mention-id": seg.mention.member.user_id,
                    "data-mention-label": memberLabel(seg.mention.member),
                    "data-mention-seed": seg.mention.member.avatar_seed,
                  }
                : { "data-mention-type": "numo" },
            children: [],
          },
    );

  const walk = (node: HastNode) => {
    if (!node.children) return;
    // Du code se cite littéralement : « `@numo` » montre le geste à faire, il ne
    // le fait pas.
    if (node.tagName === "code" || node.tagName === "pre") return;
    const next: HastNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value?.includes("@")) {
        next.push(...split(child.value));
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };

  return () => (tree: HastNode) => walk(tree);
}

/**
 * Une balise rendue telle quelle, juste habillée.
 *
 * react-markdown passe TOUJOURS le nœud hast en prop à un composant de
 * remplacement (`passNode: true`, codé en dur — il n'y a pas d'option pour
 * l'éteindre). Laissé dans le spread, il finit dans le DOM : chaque paragraphe,
 * chaque cellule, chaque titre d'un commentaire portait un attribut
 * `node="[object Object]"`. Il se retire ici, une bonne fois, plutôt que dans
 * quinze fermetures qui répéteraient la même destructuration.
 */
function styled<T extends keyof JSX.IntrinsicElements>(tag: T, className: string) {
  const Tag = tag as ElementType;
  return function Styled({ node, ...props }: JSX.IntrinsicElements[T] & ExtraProps) {
    return <Tag className={className} {...props} />;
  };
}

/**
 * Chaîne rehype, dans un ORDRE qui est une propriété de sécurité :
 *
 *  1. `rehypeRaw` transforme le HTML BRUT du texte en vrais nœuds. Sans lui,
 *     react-markdown le jette en silence — un `<a href>` ou un `<img>` d'un
 *     commentaire GitHub (le bot Vercel, dependabot, une capture collée) perdait
 *     son lien et son image sans rien laisser voir du manque ;
 *  2. `rehypeSanitize` referme ensuite sur l'allowlist de `hast-util-sanitize`,
 *     qui EST celle de GitHub — d'où l'usage tel quel : ce qui passe ici est
 *     exactement ce que GitHub laisse passer dans un commentaire, `<script>` et
 *     gestionnaires `on*` exclus ;
 *  3. `rehypeMentions` en DERNIER, et jamais avant : c'est lui qui pose les
 *     `data-mention-*` que le renderer échange contre une puce. Sanitizer après
 *     lui les effacerait ; sanitizer avant garantit qu'un `<span
 *     data-mention-type="numo">` écrit à la main dans un commentaire ne se fasse
 *     pas passer pour une vraie mention.
 */
function rehypeChain(members?: Member[]): Options["rehypePlugins"] {
  const chain: NonNullable<Options["rehypePlugins"]> = [
    rehypeRaw,
    [rehypeSanitize, defaultSchema],
  ];
  return members ? [...chain, rehypeMentions(members)] : chain;
}

/** Renders markdown (GFM) with minimal, token-aware styling, plus the raw HTML
    GitHub allows in a comment (sanitized — cf. `rehypeChain`).
    Pass `members` to render "@Name" and "@numo" mentions as chips — the same
    chip as the Numo composer's (components/mention-chip). The array may be
    empty: it says "this surface carries mentions", and "@numo" is citable there
    even when nobody else is. */
export function Markdown({
  children,
  className,
  members,
}: {
  children: string;
  className?: string;
  members?: Member[];
}) {
  // null hors d'une vue de PR : les images d'un commentaire de ticket sont déjà
  // servies par minddy, elles n'ont rien à proxifier.
  const imageEndpoint = usePrEndpoint();
  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        className
      )}
    >
      <ReactMarkdown
        // `remarkBreaks` : un simple retour à la ligne EST un retour à la ligne.
        // C'est la règle des commentaires GitHub (pas celle des fichiers .md), et
        // c'est celle de toutes les surfaces d'ici — commentaires de ticket, de PR,
        // plans. Sans lui, un message écrit en trois lignes se rendait en un seul
        // paragraphe : la différence de « rendu de texte » la plus visible.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={rehypeChain(members)}
        components={{
          p: styled("p", "my-3"),
          a: ({ node, ...props }) => (
            <a
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          /* Une liste imbriquée se resserre (`[&_ul]`, `[&_ol]`) : l'espacement
             entre paragraphes ferait, en cascade, une liste qui se délite. */
          ul: styled("ul", "my-3 list-disc pl-5 [&_ol]:my-1 [&_ul]:my-1"),
          ol: styled("ol", "my-3 list-decimal pl-5 [&_ol]:my-1 [&_ul]:my-1"),
          /* Une case à cocher remplace la puce et se pose dans la gouttière,
             comme chez GitHub — sinon la ligne porte les deux. Le sélecteur est
             STRUCTUREL (`:has`) plutôt que fondé sur la classe `task-list-item`,
             que le sanitizer retire. Le seul `input` qu'il laisse passer est
             justement une case à cocher désactivée : pas d'ambiguïté. */
          li: styled("li", "my-1 [&:has(>input)]:list-none [&>input]:-ml-5"),
          input: styled(
            "input",
            "mr-1.5 inline-block size-3.5 translate-y-[0.15em] accent-primary",
          ),
          code: styled("code", "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"),
          pre: styled("pre", "my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs"),
          kbd: styled(
            "kbd",
            "rounded border border-border bg-muted px-1 font-mono text-[0.85em]",
          ),
          /* Images de commentaire (badges CI, captures collées) : elles arrivent
             surtout en HTML brut, et ne se rendaient donc pas du tout avant
             `rehypeRaw`. Bornées à la largeur du fil — une capture de rétine
             pousserait la carte hors de l'écran.

             Une capture collée sur la forge, elle, passe par le proxy de la PR
             quand on nous a dit de quelle PR ce texte vient : son URL d'origine
             répond 404 à qui n'a pas de session GitHub (MIN-162). Le geste est
             le même pour une balise markdown et pour un `<img>` brut — les deux
             arrivent ici, après `rehypeRaw`. */
          img: ({ node, ...props }) => (
            <img
              className="inline-block max-w-full rounded-md"
              loading="lazy"
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              {...props}
              src={
                imageEndpoint && typeof props.src === "string"
                  ? forgeImageSrc(props.src, imageEndpoint)
                  : props.src
              }
            />
          ),
          details: styled("details", "my-3"),
          summary: styled("summary", "cursor-pointer font-medium"),
          /* GFM tables can be arbitrarily wide: keep them in their own scroll
             box so a wide one never stretches (nor side-scrolls) the comment
             around it. `min-w-max` lets the table keep its natural width inside
             that box instead of being squeezed into towering rows, while
             `w-full` still makes a small table fill the width; long cells stay
             readable by wrapping at 20rem. */
          table: ({ node, ...props }) => (
            <div className="my-3 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
              <table
                className="w-full min-w-max border-collapse text-left text-[0.9em]"
                {...props}
              />
            </div>
          ),
          thead: styled("thead", "bg-muted/60"),
          tr: styled("tr", "border-b border-border/60 last:border-0"),
          th: styled("th", "max-w-80 px-2.5 py-1.5 font-medium text-foreground"),
          td: styled("td", "max-w-80 px-2.5 py-1.5 align-top"),
          /* Six niveaux, et une échelle qui se VOIT — les trois anciens tombaient
             tous entre 14 et 16 px, ce qui faisait lire un plan ou une synthèse de
             review comme un bloc plat. Les tailles sont en `em` (et non en pas
             Tailwind) pour rester relatives au corps du texte : une surface qui
             réduit sa base réduit ses titres avec elle. Les proportions sont
             celles de GitHub, resserrées : sur un corps à 14 px, le 2em de son h1
             dépasserait le titre de la page. */
          h1: styled("h1", "mt-5 mb-2 text-[1.5em] leading-tight font-semibold"),
          h2: styled("h2", "mt-5 mb-2 text-[1.3em] leading-tight font-semibold"),
          h3: styled("h3", "mt-4 mb-2 text-[1.15em] leading-snug font-semibold"),
          h4: styled("h4", "mt-4 mb-2 text-[1em] font-semibold"),
          h5: styled("h5", "mt-4 mb-2 text-[0.9em] font-semibold"),
          h6: styled("h6", "mt-4 mb-2 text-[0.85em] font-semibold text-muted-foreground"),
          blockquote: styled(
            "blockquote",
            "my-3 border-l-2 border-border pl-3 text-muted-foreground"
          ),
          strong: styled("strong", "font-semibold"),
          hr: () => <hr className="my-4 border-border" />,
          span: ({ node, ...props }) => {
            const p = node?.properties ?? {};
            const type = p["data-mention-type"] as string | undefined;
            if (type === "numo") {
              return <MentionChip type="numo" id={NUMO_MENTION_ID} label="Numo" />;
            }
            if (type === "member") {
              return (
                <MentionChip
                  type="member"
                  id={p["data-mention-id"] as string}
                  label={p["data-mention-label"] as string}
                  avatarSeed={p["data-mention-seed"] as string}
                />
              );
            }
            return <span {...props} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
