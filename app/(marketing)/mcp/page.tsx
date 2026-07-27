import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, ExternalLink, KeyRound, ShieldCheck, UserCheck } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { cn } from "mangue-ui/lib/utils";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";
import { MCP_AGENTS, type McpAgent } from "@/lib/mcp-agents";
import { localizedHref } from "@/lib/locale-href";
import { AgentLogo } from "@/components/settings/agent-logo";
import { CopyButton } from "@/components/marketing/copy-button";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { MCP_FAQ_KEYS } from "@/components/marketing/faq-keys";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { TrackedCta } from "@/components/marketing/tracked-cta";

/**
 * `/mcp` — la doc publique du serveur MCP (MIN-93).
 *
 * C'est la page qui vise une requête que minddy peut réellement gagner :
 * « issue tracker MCP », « brancher Claude Code sur mes tickets » — pas
 * « meilleur outil de gestion de projet », où on n'existera jamais.
 *
 * Elle ne prétend PAS que minddy serait le seul tracker à parler MCP : Linear,
 * Atlassian et Notion publient chacun le leur. Elle montre juste ce qu'on
 * obtient ici, en une commande.
 *
 * Trois règles ont dicté la forme :
 *
 * 1. **Rien de recopié.** Les blocs de configuration viennent de
 *    `lib/mcp-agents.ts` (le même registre que les réglages du compte), et ce
 *    que fait un agent est dit avec les MÊMES clés que la section « Agents » de
 *    la landing (`Landing.agentsCapability_*`). Un agent ajouté là-bas apparaît
 *    ici, sans copie à maintenir.
 * 2. **Tout dans le HTML rendu par le serveur.** GPTBot, ClaudeBot et
 *    PerplexityBot n'exécutent pas de JavaScript : les sept blocs de
 *    configuration sont rendus côté serveur, tous, plutôt que cachés derrière un
 *    sélecteur d'onglets qui n'en aurait exposé qu'un.
 * 3. **Rien sur la plomberie.** Une première version listait les trente-deux
 *    outils un par un, avec leurs paramètres, le transport et le mode
 *    d'enregistrement des clients — la page décrivait COMMENT ça marche à
 *    quelqu'un qui veut juste savoir ce que ça fait. La référence complète, elle,
 *    existe toujours pour les machines : `/llms.txt` et `/llms-full.txt`, tous
 *    deux dérivés du serveur.
 */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "mcp", locale: (await getLocale()) as Locale });
}

/** Les trois garanties de l'autorisation, dans l'ordre du flux OAuth. */
const AUTH_POINTS = [
  { key: "who", icon: UserCheck },
  { key: "consent", icon: ShieldCheck },
  { key: "revoke", icon: KeyRound },
] as const;

/** Les trois parcours, dans l'ordre où on les découvre. */
const FLOW_KEYS = ["plan", "track", "create"] as const;

/**
 * Ce qu'un agent fait, dit avec les clés de la landing (`Landing`) plutôt
 * qu'avec la liste des outils du serveur : c'est la même information, écrite
 * pour quelqu'un qui veut savoir ce qu'il obtient — pas quelle fonction
 * appeler.
 */
const CAPABILITY_KEYS = [
  "read",
  "plan",
  "track",
  "create",
  "comment",
  "review",
  "beyond",
] as const;

export default async function McpPage() {
  const locale = (await getLocale()) as Locale;
  const [t, tl] = await Promise.all([
    getTranslations("Mcp"),
    getTranslations("Landing"),
  ]);

  const faqItems = MCP_FAQ_KEYS.map((key) => ({
    key,
    question: t(`faq_${key}_q`),
    answer: t(`faq_${key}_a`),
  }));

  const assistantPrompt = t("assistantPrompt", {
    endpoint: MCP_ENDPOINT,
    guide: `${SITE_URL}/llms.txt`,
  });

  return (
    <>
      <StructuredData variant="mcp" />

      {/* ── Ce que c'est ─────────────────────────────────────────────────── */}
      <section className="pt-24 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("heroTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mb-3 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {t("heroSubtitle")}
          </Reveal>
          <Reveal as="p" delay={0.2} className="max-w-2xl text-sm text-muted-foreground">
            {t("heroNote")}
          </Reveal>

          {/* L'adresse, tout en haut, avec de quoi la copier : c'est la seule
              chose que quelqu'un vient chercher ici sans savoir où la trouver.
              Le transport et le format d'échange ont été retirés — personne
              n'en a besoin pour brancher son agent. */}
          <Reveal
            delay={0.25}
            className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
          >
            <Fact label={t("factEndpoint")}>
              <span className="flex flex-wrap items-center gap-3">
                <code className="font-mono text-xs break-all text-foreground">
                  {MCP_ENDPOINT}
                </code>
                <CopyButton
                  text={MCP_ENDPOINT}
                  label={t("copy")}
                  copiedLabel={t("copied")}
                />
              </span>
            </Fact>
            <Fact label={t("factAuth")}>{t("factAuthValue")}</Fact>
          </Reveal>
        </div>
      </section>

      {/* ── Brancher son agent ───────────────────────────────────────────── */}
      <section id="connect" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("connectTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("connectSubtitle")}
            </Reveal>
          </header>

          {/* `[&>*]:min-w-0` : une commande d'installation ne se coupe pas, et
              un enfant de grille a `min-width: auto` — sans ça la carte
              déborderait de sa piste et ferait défiler la page latéralement. */}
          <RevealGroup
            as="ul"
            step={0.06}
            className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0"
          >
            {MCP_AGENTS.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                copy={t("copy")}
                copied={t("copied")}
                hint={t(`kind_${agent.kind}`)}
                install={t("install", { name: agent.label })}
              />
            ))}
          </RevealGroup>

          {/* Le raccourci, APRÈS les blocs à coller : celui qui sait déjà quoi
              faire trouve sa commande tout de suite, et celui qui ne veut pas
              choisir tombe sur la sortie de secours juste en dessous.

              Un prompt, pas un lien vers `/llms.txt` : ce fichier reste une
              ressource pour les MACHINES, mais le montrer revenait à demander
              au visiteur d'aller le lire. Le prompt l'y envoie sans qu'il ait à
              le savoir. L'adresse et le guide sont INTERPOLÉS depuis
              `lib/site.ts` — un prompt qui contiendrait une URL recopiée serait
              le seul endroit du site à pouvoir désigner un serveur déménagé. */}
          <Reveal className="mt-6 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
            <h3 className="mb-2 font-medium">{t("assistantTitle")}</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {t("assistantBody")}
            </p>
            {/* Empilé, et non le prompt à gauche du bouton : une phrase de
                quarante mots à côté d'un bouton donne, sous 400 px, une colonne
                de texte de trois caractères de large. L'action d'abord, le
                texte qu'elle copie en dessous — on n'a pas besoin de le lire
                pour s'en servir. */}
            <CopyButton
              text={assistantPrompt}
              label={t("copyPrompt")}
              copiedLabel={t("copied")}
            />
            <p className="mt-3 rounded-xl border border-border bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {assistantPrompt}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── L'autorisation ───────────────────────────────────────────────── */}
      <section id="auth" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("authTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("authSubtitle")}
            </Reveal>
          </header>

          <RevealGroup as="ul" step={0.08} className="grid gap-8 sm:grid-cols-3">
            {AUTH_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.key}>
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mb-2 font-medium">{t(`auth_${point.key}_title`)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`auth_${point.key}_body`)}
                  </p>
                </li>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* ── Les outils ───────────────────────────────────────────────────── */}
      <section id="tools" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("toolsTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("toolsSubtitle")}
            </Reveal>
          </header>

          {/* Sept phrases, pas trente-deux noms de fonctions : la liste des
              outils disait la même chose en demandant au lecteur de la
              traduire. Ce sont les clés de la landing — une seule copie. */}
          <RevealGroup as="ul" step={0.06} className="grid gap-3 sm:grid-cols-2">
            {CAPABILITY_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {tl(`agentsCapability_${key}`)}
                </span>
              </li>
            ))}
          </RevealGroup>

        </div>
      </section>

      {/* ── Les parcours ─────────────────────────────────────────────────── */}
      <section id="flows" className="scroll-mt-24 border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("flowsTitle")}
            />
            <Reveal as="p" delay={0.15} className="leading-relaxed text-pretty text-muted-foreground">
              {t("flowsSubtitle")}
            </Reveal>
          </header>

          <RevealGroup as="ol" step={0.1} className="flex flex-col gap-10 [&>*]:min-w-0">
            {FLOW_KEYS.map((key, index) => (
              <li key={key} className="flex gap-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-sm text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="mb-2 text-xl font-semibold tracking-tight">
                    {t(`flow_${key}_title`)}
                  </h3>
                  <p className="mb-4 leading-relaxed text-pretty text-muted-foreground">
                    {t(`flow_${key}_body`)}
                  </p>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground/80">
                    {t("flowPromptLabel")}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <code className="min-w-0 flex-1 font-mono text-xs leading-relaxed text-foreground">
                      {t(`flow_${key}_prompt`)}
                    </code>
                    <CopyButton
                      text={t(`flow_${key}_prompt`)}
                      label={t("copy")}
                      copiedLabel={t("copied")}
                    />
                  </div>
                </div>
              </li>
            ))}
          </RevealGroup>

          <Reveal delay={0.2} className="mt-12">
            <Button asChild size="lg">
              <TrackedCta href="/signup" location="mcp_page">
                {tl("ctaButton")}
                <ArrowRight data-icon="inline-end" />
              </TrackedCta>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── Les trois objections ─────────────────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <h2 className="mb-8 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {tl("faqTitle")}
          </h2>
          <FaqAccordion items={faqItems} />
          <p className="mt-8 text-sm text-muted-foreground">
            <Link
              href={localizedHref("/pricing", locale)}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {tl("navPricing")}
            </Link>
          </p>
        </div>
      </section>

      <SectionCta />
    </>
  );
}

/** Une case de la carte des faits : l'étiquette au-dessus, la valeur en dessous. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background p-5">
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground/80">
        {label}
      </p>
      <p className="text-sm text-foreground">{children}</p>
    </div>
  );
}

/**
 * Le bloc prêt à coller d'un agent.
 *
 * `deeplink` (Cursor) est le seul cas qui ne se copie pas : l'artefact est une
 * URL `cursor://` que le navigateur doit ouvrir. On rend donc un vrai lien —
 * et surtout pas un bloc de code contenant du base64, que personne ne collerait
 * nulle part.
 */
function AgentCard({
  agent,
  copy,
  copied,
  hint,
  install,
}: {
  agent: McpAgent;
  copy: string;
  copied: string;
  hint: string;
  install: string;
}) {
  const artifact = agent.build(MCP_ENDPOINT);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <AgentLogo agent={agent} className="h-5 w-5" />
        <span className="text-sm font-medium">{agent.label}</span>
      </div>

      {agent.kind === "deeplink" ? (
        <a
          href={artifact}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          {install}
        </a>
      ) : (
        <>
          {/* `overflow-x-auto` sur le bloc et non `break-all` : une commande
              coupée au milieu d'un mot se recolle mal quand on la sélectionne
              à la main. */}
          <pre
            className={cn(
              "overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2",
              "font-mono text-xs leading-relaxed text-foreground",
            )}
          >
            <code>{artifact}</code>
          </pre>
          <CopyButton text={artifact} label={copy} copiedLabel={copied} className="w-fit" />
        </>
      )}

      <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </li>
  );
}
