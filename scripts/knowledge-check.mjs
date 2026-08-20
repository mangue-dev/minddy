import fs from "node:fs";
import path from "node:path";

const directory = path.join(process.cwd(), "content", "knowledge");
const required = ["id", "title", "summary", "category", "audience", "lastReviewed"];
const audiences = new Set(["end-user", "developer", "both"]);
const errors = [];

for (const file of fs
  .readdirSync(directory)
  .filter((entry) => entry.endsWith(".md") && entry.toLowerCase() !== "readme.md")
  .sort()) {
  const raw = fs.readFileSync(path.join(directory, file), "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    errors.push(`${file}: missing frontmatter.`);
    continue;
  }
  const data = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/))
      .filter(Boolean)
      .map((entry) => [entry[1], entry[2].trim()]),
  );
  for (const field of required) if (!data[field]) errors.push(`${file}: missing ${field}.`);
  if (data.id && data.id !== file.slice(0, -3)) errors.push(`${file}: id must match filename.`);
  if (data.audience && !audiences.has(data.audience)) errors.push(`${file}: invalid audience.`);
  if (data.lastReviewed && !/^\d{4}-\d{2}-\d{2}$/.test(data.lastReviewed)) errors.push(`${file}: invalid review date.`);
  if (match[2].trim().length < 120) errors.push(`${file}: article body is too short.`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Knowledge articles validated.");
