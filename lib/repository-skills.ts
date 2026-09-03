export const REPOSITORY_SKILL_ROOTS = [
  ".agents/skills",
  ".claude/skills",
  ".github/skills",
  ".cursor/skills",
  ".codex/skills",
  ".gemini/skills",
] as const;

export const MAX_REPOSITORY_SKILLS = 100;
export const MAX_SELECTED_SKILLS = 5;
export const MAX_SKILL_FILE_BYTES = 50_000;
export const MAX_SELECTED_SKILL_BYTES = 80_000;

export interface RepositorySkillSummary {
  /** Repository-relative path to the skill entrypoint. */
  path: string;
  name: string;
  description: string;
  source: (typeof REPOSITORY_SKILL_ROOTS)[number];
}

export interface RepositorySkill extends RepositorySkillSummary {
  /** Markdown instructions after the YAML frontmatter. */
  content: string;
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function repositorySkillSource(
  path: string,
): RepositorySkillSummary["source"] | null {
  const normalized = normalizedPath(path);
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || /[\0\r\n]/.test(segment),
    )
  ) {
    return null;
  }
  for (const root of REPOSITORY_SKILL_ROOTS) {
    if (
      normalized.startsWith(`${root}/`) &&
      normalized.endsWith("/SKILL.md")
    ) {
      return root;
    }
  }
  return null;
}

export function isRepositorySkillPath(path: string): boolean {
  return repositorySkillSource(path) !== null;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function frontmatterField(frontmatter: string, key: string): string {
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^${key}\\s*:\\s*(.*)$`, "i"));
    if (!match) continue;
    const scalar = match[1].trim();
    if (scalar !== ">" && scalar !== ">-" && scalar !== "|" && scalar !== "|-") {
      return unquote(scalar);
    }
    const chunks: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const continuation = lines[cursor];
      if (!/^\s+/.test(continuation)) break;
      chunks.push(continuation.trim());
    }
    return chunks.filter(Boolean).join(scalar.startsWith(">") ? " " : "\n");
  }
  return "";
}

function fallbackDescription(body: string): string {
  const paragraph = body
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.replace(/^#+\s+.*(?:\r?\n|$)/, "").trim())
    .find(Boolean);
  return paragraph?.replace(/\s+/g, " ").slice(0, 300) ?? "Repository skill";
}

/** Parse the portable SKILL.md envelope without interpreting its instructions. */
export function parseRepositorySkill(
  path: string,
  raw: string,
): RepositorySkill | null {
  const source = repositorySkillSource(path);
  if (
    !source ||
    !raw.trim() ||
    new TextEncoder().encode(raw).byteLength > MAX_SKILL_FILE_BYTES
  ) {
    return null;
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const frontmatter = match?.[1] ?? "";
  const content = (match?.[2] ?? raw).trim();
  if (!content) return null;

  const directoryName = normalizedPath(path).split("/").at(-2) ?? "skill";
  const name = (frontmatterField(frontmatter, "name") || directoryName)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  if (!name) return null;
  const description = (
    frontmatterField(frontmatter, "description") || fallbackDescription(content)
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1024);

  return { path: normalizedPath(path), name, description, source, content };
}

export async function discoverRepositorySkills(
  paths: readonly string[],
  read: (path: string) => Promise<string | null>,
): Promise<RepositorySkill[]> {
  const candidates = [
    ...new Set(paths.map(normalizedPath).filter(isRepositorySkillPath)),
  ]
    .sort((a, b) => {
      const aSource = repositorySkillSource(a)!;
      const bSource = repositorySkillSource(b)!;
      return (
        REPOSITORY_SKILL_ROOTS.indexOf(aSource) -
          REPOSITORY_SKILL_ROOTS.indexOf(bSource) || a.localeCompare(b)
      );
    })
    .slice(0, MAX_REPOSITORY_SKILLS);
  const parsed = await Promise.all(
    candidates.map(async (path) => {
      const raw = await read(path);
      return raw === null ? null : parseRepositorySkill(path, raw);
    }),
  );
  const byPrecedence = parsed
    .filter((skill): skill is RepositorySkill => skill !== null)
    .sort(
      (a, b) =>
        REPOSITORY_SKILL_ROOTS.indexOf(a.source) -
          REPOSITORY_SKILL_ROOTS.indexOf(b.source) || a.path.localeCompare(b.path),
    );
  const names = new Set<string>();
  return byPrecedence
    .filter((skill) => {
      const key = skill.name.toLowerCase();
      if (names.has(key)) return false;
      names.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

export function summarizeRepositorySkill(
  skill: RepositorySkill,
): RepositorySkillSummary {
  const { content: _content, ...summary } = skill;
  return summary;
}
