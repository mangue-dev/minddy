import { describe, expect, it } from "vitest";

import {
  deviceLabelFromUserAgent,
  isMobileDeviceLabel,
  UNKNOWN_DEVICE_LABEL,
} from "./device-label";

/**
 * Des user-agents RÉELS, et pas des chaînes minimales : tout l'intérêt du test
 * est là. Chaque famille de navigateurs se fait passer pour les précédentes
 * (Edge dit « Chrome » et « Safari », Chrome dit « Safari », un Android dit
 * aussi « Linux ») — un ordre de tests inversé rendrait « Safari sur Linux »
 * pour un Chrome Android, sans que rien ne le signale.
 */
const CASES: readonly [label: string, ua: string, expected: string][] = [
  [
    "Safari sur iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Safari sur iPhone",
  ],
  [
    "Chrome sur Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
    "Chrome sur Android",
  ],
  [
    "Chrome sur macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Chrome sur macOS",
  ],
  [
    "Safari sur macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Safari sur macOS",
  ],
  [
    "Firefox sur Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Firefox sur Windows",
  ],
  [
    "Edge sur Windows",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68",
    "Edge sur Windows",
  ],
  [
    "Firefox sur Linux",
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Firefox sur Linux",
  ],
  [
    "Safari sur iPad",
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Safari sur iPad",
  ],
];

describe("deviceLabelFromUserAgent", () => {
  it.each(CASES)("%s", (_label, ua, expected) => {
    expect(deviceLabelFromUserAgent(ua)).toBe(expected);
  });

  it("retombe sur un libellé neutre sans user-agent exploitable", () => {
    expect(deviceLabelFromUserAgent(null)).toBe(UNKNOWN_DEVICE_LABEL);
    expect(deviceLabelFromUserAgent("")).toBe(UNKNOWN_DEVICE_LABEL);
    expect(deviceLabelFromUserAgent("   ")).toBe(UNKNOWN_DEVICE_LABEL);
    expect(deviceLabelFromUserAgent("curl/8.4.0")).toBe(UNKNOWN_DEVICE_LABEL);
  });

  it("se contente de ce qu'il reconnaît quand l'autre moitié manque", () => {
    expect(deviceLabelFromUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows");
  });
});

describe("isMobileDeviceLabel", () => {
  it("reconnaît les appareils de poche à leur libellé", () => {
    expect(isMobileDeviceLabel("Safari sur iPhone")).toBe(true);
    expect(isMobileDeviceLabel("Chrome sur Android")).toBe(true);
    expect(isMobileDeviceLabel("Safari sur iPad")).toBe(true);
    expect(isMobileDeviceLabel("Chrome sur macOS")).toBe(false);
    expect(isMobileDeviceLabel(UNKNOWN_DEVICE_LABEL)).toBe(false);
    expect(isMobileDeviceLabel(null)).toBe(false);
  });
});
