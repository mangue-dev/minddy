import { afterEach, describe, expect, it } from "vitest";
import {
  desktopFeedBaseUrl,
  dmgEntry,
  dmgForArch,
  formatBytes,
  isLinuxArch,
  isLinuxPackageFormat,
  isMacArch,
  linuxPackageEntry,
  linuxPackageForArch,
  linuxUpdateManifestForArch,
  parseLatestLinuxFeed,
  parseLatestMacFeed,
} from "./update-feed";

/**
 * An ACTUAL `latest-mac.yml`, as electron-builder writes it for two
 * architectures — copied from a release rather than reinvented, because it is
 * exactly the form of the file that is the contract here.
 */
const FEED = `version: 1.2.0
files:
  - url: minddy-1.2.0-arm64.dmg
    sha512: TFNQaGZ2VXpEZw==
    size: 104857600
  - url: minddy-1.2.0-arm64-mac.zip
    sha512: TFNQaGZ2VXpEZw==
    size: 101857600
  - url: minddy-1.2.0.dmg
    sha512: TFNQaGZ2VXpEZw==
    size: 109857600
  - url: minddy-1.2.0-mac.zip
    sha512: TFNQaGZ2VXpEZw==
    size: 106857600
path: minddy-1.2.0-arm64.dmg
sha512: TFNQaGZ2VXpEZw==
releaseDate: '2026-08-13T09:12:44.113Z'
`;

const LINUX_FEED = `version: 1.2.0
files:
  - url: minddy-1.2.0-arm64.AppImage
    sha512: appimage
    size: 120000000
  - url: minddy-1.2.0-arm64.deb
    sha512: deb
    size: 110000000
  - url: minddy-1.2.0-arm64.rpm
    sha512: rpm
    size: 110000000
  - url: minddy-1.2.0.AppImage
    sha512: appimage
    size: 120000000
  - url: minddy-1.2.0.deb
    sha512: deb
    size: 110000000
  - url: minddy-1.2.0.rpm
    sha512: rpm
    size: 110000000
`;

describe("parseLatestMacFeed", () => {
  it("lit la version et les quatre fichiers", () => {
    const release = parseLatestMacFeed(FEED);
    expect(release?.version).toBe("1.2.0");
    expect(release?.files).toHaveLength(4);
  });

  it("infers the architecture from the NAME — the manifest does not carry it", () => {
    const release = parseLatestMacFeed(FEED);
    expect(release?.files.map((file) => [file.name, file.arch, file.kind])).toEqual([
      ["minddy-1.2.0-arm64.dmg", "arm64", "dmg"],
      ["minddy-1.2.0-arm64-mac.zip", "arm64", "zip"],
      ["minddy-1.2.0.dmg", "x64", "dmg"],
      ["minddy-1.2.0-mac.zip", "x64", "zip"],
    ]);
  });

  it("lit la TAILLE de chaque fichier — la page l'affiche plutôt qu'un poids en dur", () => {
    const release = parseLatestMacFeed(FEED);
    expect(release?.files.map((file) => file.size)).toEqual([
      104857600, 101857600, 109857600, 106857600,
    ]);
  });

  it("rend `null` sur une taille absente plutôt que NaN", () => {
    const release = parseLatestMacFeed("version: 1.0.0\nfiles:\n  - url: minddy.dmg\n    sha512: x\n");
    expect(release?.files[0].size).toBeNull();
  });

  // `path:` repeats the first file at the end of the manifest, but without the key
  // `url:` — so he cannot enter. Deduplication keeps the list
  // just if one day the generator writes the same entry twice.
  it("never returns the same file twice", () => {
    const release = parseLatestMacFeed(FEED);
    expect(release?.files.filter((f) => f.name === "minddy-1.2.0-arm64.dmg")).toHaveLength(1);
    const twice = parseLatestMacFeed(
      "version: 1.0.0\nfiles:\n  - url: minddy.dmg\n  - url: minddy.dmg\n"
    );
    expect(twice?.files).toHaveLength(1);
  });

  it("rend `null` sur un flux vide, tronqué, ou sans fichier lisible", () => {
    expect(parseLatestMacFeed("")).toBeNull();
    expect(parseLatestMacFeed("version: 1.2.0\n")).toBeNull();
    expect(parseLatestMacFeed("files:\n  - url: minddy.dmg\n")).toBeNull();
    expect(parseLatestMacFeed("<html>404</html>")).toBeNull();
  });

  it("ignore ce qui n'est ni `.dmg` ni `.zip` — un `.blockmap` n'est pas un livrable", () => {
    const release = parseLatestMacFeed(
      "version: 1.0.0\nfiles:\n  - url: minddy-1.0.0-arm64.dmg\n  - url: minddy-1.0.0-arm64.dmg.blockmap\n"
    );
    expect(release?.files.map((f) => f.name)).toEqual(["minddy-1.0.0-arm64.dmg"]);
  });
});

describe("formatBytes", () => {
  it("counts in DECIMAL megabytes, like Finder", () => {
    expect(formatBytes(119370561, "fr")).toBe("119 Mo");
    expect(formatBytes(119370561, "en")).toBe("119 MB");
  });
});

describe("dmgEntry", () => {
  it("rend le fichier ET sa taille", () => {
    const release = parseLatestMacFeed(FEED)!;
    expect(dmgEntry(release, "arm64")).toMatchObject({
      name: "minddy-1.2.0-arm64.dmg",
      size: 104857600,
    });
  });
});

describe("dmgForArch", () => {
  it("sert le `.dmg`, jamais le `.zip` — celui-là est pour Squirrel", () => {
    const release = parseLatestMacFeed(FEED)!;
    expect(dmgForArch(release, "arm64")).toBe("minddy-1.2.0-arm64.dmg");
    expect(dmgForArch(release, "x64")).toBe("minddy-1.2.0.dmg");
  });

  it("rend `null` quand l'architecture demandée n'a pas été publiée", () => {
    const release = parseLatestMacFeed(
      "version: 1.0.0\nfiles:\n  - url: minddy-1.0.0-arm64.dmg\n"
    )!;
    expect(dmgForArch(release, "x64")).toBeNull();
  });
});

describe("isMacArch", () => {
  it("n'accepte que les deux qu'on publie", () => {
    expect(isMacArch("arm64")).toBe(true);
    expect(isMacArch("x64")).toBe(true);
    expect(isMacArch("universal")).toBe(false);
    expect(isMacArch(null)).toBe(false);
  });
});

describe("parseLatestLinuxFeed", () => {
  it("reads every supported Linux package format for its architecture", () => {
    const release = parseLatestLinuxFeed(LINUX_FEED);
    expect(release?.version).toBe("1.2.0");
    expect(release?.files).toHaveLength(6);
    expect(linuxPackageEntry(release!, "AppImage", "arm64")).toMatchObject({
      name: "minddy-1.2.0-arm64.AppImage",
      size: 120000000,
    });
    expect(linuxPackageForArch(release!, "rpm", "x64")).toBe("minddy-1.2.0.rpm");
  });

  it("rejects incomplete or unrelated manifests", () => {
    expect(parseLatestLinuxFeed("version: 1.2.0\nfiles:\n  - url: minddy.zip\n")).toBeNull();
  });
});

describe("Linux feed selectors", () => {
  it("accepts only the published architectures and formats", () => {
    expect(isLinuxArch("arm64")).toBe(true);
    expect(isLinuxArch("x64")).toBe(true);
    expect(isLinuxArch("armv7l")).toBe(false);
    expect(isLinuxPackageFormat("AppImage")).toBe(true);
    expect(isLinuxPackageFormat("deb")).toBe(true);
    expect(isLinuxPackageFormat("rpm")).toBe(true);
    expect(isLinuxPackageFormat("zip")).toBe(false);
  });

  it("selects the manifest that electron-builder gives each Linux architecture", () => {
    expect(linuxUpdateManifestForArch("x64")).toBe("latest-linux.yml");
    expect(linuxUpdateManifestForArch("arm64")).toBe("latest-linux-arm64.yml");
  });
});

describe("desktopFeedBaseUrl", () => {
  const initial = process.env.MINDDY_DESKTOP_FEED_URL;
  afterEach(() => {
    if (initial === undefined) delete process.env.MINDDY_DESKTOP_FEED_URL;
    else process.env.MINDDY_DESKTOP_FEED_URL = initial;
  });

  it("removes the trailing slash — manifest names are relative", () => {
    process.env.MINDDY_DESKTOP_FEED_URL = "https://blob.example.com/desktop/";
    expect(desktopFeedBaseUrl()).toBe("https://blob.example.com/desktop");
  });

  it("rend `null` quand elle est absente ou vide, plutôt qu'une URL de rien", () => {
    process.env.MINDDY_DESKTOP_FEED_URL = "   ";
    expect(desktopFeedBaseUrl()).toBeNull();
    delete process.env.MINDDY_DESKTOP_FEED_URL;
    expect(desktopFeedBaseUrl()).toBeNull();
  });
});
