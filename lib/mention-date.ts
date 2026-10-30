// Date mentions (MIN-872): `@today`, `@tomorrow`, `@next monday`,
// `@in 3 weeks`, `@15 november`… insert a FIXED calendar date, stored as
// `mention:date/2026-11-02` with an optional `?time=09:30` and `?end=` (a
// later day). The date never moves after it is written; only its label is
// relative ("Today", "Tomorrow", "Yesterday") while it is that close, then the
// full date. minddy does not schedule anything from these dates.
//
// The parser understands the six interface languages at once: a French
// reader may still type `@tomorrow`. Weekday and month names come from `Intl`,
// so they follow each locale's own spelling.

import * as chronoDe from "chrono-node/de";
import * as chronoEn from "chrono-node/en";
import * as chronoEs from "chrono-node/es";
import * as chronoFr from "chrono-node/fr";
import * as chronoIt from "chrono-node/it";
import * as chronoPt from "chrono-node/pt";
import type { Chrono } from "chrono-node";
import { locales, type Locale } from "@/i18n/config";
import type { MentionMeta } from "@/lib/mention-link";

/** A calendar day as stored, `YYYY-MM-DD`. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A wall-clock time as stored, `HH:MM`. */
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface MentionDate {
  /** `YYYY-MM-DD`, a local calendar day. */
  date: string;
  /** `HH:MM`, wall-clock time, when the mention carries one. */
  time?: string;
  /** `YYYY-MM-DD`, the last day of a range, after `date`. */
  end?: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The stored form of a local day. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A stored day as a local Date at midnight, or `null` when it is not a real day. */
export function parseDay(value: string | null | undefined): Date | null {
  const match = value ? DAY.exec(value) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dayKey(date) === value ? date : null;
}

export const isMentionDay = (value: string | null | undefined): boolean => parseDay(value) !== null;

/** A date mention's id and metadata as one value; malformed parts are dropped. */
export function mentionDateFrom(id: string, meta?: MentionMeta | null): MentionDate | null {
  if (!parseDay(id)) return null;
  const result: MentionDate = { date: id };
  if (meta?.time && TIME.test(meta.time)) result.time = meta.time;
  if (meta?.end && parseDay(meta.end) && meta.end > id) result.end = meta.end;
  return result;
}

/** The metadata a date mention stores, `null` when it has none. */
export function mentionDateMeta(value: MentionDate): MentionMeta | null {
  const meta: MentionMeta = {};
  if (value.time && TIME.test(value.time)) meta.time = value.time;
  if (value.end && parseDay(value.end) && value.end > value.date) meta.end = value.end;
  return Object.keys(meta).length ? meta : null;
}

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const addMonths = (date: Date, months: number) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
};

/** Lowercase, without accents, apostrophes, hyphens or a trailing period. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/(?<=[a-z])-(?=[a-z])/g, " ")
    .replace(/\.(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── chrono ─────────────────────────────────────────────────────────────── */

// chrono-node reads natural language dates in each interface language
// (https://github.com/wanasit/chrono). A result counts only when it covers
// the whole query: "day after tomorrow" must never come back as "tomorrow".
const CHRONO: Record<Locale, Chrono> = {
  en: chronoEn.casual,
  fr: chronoFr.casual,
  de: chronoDe.casual,
  es: chronoEs.casual,
  it: chronoIt.casual,
  "pt-BR": chronoPt.casual,
};

/** What chrono reads more reliably: a written-out hour (French "heures") as `9h`,
    and Portuguese "as 9" with its accent. */
function forChrono(query: string): string {
  return query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\d{1,2}) ?heures?(?: (\d{2}))?/g, (_whole, hours: string, minutes?: string) => `${hours}h${minutes ?? ""}`)
    .replace(/\bas (?=\d)/g, "às ");
}

/** Every reading of the whole query by chrono, the reader's language first. */
function chronoDates(query: string, now: Date, locale: string): MentionDate[] {
  const text = forChrono(query);
  if (!text) return [];
  const order = [locale, ...locales.filter((candidate) => candidate !== locale)] as Locale[];
  const found: MentionDate[] = [];
  for (const candidate of order) {
    const parser = CHRONO[candidate];
    if (!parser) continue;
    for (const result of parser.parse(text, now, { forwardDate: true })) {
      if (result.index !== 0 || result.text.length !== text.length) continue;
      const start = result.start.date();
      const value: MentionDate = { date: dayKey(start) };
      if (result.start.isCertain("hour")) value.time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
      const end = result.end ? dayKey(result.end.date()) : null;
      if (end && end > value.date) value.end = end;
      found.push(value);
    }
  }
  return found;
}

/* ── Our own vocabulary ─────────────────────────────────────────────────── */

// What chrono misses in some language: a day two days away, a weekday some
// weeks ahead ("thursday in 2 weeks"), the end of the month, the weekend, a
// bare day of the month, and keywords while they are being typed ("dem").

type Keyword = "today" | "now" | "tomorrow" | "yesterday" | "afterTomorrow" | "beforeYesterday";

const KEYWORDS: Record<Keyword, string[]> = {
  today: ["today", "aujourdhui", "auj", "heute", "hoy", "oggi", "hoje"],
  now: ["now", "maintenant", "jetzt", "ahora", "adesso", "ora", "agora"],
  tomorrow: ["tomorrow", "tmrw", "tmr", "demain", "dem", "morgen", "manana", "domani", "amanha"],
  yesterday: ["yesterday", "hier", "gestern", "ayer", "ieri", "ontem"],
  afterTomorrow: ["day after tomorrow", "apres demain", "ubermorgen", "pasado manana", "dopodomani", "depois de amanha"],
  beforeYesterday: ["day before yesterday", "avant hier", "vorgestern", "anteayer", "antes de ayer", "laltro ieri", "altroieri", "anteontem"],
};
const KEYWORD_OFFSET: Record<Exclude<Keyword, "now">, number> = {
  today: 0, tomorrow: 1, yesterday: -1, afterTomorrow: 2, beforeYesterday: -2,
};

/** Words that mark "the next" weekday, before or after it. */
const NEXT = ["next", "prochain", "prochaine", "nachste", "nachsten", "nachster", "kommenden", "kommender",
  "proximo", "proxima", "prossimo", "prossima", "this", "ce", "cette", "este", "esta", "questo", "diesen"];
/** Words that introduce an offset, such as the "in" of "in 3 weeks", in each language. */
const IN = ["in", "dans", "en", "tra", "fra", "em", "dentro de", "daqui a", "within", "d ici"];

type Unit = "day" | "week" | "month" | "year";
const UNITS: Record<Unit, string[]> = {
  day: ["day", "days", "d", "j", "jour", "jours", "tag", "tage", "tagen", "dia", "dias", "giorno", "giorni"],
  week: ["week", "weeks", "wk", "wks", "w", "sem", "semaine", "semaines", "woche", "wochen", "semana", "semanas",
    "settimana", "settimane"],
  month: ["month", "months", "mo", "mois", "monat", "monate", "monaten", "mes", "meses", "mese", "mesi"],
  year: ["year", "years", "yr", "yrs", "an", "ans", "annee", "annees", "jahr", "jahre", "jahren", "ano", "anos",
    "anno", "anni"],
};

/** Small numbers written out, so "in two weeks" reads as "in 2 weeks", in each language. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  ein: 1, eine: 1, einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  due: 2, tre: 3, quattro: 4, sei: 6,
  um: 1, uma: 1, dois: 2, duas: 2, quatro: 4,
};

const END_OF_MONTH = ["end of month", "end of the month", "fin du mois", "fin de mois", "ende des monats",
  "monatsende", "fin de mes", "fin del mes", "fine mese", "fine del mese", "fim do mes", "final do mes"];
const WEEKEND = ["weekend", "this weekend", "week end", "ce week end", "ce weekend", "le week end", "wochenende",
  "am wochenende", "fin de semana", "este fin de semana", "fine settimana", "questo weekend", "fim de semana",
  "neste fim de semana"];

/** Weekday and month names of every supported locale, normalized, with their
    short forms: index 0 = Sunday, and 0 = January. */
function namesOf(kind: "weekday" | "month"): Map<string, number> {
  const names = new Map<string, number>();
  const count = kind === "weekday" ? 7 : 12;
  for (const locale of locales) {
    for (const style of ["long", "short"] as const) {
      const format = new Intl.DateTimeFormat(locale, kind === "weekday" ? { weekday: style } : { month: style });
      for (let index = 0; index < count; index += 1) {
        // 2023-01-01 is a Sunday: day `index` of that week, or month `index`.
        const date = kind === "weekday" ? new Date(2023, 0, 1 + index) : new Date(2023, index, 1);
        const name = normalize(format.format(date));
        if (name.length >= 3 && !names.has(name)) names.set(name, index);
        // "segunda feira" also reads as "segunda".
        const first = name.split(" ")[0];
        if (first.length >= 3 && !names.has(first)) names.set(first, index);
      }
    }
  }
  return names;
}

let weekdays: Map<string, number> | null = null;
let months: Map<string, number> | null = null;

/** The name `word` designates, matched whole or as a prefix of 3+ letters. */
function lookup(names: Map<string, number>, word: string, partial: boolean): number | null {
  const exact = names.get(word);
  if (exact !== undefined) return exact;
  if (!partial || word.length < 3) return null;
  const found = new Set<number>();
  for (const [name, index] of names) if (name.startsWith(word)) found.add(index);
  return found.size === 1 ? [...found][0] : null;
}

/**
 * A time at the end of a query: `9h`, `9h30`, `09:30`, `9am`, `9 pm`, and
 * the same with each language's own word for "at" or "o'clock". A bare
 * number needs such a word before it, so "the 15" stays a day of the month.
 */
const TIME_TOKEN = new RegExp(
  "(?:^|\\s)(?:(?:a|at|um|alle|as|a las|a la|ore|vers|around|gegen|pour|for|por) )?" +
  "(\\d{1,2})(?:(?: ?(?:h|heures?|hrs?|uhr|horas?|ore|o ?clock))(?: ?(\\d{2}))?|:(\\d{2}))?(?: ?(am|pm))?$",
);
const TIME_MARKED = /(?:^|\s)(?:a|at|um|alle|as|a las|a la|ore|vers|around|gegen|pour|for|por) \d|\d ?(?:h|heures?|hrs?|uhr|horas?|ore|o ?clock)\b|\d ?h\d|\d:\d|\d ?(?:am|pm)$/;

function readTime(text: string): { rest: string; time: string | null } {
  const match = TIME_TOKEN.exec(text);
  if (!match || !TIME_MARKED.test(match[0])) return { rest: text, time: null };
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? match[3] ?? 0);
  const meridiem = match[4];
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return { rest: text, time: null };
  return { rest: text.slice(0, match.index).trim(), time: `${pad(hours)}:${pad(minutes)}` };
}

/** `3`, `trois`, `drei`… */
function amountOf(word: string): number | null {
  if (/^\d{1,3}$/.test(word)) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

/** The unit a word names, whole or begun. */
function unitOf(word: string): Unit | null {
  return (Object.entries(UNITS) as Array<[Unit, string[]]>)
    .find(([, words]) => words.includes(word) || (word.length >= 3 && words.some((unit) => unit.startsWith(word))))?.[0]
    ?? null;
}

/** The day `amount` units after `today`. */
function shifted(today: Date, amount: number, unit: Unit): Date {
  if (unit === "day") return addDays(today, amount);
  if (unit === "week") return addDays(today, amount * 7);
  return addMonths(today, unit === "month" ? amount : amount * 12);
}

/** Our own readings of a query, best first. */
function ownDates(query: string, now: Date): MentionDate[] {
  const text = normalize(query);
  if (!text) return [];
  weekdays ??= namesOf("weekday");
  months ??= namesOf("month");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const found: MentionDate[] = [];
  const add = (date: Date, time?: string | null) => {
    found.push({ date: dayKey(date), ...(time ? { time } : {}) });
  };

  const { rest, time } = readTime(text);

  // Keywords, typed whole or begun ("tom" → tomorrow).
  for (const [keyword, words] of Object.entries(KEYWORDS) as Array<[Keyword, string[]]>) {
    const whole = words.includes(rest);
    const begun = !time && rest.length >= 2 && words.some((word) => word.startsWith(rest));
    if (!whole && !begun) continue;
    if (keyword === "now") add(today, time ?? `${pad(now.getHours())}:${pad(now.getMinutes())}`);
    else add(addDays(today, KEYWORD_OFFSET[keyword]), time);
  }

  if (END_OF_MONTH.includes(rest)) add(new Date(today.getFullYear(), today.getMonth() + 1, 0), time);
  if (WEEKEND.includes(rest)) add(addDays(today, (6 - today.getDay() + 7) % 7), time);

  const words = rest.split(" ");

  // "in 3 weeks", "3 days", "in two weeks", and their translations.
  const offset = /^(?:(.+?) )?(\S+) ([a-z]+)$/.exec(rest);
  if (offset && (offset[1] === undefined || IN.includes(offset[1]))) {
    const amount = amountOf(offset[2]);
    const unit = unitOf(offset[3]);
    if (amount !== null && unit) add(shifted(today, amount, unit), time);
  }

  // "thursday in 2 weeks", in any language: that weekday, in the week
  // the offset lands in.
  const inIndex = words.findIndex((word, index) => index > 0 && IN.includes(word));
  if (inIndex > 0 && words.length === inIndex + 3) {
    const weekday = lookup(weekdays, words.slice(0, inIndex).filter((word) => !NEXT.includes(word)).join(" "), true);
    const amount = amountOf(words[inIndex + 1]);
    const unit = unitOf(words[inIndex + 2]);
    if (weekday !== null && amount !== null && unit) {
      const landing = shifted(today, amount, unit);
      const monday = addDays(landing, -((landing.getDay() + 6) % 7));
      add(addDays(monday, (weekday + 6) % 7), time);
    }
  }

  // A weekday, alone or with "next": always the coming one, never today.
  const named = words.filter((word) => !NEXT.includes(word));
  if (named.length >= 1 && named.length <= 2 && words.length - named.length <= 1) {
    const weekday = lookup(weekdays, named.join(" "), true) ?? (named.length === 1 ? null : lookup(weekdays, named[0], true));
    if (weekday !== null && (named.length === 1 || named[1] === "feira")) {
      const ahead = (weekday - today.getDay() + 7) % 7 || 7;
      add(addDays(today, ahead), time);
    }
  }

  // "le 15", "the 15th", "am 15", "el 15": the next such day of a month.
  const dayOfMonth = /^(?:le|the|on|am|el|il|dia|o|de)? ?(\d{1,2})(?:st|nd|rd|th|er|eme|e|o|º)?$/.exec(rest);
  if (dayOfMonth) {
    const day = Number(dayOfMonth[1]);
    for (let ahead = 0; ahead < 3; ahead += 1) {
      const month = today.getMonth() + ahead;
      const date = new Date(today.getFullYear(), month, day);
      if (date.getDate() === day && date >= today) {
        add(date, time);
        break;
      }
    }
  }

  // "15 november", "november 15", "15 nov 2027", "15/11", "2026-11-15".
  const iso = parseDay(rest);
  if (iso) add(iso, time);
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(rest);
  if (numeric) {
    // Day first, as every supported locale but English writes it; an English
    // reader typing 11/15 still gets the only real date.
    const [a, b] = [Number(numeric[1]), Number(numeric[2])];
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : null;
    for (const [day, month] of [[a, b], [b, a]]) {
      const date = calendarDate(today, day, month - 1, year);
      if (date) add(date, time);
    }
  }
  const spelled = /^(?:(?:le|the|am|el|il|o) )?(?:(\d{1,2})(?:st|nd|rd|th|er)? (?:de )?([a-z]+)|([a-z]+) (\d{1,2})(?:st|nd|rd|th)?)(?: (?:de )?(\d{4}))?$/.exec(rest);
  if (spelled) {
    const day = Number(spelled[1] ?? spelled[4]);
    const month = lookup(months, spelled[2] ?? spelled[3], true);
    const date = month === null ? null : calendarDate(today, day, month, spelled[5] ? Number(spelled[5]) : null);
    if (date) add(date, time);
  }

  // A bare time: today at that time.
  if (!rest && time) add(today, time);
  return found;
}

/* ── Times said in words ────────────────────────────────────────────────── */

/** An hour named rather than numbered: noon and midnight in each language. */
const HOUR_WORDS: Record<string, number> = {
  noon: 12, midday: 12, midnight: 0, midi: 12, minuit: 0, mittag: 12, mitternacht: 0,
  mediodia: 12, medianoche: 0, mezzogiorno: 12, mezzanotte: 0, "meio dia": 12, "meia noite": 0,
};
const HOUR = `(\\d{1,2}|${Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join("|")})`;
/** What may follow an hour: its unit, in each language. */
const HOUR_UNIT = "(?: ?(?:h|heures?|hrs?|hours?|uhr|horas?|ore|o ?clock))?";
const AND = "(?:et|and|und|y|e)";
const HALF = "(?:demie?|half|halb|media|mezzo|mezza|meia)";
const QUARTER = "(?:(?:un|um|a|une) )?(?:quart|quarter|viertel|cuarto|quarto)";
const THREE_QUARTERS = "(?:trois quarts?|three quarters|dreiviertel|tres cuartos|tre quarti|tres quartos)";
const MINUS_QUARTER = "(?:moins (?:le |un )?quart|menos (?:un |um )?(?:cuarto|quarto)|meno (?:un )?quarto)";
const MINUTE_WORDS: Record<string, number> = {
  cinq: 5, five: 5, funf: 5, cinco: 5, cinque: 5,
  dix: 10, ten: 10, zehn: 10, diez: 10, dieci: 10, dez: 10,
  quinze: 15, fifteen: 15, quince: 15, quindici: 15,
  vingt: 20, twenty: 20, zwanzig: 20, veinte: 20, venti: 20, vinte: 20,
  trente: 30, thirty: 30, dreissig: 30, treinta: 30, trenta: 30, trinta: 30,
  quarante: 40, forty: 40, vierzig: 40, cuarenta: 40, quaranta: 40, quarenta: 40,
  cinquante: 50, fifty: 50, cincuenta: 50, cinquanta: 50, cinquenta: 50,
};
const MINUTES = `(\\d{2}|${Object.keys(MINUTE_WORDS).join("|")})`;

const hourOf = (word: string) => HOUR_WORDS[word] ?? Number(word);
const minuteOf = (word: string) => MINUTE_WORDS[word] ?? Number(word);
/** `8h30`, the form the rest of the parser reads; the hour before is wrapped. */
const clock = (hours: number, minutes: number) =>
  hours > 23 || minutes > 59 ? null : `${hours < 0 ? hours + 24 : hours}h${pad(minutes)}`;

/** Rewrites, applied in order to a normalized query. */
const SPOKEN_TIMES: Array<[RegExp, (match: string[]) => string | null]> = [
  // "8 heures et demie", "8 and a half", "8 y media", "8 e mezza", "8 e meia".
  [new RegExp(`\\b${HOUR}${HOUR_UNIT} ${AND}(?: a)? ${HALF}\\b`, "g"), ([, h]) => clock(hourOf(h), 30)],
  // "8 heures et quart", "8 y cuarto", "8 e un quarto", "8 e um quarto".
  [new RegExp(`\\b${HOUR}${HOUR_UNIT} ${AND} ${QUARTER}\\b`, "g"), ([, h]) => clock(hourOf(h), 15)],
  // "8 heures trois quarts", "8 e tre quarti", "8 y tres cuartos".
  [new RegExp(`\\b${HOUR}${HOUR_UNIT} (?:${AND} )?${THREE_QUARTERS}\\b`, "g"), ([, h]) => clock(hourOf(h), 45)],
  // "9 heures moins le quart", "9 menos cuarto", "9 meno un quarto".
  [new RegExp(`\\b${HOUR}${HOUR_UNIT} ${MINUS_QUARTER}\\b`, "g"), ([, h]) => clock(hourOf(h) - 1, 45)],
  // "half past 8", "quarter past 8", "quarter to 9".
  [new RegExp(`\\bhalf past ${HOUR}\\b`, "g"), ([, h]) => clock(hourOf(h), 30)],
  [new RegExp(`\\b(?:a )?quarter past ${HOUR}\\b`, "g"), ([, h]) => clock(hourOf(h), 15)],
  [new RegExp(`\\b(?:a )?quarter (?:to|before) ${HOUR}\\b`, "g"), ([, h]) => clock(hourOf(h) - 1, 45)],
  // German: "halb 9" is 8:30, "viertel nach 8", "viertel vor 9", "dreiviertel 9".
  [new RegExp(`\\bhalb ${HOUR}\\b`, "g"), ([, h]) => clock(hourOf(h) - 1, 30)],
  [new RegExp(`\\bviertel nach ${HOUR}\\b`, "g"), ([, h]) => clock(hourOf(h), 15)],
  [new RegExp(`\\b(?:viertel vor|dreiviertel) ${HOUR}\\b`, "g"), ([, h]) => clock(hourOf(h) - 1, 45)],
  // Spanish and Portuguese: "cuarto para las 9", "quinze para as 9".
  [new RegExp(`\\b(?:(?:un|um) )?(?:cuarto|quarto|quinze) para (?:las |as |a )?${HOUR}\\b`, "g"),
    ([, h]) => clock(hourOf(h) - 1, 45)],
  // "8 e quinze", "8 y veinte", "8 heures 30", "8 und 20": minutes after the hour.
  [new RegExp(`\\b${HOUR}${HOUR_UNIT} (?:${AND} )?${MINUTES}\\b(?! ?(?:jours?|days?|tage?n?|dias?|giorni|giorno|semaines?|weeks?|wochen?|semanas?|settimane|settimana|mois|months?|monate?n?|meses|mesi|mese|ans?|years?|jahre?n?|anos?|anni|anno|minutes?|minutos?|minuten|minuti))`, "g"),
    ([whole, h, m]) => (/\d ?(?:h|heures?|hrs?|uhr|horas?|ore)\b|\b(?:et|and|und|y|e) /.test(whole) ? clock(hourOf(h), minuteOf(m)) : null)],
  // Noon and midnight on their own: "demain midi", "tomorrow at noon".
  // Not the noon word inside the French word for afternoon ("apres midi").
  [new RegExp(`(?<!apres )\\b(${Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join("|")})\\b`, "g"),
    ([, h]) => clock(hourOf(h), 0)],
];

/** A query with each time said in words rewritten as `8h30`. */
export function spokenTimes(text: string): string {
  let next = text;
  for (const [pattern, rewrite] of SPOKEN_TIMES) {
    next = next.replace(pattern, (...args) => rewrite(args.slice(0, -2) as string[]) ?? args[0]);
  }
  return next;
}

/* ── Typos ──────────────────────────────────────────────────────────────── */

// A word the parser does not know is read as the word it knows that is one
// typo away, the tolerance search engines apply by default: one typo from
// four letters, two from eight (Algolia's `minWordSizefor1Typo` and
// `minWordSizefor2Typos`), counted as Damerau-Levenshtein edits, so two
// swapped letters are one typo (as Meilisearch counts them).

/** Words the time and day rules read besides the vocabulary lists. */
const TIME_WORDS = [
  "heure", "heures", "hour", "hours", "uhr", "hora", "horas", "ore", "oclock", "clock",
  "et", "and", "und", "demi", "demie", "half", "halb", "media", "mezzo", "mezza", "meia",
  "quart", "quarts", "quarter", "quarters", "viertel", "cuarto", "cuartos", "quarto", "quartos", "quarti",
  "trois", "three", "dreiviertel", "tres", "tre", "moins", "menos", "meno", "past", "before", "nach", "vor",
  "para", "las", "alle", "matin", "soir", "apres", "morning", "evening", "afternoon", "tonight", "night",
  "abend", "nachmittag", "vormittag", "tarde", "noche", "mattina", "sera", "pomeriggio", "notte",
  "noite", "semaine", "prochaine", "dernier", "derniere", "last", "letzten", "pasado", "scorso", "passado",
];

let vocabulary: Set<string> | null = null;

/** Every word the parser reads, each once. */
function vocabularyWords(): Set<string> {
  if (vocabulary) return vocabulary;
  weekdays ??= namesOf("weekday");
  months ??= namesOf("month");
  const words = new Set<string>();
  const add = (phrase: string) => {
    for (const word of normalize(phrase).split(" ")) if (/^[a-z]{2,}$/.test(word)) words.add(word);
  };
  for (const phrase of [
    ...Object.values(KEYWORDS).flat(), ...NEXT, ...IN, ...Object.values(UNITS).flat(),
    ...Object.keys(NUMBER_WORDS), ...Object.keys(MINUTE_WORDS), ...Object.keys(HOUR_WORDS),
    ...END_OF_MONTH, ...WEEKEND, ...DATE_PICKER_WORDS, ...TIME_WORDS,
    ...weekdays.keys(), ...months.keys(),
  ]) add(phrase);
  vocabulary = words;
  return words;
}

/** Damerau-Levenshtein distance (optimal string alignment), stopping past `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[b.length];
}

/** The typos a word of this length may carry. */
const typosAllowed = (word: string) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

/**
 * A normalized query with each unknown word replaced by the known word one
 * typo away: "8 heyre et demo" reads "8 heure et demi". A word still being
 * typed (the beginning of a known word) and a word with digits are kept, and
 * so is a word two known words are equally close to.
 */
export function correctTypos(text: string): string {
  const known = vocabularyWords();
  return text.split(" ").map((word) => {
    const limit = typosAllowed(word);
    if (!limit || !/^[a-z]+$/.test(word) || known.has(word)) return word;
    let best: string | null = null;
    let bestScore = Infinity;
    let tied = false;
    for (const candidate of known) {
      if (candidate.startsWith(word)) return word;
      const distance = editDistance(word, candidate, limit);
      if (distance > limit) continue;
      // Closest first, then the same length, then the same letters (two
      // swapped letters, the most common typo), then the same first letter.
      const sameLetters = [...candidate].sort().join("") === [...word].sort().join("");
      const score = distance * 100 + Math.abs(candidate.length - word.length) * 10 +
        (sameLetters ? 0 : 2) + (candidate[0] === word[0] ? 0 : 1);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
        tied = false;
      } else if (score === bestScore && candidate !== best) {
        tied = true;
      }
    }
    return best && !tied ? best : word;
  }).join(" ");
}

/* ── Parser ─────────────────────────────────────────────────────────────── */

/**
 * The dates a query typed after "@" may mean, best first, at most three:
 * chrono's whole readings in the reader's language and the others, then our
 * own. An empty query proposes nothing: dates appear once the reader types
 * one, and `@date` opens the picker (`DATE_PICKER_WORDS`).
 */
export function parseDateQuery(query: string, now: Date = new Date(), locale: string = "en"): MentionDate[] {
  const text = normalize(query);
  if (!text) return [];
  // Typos corrected, then a time said in words ("halb 9") read as `8h30`.
  const prepared = spokenTimes(correctTypos(text));
  const read = prepared === text ? query : prepared;
  const found: MentionDate[] = [];
  for (const value of [...chronoDates(read, now, locale), ...ownDates(read, now)]) {
    if (!parseDay(value.date)) continue;
    if (found.some((item) => item.date === value.date && item.time === value.time && item.end === value.end)) continue;
    found.push(value);
  }
  return found.slice(0, 3);
}

/** A real day of `month` (0-based); without a year, the next such day from today. */
function calendarDate(today: Date, day: number, month: number, year: number | null): Date | null {
  if (month < 0 || month > 11 || day < 1) return null;
  const build = (y: number) => {
    const date = new Date(y, month, day);
    return date.getMonth() === month ? date : null;
  };
  if (year !== null) return build(year);
  const thisYear = build(today.getFullYear());
  if (thisYear && thisYear >= today) return thisYear;
  return build(today.getFullYear() + 1);
}

/* ── Label ──────────────────────────────────────────────────────────────── */

const capitalize = (text: string, locale: string) =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

function dayLabel(day: Date, locale: string, today: Date | null): string {
  if (today) {
    const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
    if (Math.abs(diff) <= 1) {
      return capitalize(new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day"), locale);
    }
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(today && day.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  }).format(day);
}

/**
 * What a date pill reads: "Today", "Tomorrow" or "Yesterday" while the date
 * is that close to `now`, the full date otherwise, then the time and the end.
 * Without `now` (a server render, which does not know the reader's day) the
 * label is always the full date.
 */
export function formatMentionDate(value: MentionDate, locale: string, now: Date | null): string {
  const day = parseDay(value.date);
  if (!day) return value.date;
  const today = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : null;
  let label = dayLabel(day, locale, today);
  if (value.time) {
    const [hours, minutes] = value.time.split(":").map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
    label += ` ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(at)}`;
  }
  const end = parseDay(value.end);
  if (end) label += ` → ${dayLabel(end, locale, today)}`;
  return label;
}

/**
 * How far a date is from now, when its pill does not say it already: "in 3
 * weeks", "2 days ago", "in 5 hours". `null` for a date the pill reads as
 * Today, Tomorrow or Yesterday — unless it carries a time, which this then
 * counts in hours and minutes.
 */
export function relativeMentionDate(value: MentionDate, locale: string, now: Date): string | null {
  const day = parseDay(value.date);
  if (!day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(days) <= 1) {
    if (!value.time) return null;
    const [hours, minutes] = value.time.split(":").map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
    const diff = Math.round((at.getTime() - now.getTime()) / 60_000);
    return Math.abs(diff) < 60 ? format.format(diff, "minute") : format.format(Math.round(diff / 60), "hour");
  }
  if (Math.abs(days) < 14) return format.format(days, "day");
  if (Math.abs(days) < 60) return format.format(Math.round(days / 7), "week");
  if (Math.abs(days) < 365) return format.format(Math.round(days / 30.44), "month");
  return format.format(Math.round(days / 365.25), "year");
}

/** What `@date` is typed as, in every language: it opens the picker. */
const DATE_PICKER_WORDS = ["date", "datum", "fecha", "data", "jour", "day", "tag", "dia", "giorno", "calendar",
  "calendrier", "kalender", "calendario"];

/** One option of the "@" menu's dates. */
export interface DateMentionOption {
  type: "date";
  id: string;
  label: string;
  meta?: MentionMeta;
  /** `@date`: insert now, then open the picker on it. */
  openPicker?: boolean;
}

/**
 * The "@" menu's date options for a query, labeled for the reader: what
 * `parseDateQuery` reads, ready to insert as `mention:date/<day>`, then the
 * stable `@date` entry, which inserts now and opens the picker, while the
 * query begins one of its words. `pickLabel` names that entry.
 */
export function dateMentionOptions(
  query: string,
  locale: string,
  now: Date = new Date(),
  pickLabel?: string,
): DateMentionOption[] {
  const options: DateMentionOption[] = parseDateQuery(query, now, locale).map((value) => {
    const meta = mentionDateMeta(value);
    return { type: "date", id: value.date, label: formatMentionDate(value, locale, now), ...(meta ? { meta } : {}) };
  });
  const text = normalize(query);
  if (pickLabel && text && DATE_PICKER_WORDS.some((word) => word.startsWith(text))) {
    options.push({
      type: "date",
      id: dayKey(now),
      label: pickLabel,
      meta: { time: `${pad(now.getHours())}:${pad(now.getMinutes())}` },
      openPicker: true,
    });
  }
  return options;
}

/**
 * Whether the "@" menu lists its dates FIRST, so Enter picks one: the query
 * is `@date` (or a translation), a whole date keyword (`@demain`), or a date
 * read in full (`@tomorrow at 9`, `@thursday in 2 weeks`). A query that only begins a word
 * (`@dat`, `@dem`) keeps people, issues and pages first.
 */
export function datesFirst(query: string, locale: string, now: Date = new Date()): boolean {
  const text = normalize(query);
  if (!text) return false;
  if (DATE_PICKER_WORDS.includes(text)) return true;
  if (Object.values(KEYWORDS).flat().some((word) => word === text && word.length > 3)) return true;
  const read = spokenTimes(correctTypos(text));
  if (chronoDates(read, now, locale).length > 0) return true;
  // A phrase of several words our own rules read in full ("thursday in 2
  // weeks", in any language): never a word still being typed.
  return /[\s\d]/.test(text) && ownDates(read, now).length > 0;
}

/* ── Opening the picker right after `@date` ─────────────────────────────── */

let pickerRequestedAt = 0;

/** The next date pill an editor mounts opens its picker: `@date` was picked. */
export function requestDatePicker(): void {
  pickerRequestedAt = Date.now();
}

/** Whether a pill mounting now answers a `@date` pick (once). */
export function takeDatePickerRequest(): boolean {
  if (Date.now() - pickerRequestedAt > 2000) return false;
  pickerRequestedAt = 0;
  return true;
}

/**
 * Whether a query may still become a date as the reader types on: it begins
 * with a digit, or its first word begins a date word of any language. The
 * "@" menu stays open on such a query even while it lists nothing yet, so
 * `@d` does not close it before `@demain`.
 */
export function isDatePrefix(query: string): boolean {
  const text = normalize(query);
  if (!text) return false;
  if (/^\d/.test(text)) return true;
  weekdays ??= namesOf("weekday");
  months ??= namesOf("month");
  const first = text.split(" ")[0];
  const vocabulary = [
    ...DATE_PICKER_WORDS,
    ...Object.values(KEYWORDS).flat(),
    ...NEXT,
    ...IN.map((word) => word.split(" ")[0]),
    ...weekdays.keys(),
    ...months.keys(),
  ];
  return vocabulary.some((word) => word.startsWith(first) || first.startsWith(word));
}
