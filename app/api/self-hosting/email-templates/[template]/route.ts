import { isSelfHostingEmailTemplateName, readSelfHostingEmailTemplate } from "@/lib/self-hosting-email-templates";

type RouteContext = { params: Promise<{ template: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { template } = await params;
  if (!isSelfHostingEmailTemplateName(template)) {
    return new Response("Template not found.", { status: 404 });
  }

  return new Response(await readSelfHostingEmailTemplate(template), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
