/** Shared validation for prepared releases, publication, backfill, and server reads. */
export const CHANGELOG_LOCALES = ["en", "fr", "de", "pt-BR", "it", "es"];
export const MAX_RELEASE_BYTES = 192 * 1024;
export const MAX_PAGE_BYTES = 48 * 1024;
const NAMES = ["shield", "board", "assistant", "pages", "connections", "activity", "desktop"];
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid changelog: ${message}`);
}
function keys(value, allowed, field) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${field} must be an object`);
  assert(Object.keys(value).every(key => allowed.includes(key)), `${field} contains unknown fields`);
}
function text(value, max, field) {
  assert(typeof value === "string" && value.trim() && value.length <= max, `${field} must contain 1–${max} characters`);
  assert(!value.includes("—"), `${field} must not contain an em dash`);
}
function copy(value, detail = false) {
  assert(value && typeof value === "object", "localized copy is required");
  assert(Object.keys(value).sort().join() === [...CHANGELOG_LOCALES].sort().join(), "provide exactly the six supported locales");
  for (const locale of CHANGELOG_LOCALES) {
    const c = value[locale];
    keys(c, detail ? ["title", "summary", "details"] : ["title", "summary"], `${locale} copy`);
    text(c.title, 90, `${locale}.title`);
    text(c.summary, 320, `${locale}.summary`);
    if (detail) {
      assert(Array.isArray(c.details) && c.details.length >= 1 && c.details.length <= 6, `${locale}.details needs 1–6 paragraphs`);
      c.details.forEach(p => text(p, 1200, `${locale}.details`));
    }
  }
}
function publication(value) {
  assert(typeof value.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.publishedAt)
    && Number.isFinite(Date.parse(value.publishedAt))
    && new Date(value.publishedAt).toISOString().replace(".000Z", "Z") === value.publishedAt.replace(".000Z", "Z"), "publication requires an ISO timestamp");
  assert(/^[a-f0-9]{40}$/.test(value.sha), "publication requires the production SHA");
  assert(Number.isSafeInteger(value.deploymentId) && value.deploymentId > 0, "publication requires a successful production deployment ID");
}
export function validateDraft(value) {
  keys(value, ["version", "layout", "copy", "features", "evidence", "publishedAt", "sha", "deploymentId"], "release");
  assert(value && VERSION_PATTERN.test(value.version), "version must be stable SemVer");
  assert(["compact", "bento"].includes(value.layout), "layout must be compact or bento");
  copy(value.copy);
  assert(Array.isArray(value.features) && value.features.length <= 64, "at most 64 features per release");
  assert(value.layout !== "bento" || value.features.length >= 2, "a bento needs at least two features");
  const ids = new Set();
  for (const f of value.features) {
    keys(f, ["id", "illustration", "copy"], "feature");
    assert(typeof f.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.id) && !ids.has(f.id), "feature IDs must be unique stable slugs");
    ids.add(f.id);
    copy(f.copy, true);
    const i = f.illustration;
    assert(i && ["code", "icon", "image"].includes(i.kind), "feature illustration is required");
    keys(i, i.kind === "image" ? ["kind", "url", "width", "height"] : ["kind", "name"], "illustration");
    if (i.kind === "image") {
      const url = new URL(i.url);
      assert(url.protocol === "https:" && !url.username && !url.password, "images must use external HTTPS URLs");
      assert(Number.isSafeInteger(i.width) && i.width >= 200 && i.width <= 1600
        && Number.isSafeInteger(i.height) && i.height >= 100 && i.height <= 1600, "image dimensions must be bounded");
    } else assert(NAMES.includes(i.name), "unknown illustration name");
  }
  keys(value.evidence, ["commits", "issues"], "evidence");
  assert(value.evidence && Array.isArray(value.evidence.commits) && value.evidence.commits.length > 0
    && value.evidence.commits.every(c => /^[a-f0-9]{40}$/.test(c)), "record the shipped commit SHAs");
  assert(Array.isArray(value.evidence.issues) && value.evidence.issues.every(i => /^[A-Z]+-\d+$/.test(i)), "issue evidence must use identifiers");
  assert(Buffer.byteLength(JSON.stringify(value)) <= MAX_RELEASE_BYTES, "release exceeds the 192 KiB content budget");
  return value;
}
export function validateRelease(value) {
  validateDraft(value);
  publication(value);
  return value;
}
export function toIndexEntry(release) {
  const { version, layout, copy, publishedAt, sha, deploymentId, features } = validateRelease(release);
  return { version, layout, copy, publishedAt, sha, deploymentId, featureIds: features.map(f => f.id) };
}
export function validateIndex(value) {
  assert(Array.isArray(value), "index must be an array");
  const versions = new Set();
  const features = new Set();
  let previous = Infinity;
  for (const r of value) {
    keys(r, ["version", "layout", "copy", "publishedAt", "sha", "deploymentId", "featureIds"], "index entry");
    assert(VERSION_PATTERN.test(r.version) && !versions.has(r.version), "duplicate or invalid index version");
    versions.add(r.version);
    publication(r);
    copy(r.copy);
    assert(["compact", "bento"].includes(r.layout), "invalid index layout");
    assert(Date.parse(r.publishedAt) <= previous, "index must be newest first");
    previous = Date.parse(r.publishedAt);
    assert(Array.isArray(r.featureIds) && r.featureIds.length <= 64, "index feature IDs are required");
    for (const id of r.featureIds) {
      assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && !features.has(id), "feature slugs must be unique across releases");
      features.add(id);
    }
  }
  return value;
}
export function mergeIndex(index, release) {
  const entry = toIndexEntry(release);
  const existing = index.find(r => r.version === release.version);
  if (existing) {
    assert(existing.sha === entry.sha && existing.deploymentId === entry.deploymentId
      && JSON.stringify(existing) === JSON.stringify(entry), "a published version cannot be overwritten");
    return index;
  }
  return validateIndex([...index, entry].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
}
