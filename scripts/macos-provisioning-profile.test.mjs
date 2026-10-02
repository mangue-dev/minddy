import assert from "node:assert/strict";
import test from "node:test";
import { requireMacProfileAuthorization } from "./macos-provisioning-profile.mjs";

function authorized() {
  const entitlements = {
    "com.apple.application-identifier": "TEAM.app.minddy.desktop",
    "com.apple.developer.team-identifier": "TEAM",
    "com.apple.developer.aps-environment": "production",
  };
  return {
    bundleId: "app.minddy.desktop", teamId: "TEAM", entitlements,
    certificateSha256: "certificate", now: new Date("2026-09-30"),
    profile: { allDevices: true, expires: "2040-01-01", entitlements: { ...entitlements }, certificates: ["certificate"] },
  };
}

test("accepts an embedded Developer ID profile authorizing fresh installations", () => {
  assert.doesNotThrow(() => requireMacProfileAuthorization(authorized()));
});

test("rejects missing, expired, and device-limited profiles despite a valid code signature", () => {
  for (const profile of [undefined, { ...authorized().profile, expires: "2020-01-01" },
    { ...authorized().profile, allDevices: false }]) {
    assert.throws(() => requireMacProfileAuthorization({ ...authorized(), profile }), /missing, expired, or device-limited/);
  }
});

test("rejects profiles from another app, team, APNs environment, or certificate", () => {
  for (const key of Object.keys(authorized().entitlements)) {
    const input = authorized();
    input.profile.entitlements[key] = "other";
    assert.throws(() => requireMacProfileAuthorization(input), /does not authorize/);
  }
  assert.throws(() => requireMacProfileAuthorization({ ...authorized(), certificateSha256: "other" }), /signing certificate/);
});

test("rejects signed entitlements that do not match the profile's grant", () => {
  const input = authorized();
  delete input.entitlements["com.apple.application-identifier"];
  assert.throws(() => requireMacProfileAuthorization(input), /does not authorize/);
});
