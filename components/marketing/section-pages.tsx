import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * §5 — “The pages” (MIN-254).
 *
 * The wiki per project was NOT mentioned ANYWHERE on the landing. It is entered first as a line from the "And the rest is already there" tape, which was twice wrong: it is an entire surface of the product - an editor, a tree, a publication, a history - and above all it is the only place where the "all in one" is verified effortlessly. A visitor who keeps
 * Notion open next to his tracker is precisely the one to whom this page
 * is aimed.
 *
 * IT FOLLOWS SPEED AND PRECEDES RETURNS, and this place is not
 * arbitrary: the opening line of the following section says “so far,
 * everything came from you”. Pages are the last place where this is still true —
 * what you write, what your agents write — before the page switches
 * to what comes in from your users.
 *
 * EVERYTHING SAID HERE EXISTS, and has been verified in the code instead that
 * deduced from the name of the feature:
 * - the subpages are a block of the editor (`Pages.blockSubpage`), therefore
 * the tree is built by writing, not in a separate menu;
 * - a mention leads to a ticket, an objective or another page
 * (`lib/mention-target.ts`) — this is the link between the wiki and the tracker,
 * and this is what makes them not two tools in the same tab;
 * - the publication has three levels, private / password / public link, and
 * can take away the subpages (`PublishPage`);
 * - the history kept for 30 days is restored with one click
 * (`components/pages/page-history.tsx`), and the export is output in Markdown or in
 * PDF, a page or an entire branch;
 * - the agents have eight MCP tools on pages, reading, searching,
 * including writing and commenting (`lib/server/mcp/page-tools.ts`).
 */

const POINTS = [
  { key: "write", icon: "pages" },
  { key: "link", icon: "share" },
  { key: "agents", icon: "message" },
  { key: "publish", icon: "api" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

export async function SectionPages() {
  const t = await getTranslations("Landing");

  return (
    <section id="pages" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("pagesTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("pagesSubtitle")}
          </Reveal>
        </header>

        <Reveal as="figure" className="mx-auto mb-12 flex max-w-4xl flex-col gap-3 sm:mb-16">
          <ScreenshotSlot id="pagesEditor" />
          <figcaption className="text-center text-sm text-muted-foreground">
            {t("pagesCaption")}
          </figcaption>
        </Reveal>

        {/* Mesh grid: block entry — hiding cards one by one
 would uncover the bottom `bg-border` of the container. */}
        <Reveal
          as="ul"
          className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
        >
          {POINTS.map((point) => (
            <li key={point.key} className="bg-card p-6">
              <IsoTile name={point.icon} className="mb-4 w-14" />
              <h3 className="mb-1.5 font-medium">{t(`pages_${point.key}_title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`pages_${point.key}_body`)}
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
