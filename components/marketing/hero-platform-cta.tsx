"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { isMacPlatform } from "@/lib/desktop/install-prompt";
import { TrackedCta } from "./tracked-cta";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

export function HeroPlatformCta({
  downloadHref,
  downloadLabel,
  browserLabel,
}: {
  downloadHref: string;
  downloadLabel: string;
  browserLabel: string;
}) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      isMacPlatform({
        uaDataPlatform: (navigator as NavigatorWithUserAgentData).userAgentData?.platform,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
    );
  }, []);

  if (isMac) {
    return (
      <Button asChild size="lg">
        <a href={downloadHref}>
          <Download data-icon="inline-start" />
          {downloadLabel}
        </a>
      </Button>
    );
  }

  return (
    <Button asChild size="lg">
      <TrackedCta href="/signup" location="hero">
        {browserLabel}
      </TrackedCta>
    </Button>
  );
}
