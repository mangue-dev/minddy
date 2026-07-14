import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { listUserConnections } from "@/lib/server/git/connections";
import {
  ACTIVE_PROVIDERS,
  type RepoProviderId,
} from "@/lib/repo-providers";
import { isGithubAppConfigured } from "@/lib/server/git/github-app";
import { isGitlabConfigured } from "@/lib/server/git/gitlab-app";

function isProviderConfigured(provider: RepoProviderId): boolean {
  return provider === "github" ? isGithubAppConfigured() : isGitlabConfigured();
}

/** GET /api/account/git-connections — les connexions git du compte (sanitisées). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const connections = await listUserConnections(auth.user.id);
  if (!connections) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  const providers = ACTIVE_PROVIDERS.map((p) => ({
    id: p.id,
    configured: isProviderConfigured(p.id),
  }));
  return NextResponse.json({ connections, providers });
}
