import "server-only";
import { Fragment, isValidElement, type ReactNode } from "react";
import * as prose from "@/components/legal/prose";
import { LegalContent } from "@/components/legal/legal-content";
import { TermsContent } from "@/components/legal/terms-content";
import { PrivacyContent } from "@/components/legal/privacy-content";
import { CookiesContent } from "@/components/legal/cookies-content";
import type { Locale } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";

const content = { legal: LegalContent, terms: TermsContent, privacy: PrivacyContent, cookies: CookiesContent };
export type LegalContentKey = keyof typeof content;

export function isLegalContentKey(key: string): key is LegalContentKey {
  return Object.hasOwn(content, key);
}

const primitives = new Set<unknown>(Object.values(prose));
const escapeText = (value: string) => value.replace(/([\\`*_[\]<>])/g, "\\$1");

/** Project the shared, server-only legal body, preserving every paragraph and table. */
export async function legalProseMarkdown(node: ReactNode): Promise<string> {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return (await Promise.all(node.map(legalProseMarkdown))).join("");
  if (!isValidElement<{ children?: ReactNode; href?: string }>(node)) throw new Error("Unsupported legal content");
  if (primitives.has(node.type)) {
    const props = node.props;
    const render = node.type as (input: typeof props) => ReactNode | Promise<ReactNode>;
    return legalProseMarkdown(await render(props));
  }
  const children = await legalProseMarkdown(node.props.children);
  if (node.type === Fragment || node.type === "span") return children;
  if (typeof node.type !== "string") throw new Error("Unsupported legal component");
  if (/^h[1-6]$/.test(node.type)) return `\n\n${"#".repeat(Number(node.type[1]))} ${children.trim()}\n\n`;
  switch (node.type) {
    case "a": return `[${children}](${new URL(node.props.href ?? "", SITE_URL).href})`;
    case "p": return `\n\n${children.trim()}\n\n`;
    case "li": return `- ${children.trim()}\n`;
    case "dt": return `- **${children.trim()}**: `;
    case "dd": return `${children.trim()}\n`;
    case "th": case "td": return `${children.trim().replace(/\|/g, "\\|").replace(/\n/g, " ")} | `;
    case "tr": return `| ${children.trim()}\n`;
    case "thead": {
      const columns = (children.match(/(?<!\\)\|/g)?.length ?? 0) - 1;
      return `${children}| ${Array.from({ length: columns }, () => "---").join(" | ")} |\n`;
    }
    case "table": case "ul": case "dl": return `\n\n${children}\n\n`;
    case "tbody": case "div": case "section": return children;
    default: throw new Error(`Unsupported legal tag: ${node.type}`);
  }
}

export async function renderLegalContent(key: LegalContentKey, locale: Locale): Promise<string> {
  return (await legalProseMarkdown(await content[key]({ locale }))).trim().replace(/\n{3,}/g, "\n\n") + "\n";
}
