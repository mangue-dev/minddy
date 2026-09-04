"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "mangue-ui";
import { Layers, LoaderCircle, X } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { useScrollFade } from "@/lib/use-scroll-fade";
import type {
  RepositorySkill,
  RepositorySkillSummary,
} from "@/lib/repository-skills";

export function SkillPreviewDialog({
  skill,
  open,
  onOpenChange,
  loadSkill,
}: {
  skill: RepositorySkillSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadSkill: (skill: RepositorySkillSummary) => Promise<RepositorySkill | null>;
}) {
  const t = useTranslations("Assistant");
  const tc = useTranslations("Common");
  const [loaded, setLoaded] = useState<RepositorySkill | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>();

  useEffect(() => {
    if (!open || !skill) return;
    let active = true;
    setLoaded(null);
    setFailed(false);
    setLoading(true);
    void loadSkill(skill)
      .then((result) => {
        if (!active) return;
        setLoaded(result);
        setFailed(result === null);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSkill, open, skill]);

  if (!skill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
      >
        <div className="absolute top-3.5 right-3.5 z-30">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tc("close")}
            onClick={() => onOpenChange(false)}
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div
          ref={fadeRef}
          {...scrollProps}
          className="flex flex-1 flex-col overflow-y-auto px-6 pt-14 pb-12 sm:pt-20"
        >
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Layers className="size-5" aria-hidden />
            </div>
            <DialogTitle className="text-3xl leading-[1.05] font-semibold tracking-tighter text-balance">
              {skill.name}
            </DialogTitle>
            <DialogDescription className="mt-2 font-mono text-xs break-all text-muted-foreground">
              {skill.path}
            </DialogDescription>

            {loading ? (
              <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                <span>{t("skillPreviewLoading")}</span>
              </div>
            ) : failed || !loaded ? (
              <p className="mt-10 text-sm text-destructive">
                {t("skillPreviewError")}
              </p>
            ) : (
              <div className="mt-8 border-t border-border pt-8">
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {loaded.description}
                </p>
                <Markdown className="[&_h1]:text-2xl [&_h2]:mt-8 [&_h2]:text-xl [&_h3]:mt-6 [&_h3]:text-lg">
                  {loaded.content}
                </Markdown>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
