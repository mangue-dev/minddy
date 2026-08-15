import { describe, expect, it } from "vitest";

import {
  isPushInstallationId,
  nativePushAllowedFromStored,
} from "./push-installation";

describe("isPushInstallationId", () => {
  it("accepte un UUID stable d'installation", () => {
    expect(isPushInstallationId("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("refuse une chaîne arbitraire de même longueur", () => {
    expect(isPushInstallationId("------------------------------------")).toBe(false);
    expect(isPushInstallationId(null)).toBe(false);
  });
});

describe("nativePushAllowedFromStored", () => {
  it("exige un opt-in explicite", () => {
    expect(nativePushAllowedFromStored("1\n")).toBe(true);
    expect(nativePushAllowedFromStored("0\n")).toBe(false);
    expect(nativePushAllowedFromStored(undefined)).toBe(false);
  });
});
