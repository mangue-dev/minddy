/** Localize exact seeded demo page prose without changing document structure or state. */
import { readFile } from 'node:fs/promises';
export const pageDemoFixture = JSON.parse(await readFile(new URL('./localized-fixture.json', import.meta.url), 'utf8'));
export function translateDemoPageValues(value, locale) {
 const translated = pageDemoFixture.translations[locale];
 if (!translated) throw new Error(`Unsupported demo locale ${locale}`);
 const mapping = new Map(pageDemoFixture.original.map((text, index) => [text, translated[index]]));
 function visit(item) {
  if (typeof item === 'string') return mapping.get(item) ?? item;
  if (Array.isArray(item)) return item.map(visit);
  if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
  return item;
 }
 return visit(value);
}
