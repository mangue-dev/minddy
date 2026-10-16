import { expect, it } from "vitest";
import { signInRedirectAfterSignOut } from "./signed-out-redirect";

it("returns protected screens to sign-in with their path and leaves public pages alone", () => {
  expect(signInRedirectAfterSignOut("/home", "")).toBe("/login?redirect=%2Fhome&session=expired");
  expect(signInRedirectAfterSignOut("/pull-requests", "?pr=1")).toBe("/login?redirect=%2Fpull-requests%3Fpr%3D1&session=expired");
  expect(signInRedirectAfterSignOut("/home", "", { expired: false })).toBe("/login?redirect=%2Fhome");
  expect(signInRedirectAfterSignOut("/", "")).toBeNull();
  expect(signInRedirectAfterSignOut("/login", "")).toBeNull();
});
