import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { ProjectSetupResume } from "@/components/project-setup-resume";

// Titles the project board (and any sub-page without its own layout) with the
// project's name, e.g. "Acme · minddy". Falls back to a generic localized label
// if the project can't be read (RLS, not found, transient error).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("Meta");
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("projects")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    return { title: data?.name || t("project") };
  } catch {
    return { title: t("project") };
  }
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Rouvre le wizard de création au retour d'un redirect git (?setup=git). */}
      <Suspense fallback={null}>
        <ProjectSetupResume />
      </Suspense>
      {children}
    </>
  );
}
