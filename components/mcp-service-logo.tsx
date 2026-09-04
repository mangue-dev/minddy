import { Plug } from "lucide-react";
import { cn } from "mangue-ui";
import { BrandLogo, type BrandMark } from "@/components/brand-logo";

// Official provider assets and provenance: public/mcp-providers/sources.json.
const marks: Record<string, BrandMark> = {
  notion: { logo: "/mcp-providers/notion.png" },
  linear: { logo: "/mcp-providers/linear.svg" },
  github: {
    logo: "/mcp-providers/github.svg",
    logoDark: "/mcp-providers/github-dark.svg",
  },
  slack: { logo: "/mcp-providers/slack.png" },
  figma: { logo: "/mcp-providers/figma.svg" },
  asana: { logo: "/mcp-providers/asana.ico" },
  sentry: { logo: "/mcp-providers/sentry.ico" },
  supabase: { logo: "/mcp-providers/supabase.png" },
  vercel: { logo: "/mcp-providers/vercel.png" },
  stripe: { logo: "/mcp-providers/stripe.svg" },
  "google-gmail": { logo: "/mcp-providers/google-gmail.svg" },
  "google-drive": { logo: "/mcp-providers/google-drive.svg" },
  "google-calendar": { logo: "/mcp-providers/google-calendar.svg" },
  "google-docs": { logo: "/mcp-providers/google-docs.svg" },
  "google-sheets": { logo: "/mcp-providers/google-sheets.svg" },
  "google-slides": { logo: "/mcp-providers/google-slides.svg" },
  "google-chat": { logo: "/mcp-providers/google-chat.svg" },
  "google-people": { logo: "/mcp-providers/google-people.svg" },
  canva: { logo: "/mcp-providers/canva.svg" },
  atlassian: { logo: "/mcp-providers/atlassian.svg" },
};

export function McpServiceLogo({
  service,
  className,
}: {
  service?: string;
  className?: string;
}) {
  const mark = service ? marks[service] : undefined;
  if (!mark)
    return (
      <Plug
        aria-hidden
        className={cn("size-5 shrink-0 text-muted-foreground", className)}
      />
    );
  return (
    <BrandLogo
      brand={mark}
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
