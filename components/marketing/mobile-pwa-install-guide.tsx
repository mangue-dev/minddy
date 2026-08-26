"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Ellipsis,
  Menu,
  Share,
  Smartphone,
  SquarePlus,
} from "lucide-react";
import {
  resolveInstallPlatform,
  type InstallPlatform,
} from "@/lib/desktop/install-prompt";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

export interface MobileInstallGuideCopy {
  iosEyebrow: string;
  iosTitle: string;
  iosBody: string;
  iosStepShareTitle: string;
  iosStepShareBody: string;
  iosStepHomeTitle: string;
  iosStepHomeBody: string;
  iosStepAddTitle: string;
  iosStepAddBody: string;
  androidEyebrow: string;
  androidTitle: string;
  androidBody: string;
  androidStepPromptTitle: string;
  androidStepPromptBody: string;
  androidStepMenuTitle: string;
  androidStepMenuBody: string;
  uiShare: string;
  uiAddToHome: string;
  uiOpenAsWebApp: string;
  uiAdd: string;
  uiCancel: string;
  uiInstallApp: string;
  uiInstall: string;
  uiNotNow: string;
  uiCopy: string;
  uiSettings: string;
}

function GuideCard({
  number,
  title,
  body,
  children,
}: {
  number: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="mt-auto overflow-hidden rounded-[1.35rem] border border-black/10 bg-[#f2f2f7] text-[#1c1c1e] shadow-inner dark:border-white/10">
        {children}
      </div>
    </li>
  );
}

function SafariShareVisual({ copy }: { copy: MobileInstallGuideCopy }) {
  return (
    <div aria-hidden className="relative h-64 bg-white">
      <div className="px-4 pt-5">
        <div className="mx-auto size-12 overflow-hidden rounded-xl shadow-sm ring-1 ring-black/10">
          <Image src="/web-app-manifest-192x192.png" alt="" width={48} height={48} />
        </div>
        <p className="mt-3 text-center text-sm font-semibold">minddy</p>
        <div className="mx-auto mt-2 h-2 w-3/4 rounded-full bg-black/5" />
        <div className="mx-auto mt-2 h-2 w-1/2 rounded-full bg-black/5" />
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-black/10 bg-white/95 px-3 pt-3 pb-4 backdrop-blur">
        <div className="mb-3 flex h-9 items-center justify-center rounded-xl bg-[#eeeeef] text-[11px] text-[#636366]">
          minddy.app
        </div>
        <div className="flex items-center justify-around text-[#007aff]">
          <span className="size-5 rounded-md border-2 border-current opacity-55" />
          <span className="rounded-lg bg-[#007aff]/10 p-1.5 ring-2 ring-[#007aff]/20">
            <Share className="size-5" />
          </span>
          <span className="size-5 rounded-full border-2 border-current opacity-55" />
          <Ellipsis className="size-5 opacity-55" />
        </div>
        <p className="mt-2 text-center text-[10px] font-semibold text-[#007aff]">{copy.uiShare}</p>
      </div>
    </div>
  );
}

function IosShareSheetVisual({ copy }: { copy: MobileInstallGuideCopy }) {
  return (
    <div aria-hidden className="relative h-64 bg-gradient-to-b from-[#dfe8f4] to-[#b9c2cf] p-2 pt-10">
      <div className="h-full rounded-t-[1.5rem] bg-[#f7f7f8]/95 px-3 pt-2 shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15" />
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm">
          <Image
            src="/web-app-manifest-192x192.png"
            alt=""
            width={36}
            height={36}
            className="rounded-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">minddy</p>
            <p className="truncate text-[10px] text-[#8e8e93]">minddy.app</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-black/10 px-3 py-3 text-xs text-[#3a3a3c]">
            <span className="size-5 rounded-md border border-current opacity-50" />
            <span className="opacity-60">{copy.uiCopy}</span>
          </div>
          <div className="flex items-center gap-3 bg-[#007aff]/8 px-3 py-3 text-xs font-semibold text-[#007aff] ring-2 ring-inset ring-[#007aff]/20">
            <SquarePlus className="size-5" />
            <span>{copy.uiAddToHome}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IosAddVisual({ copy }: { copy: MobileInstallGuideCopy }) {
  return (
    <div aria-hidden className="h-64 bg-[#f2f2f7] px-3 pt-3">
      <div className="flex items-center justify-between text-xs font-medium text-[#007aff]">
        <span>{copy.uiCancel}</span>
        <span className="text-sm font-semibold text-[#1c1c1e]">{copy.uiAddToHome}</span>
        <span className="font-semibold">{copy.uiAdd}</span>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Image
          src="/web-app-manifest-192x192.png"
          alt=""
          width={54}
          height={54}
          className="rounded-xl shadow-sm ring-1 ring-black/10"
        />
        <div>
          <p className="text-sm font-semibold">minddy</p>
          <p className="mt-1 text-[10px] text-[#8e8e93]">https://www.minddy.app</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-xl bg-white px-3 py-3 text-xs shadow-sm">
        <span>{copy.uiOpenAsWebApp}</span>
        <span className="flex h-5 w-9 items-center justify-end rounded-full bg-[#34c759] p-0.5">
          <span className="size-4 rounded-full bg-white shadow" />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[10px] leading-relaxed text-[#636366]">
        <Check className="size-4 shrink-0 text-[#34c759]" />
        <span>{copy.uiAdd}</span>
      </div>
    </div>
  );
}

function AndroidPromptVisual({ copy }: { copy: MobileInstallGuideCopy }) {
  return (
    <div aria-hidden className="relative h-64 overflow-hidden bg-[#e8eaed]">
      <Image
        src="/captures/heroBoard-en-light.webp"
        alt=""
        fill
        sizes="360px"
        className="object-cover opacity-45"
      />
      <div className="absolute inset-x-2 bottom-2 rounded-[1.5rem] bg-white p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <Image
            src="/web-app-manifest-192x192.png"
            alt=""
            width={44}
            height={44}
            className="rounded-xl"
          />
          <div>
            <p className="text-sm font-semibold">{copy.uiInstallApp}</p>
            <p className="text-xs text-[#5f6368]">minddy.app</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#5f6368]">minddy</p>
        <div className="mt-4 flex justify-end gap-2 text-xs font-semibold">
          <span className="rounded-full px-3 py-2 text-[#1a73e8]">{copy.uiNotNow}</span>
          <span className="rounded-full bg-[#1a73e8] px-4 py-2 text-white">{copy.uiInstall}</span>
        </div>
      </div>
    </div>
  );
}

function AndroidMenuVisual({ copy }: { copy: MobileInstallGuideCopy }) {
  return (
    <div aria-hidden className="relative h-64 bg-white p-3">
      <div className="flex items-center gap-2 rounded-full bg-[#f1f3f4] px-3 py-2 text-[10px] text-[#5f6368]">
        <span className="size-3 rounded-full border border-[#5f6368]" />
        <span className="flex-1">minddy.app</span>
        <Ellipsis className="size-4" />
      </div>
      <div className="absolute top-12 right-3 w-48 overflow-hidden rounded-xl bg-white py-1 shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center gap-3 px-4 py-3 text-xs text-[#3c4043]">
          <Share className="size-4" />
          <span>{copy.uiShare}</span>
        </div>
        <div className="flex items-center gap-3 bg-[#1a73e8]/8 px-4 py-3 text-xs font-semibold text-[#1a73e8] ring-2 ring-inset ring-[#1a73e8]/15">
          <Smartphone className="size-4" />
          <span>{copy.uiInstallApp}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 text-xs text-[#3c4043]">
          <Menu className="size-4" />
          <span>{copy.uiSettings}</span>
        </div>
      </div>
    </div>
  );
}

export function MobilePwaInstallGuide({ copy }: { copy: MobileInstallGuideCopy }) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    const resolved = resolveInstallPlatform({
      uaDataPlatform: (navigator as NavigatorWithUserAgentData).userAgentData?.platform,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    setPlatform(resolved);

    if ((resolved === "ios" || resolved === "android") && location.hash === "#mobile-install-guide") {
      requestAnimationFrame(() => {
        document.getElementById("mobile-install-guide")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, []);

  if (platform !== "ios" && platform !== "android") {
    return <div id="mobile-install-guide" className="scroll-mt-24" />;
  }

  const ios = platform === "ios";

  return (
    <section id="mobile-install-guide" className="scroll-mt-24 border-y border-border bg-muted/20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {ios ? copy.iosEyebrow : copy.androidEyebrow}
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {ios ? copy.iosTitle : copy.androidTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-pretty text-muted-foreground">
            {ios ? copy.iosBody : copy.androidBody}
          </p>
        </header>

        {ios ? (
          <ol className="grid gap-4 md:grid-cols-3">
            <GuideCard number={1} title={copy.iosStepShareTitle} body={copy.iosStepShareBody}>
              <SafariShareVisual copy={copy} />
            </GuideCard>
            <GuideCard number={2} title={copy.iosStepHomeTitle} body={copy.iosStepHomeBody}>
              <IosShareSheetVisual copy={copy} />
            </GuideCard>
            <GuideCard number={3} title={copy.iosStepAddTitle} body={copy.iosStepAddBody}>
              <IosAddVisual copy={copy} />
            </GuideCard>
          </ol>
        ) : (
          <ol className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
            <GuideCard number={1} title={copy.androidStepPromptTitle} body={copy.androidStepPromptBody}>
              <AndroidPromptVisual copy={copy} />
            </GuideCard>
            <GuideCard number={2} title={copy.androidStepMenuTitle} body={copy.androidStepMenuBody}>
              <AndroidMenuVisual copy={copy} />
            </GuideCard>
          </ol>
        )}
      </div>
    </section>
  );
}
