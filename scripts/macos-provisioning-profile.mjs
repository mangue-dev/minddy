import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const APNS = "com.apple.developer.aps-environment";
const APP_ID = "com.apple.application-identifier";
const TEAM_ID = "com.apple.developer.team-identifier";

/** Verify authorization independently of profiles installed on the build Mac. */
export function requireMacProfileAuthorization({
  bundleId, teamId, entitlements, profile, certificateSha256, now = new Date(),
}) {
  if (!profile?.allDevices || !Number.isFinite(Date.parse(profile.expires)) ||
      Date.parse(profile.expires) <= now.getTime()) {
    throw new Error("The embedded Developer ID provisioning profile is missing, expired, or device-limited.");
  }
  const appId = `${teamId}.${bundleId}`;
  for (const [key, expected] of [[APP_ID, appId], [TEAM_ID, teamId], [APNS, "production"]]) {
    if (entitlements[key] !== expected || profile.entitlements[key] !== expected) {
      throw new Error(`The embedded profile does not authorize the signed application's ${key}.`);
    }
  }
  if (!profile.certificates.includes(certificateSha256)) {
    throw new Error("The embedded profile does not authorize the application's signing certificate.");
  }
}

/** Decode the signed profile with Apple's tools and compare its actual grant. */
export async function verifyMacProvisioningProfile(app) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "minddy-macos-profile-"));
  try {
    const profileFile = path.join(app, "Contents", "embedded.provisionprofile");
    const decoded = path.join(temp, "profile.plist");
    const signedEntitlements = path.join(temp, "entitlements.plist");
    const { stdout: profileXml } = await exec("security", ["cms", "-D", "-i", profileFile]);
    await writeFile(decoded, profileXml, { mode: 0o600 });
    const { stdout: entitlementsXml } = await exec("codesign", ["-d", "--entitlements", ":-", app]);
    await writeFile(signedEntitlements, entitlementsXml, { mode: 0o600 });
    const extract = async (file, key, format) =>
      (await exec("plutil", ["-extract", key, format, "-o", "-", file])).stdout.trim();
    const { stderr: metadata } = await exec("codesign", ["-dv", "--verbose=4", app]);
    const bundleId = /^Identifier=(.+)$/m.exec(metadata)?.[1];
    const teamId = /^TeamIdentifier=(.+)$/m.exec(metadata)?.[1];
    if (!bundleId || !teamId || teamId === "not set") throw new Error("The application has no Developer ID identity.");
    const certificatePrefix = path.join(temp, "certificate-");
    await exec("codesign", ["-d", `--extract-certificates=${certificatePrefix}`, app]);
    const certificatesXml = await extract(decoded, "DeveloperCertificates", "xml1");
    const certificates = [...certificatesXml.matchAll(/<data>([\s\S]*?)<\/data>/g)].map(([, data]) =>
      createHash("sha256").update(Buffer.from(data.replace(/\s/g, ""), "base64")).digest("hex"));
    requireMacProfileAuthorization({
      bundleId, teamId,
      certificateSha256: createHash("sha256").update(await readFile(`${certificatePrefix}0`)).digest("hex"),
      entitlements: JSON.parse((await exec("plutil", ["-convert", "json", "-o", "-", signedEntitlements])).stdout),
      profile: {
        allDevices: (await extract(decoded, "ProvisionsAllDevices", "raw")) === "true",
        expires: await extract(decoded, "ExpirationDate", "raw"),
        entitlements: JSON.parse(await extract(decoded, "Entitlements", "json")),
        certificates,
      },
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
