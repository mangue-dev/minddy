// Date mentions (MIN-872): what a query typed after "@" may mean, in every
// interface language, and how a stored date reads relative to today.
import { describe, expect, it } from "vitest";
import {
  correctTypos,
  dateMentionOptions,
  datesFirst,
  formatMentionDate,
  isDatePrefix,
  relativeMentionDate,
  spokenTimes,
  mentionDateFrom,
  mentionDateMeta,
  parseDateQuery,
} from "@/lib/mention-date";

// Friday 30 October 2026, 14:05 local time.
const NOW = new Date(2026, 9, 30, 14, 5);
const dates = (query: string, locale = "fr") => parseDateQuery(query, NOW, locale);

describe("parseDateQuery", () => {
  it("reads today, now, tomorrow and yesterday in every language", () => {
    for (const query of ["today", "aujourd'hui", "heute", "hoy", "oggi", "hoje"]) {
      expect(dates(query)[0]).toEqual({ date: "2026-10-30" });
    }
    for (const query of ["tomorrow", "demain", "morgen", "mañana", "domani", "amanhã"]) {
      expect(dates(query)[0]).toEqual({ date: "2026-10-31" });
    }
    for (const query of ["yesterday", "hier", "gestern", "ayer", "ieri", "ontem"]) {
      expect(dates(query)[0]).toEqual({ date: "2026-10-29" });
    }
    expect(dates("maintenant")[0]).toEqual({ date: "2026-10-30", time: "14:05" });
  });

  it("proposes a keyword while it is being typed", () => {
    expect(dates("dem")[0]).toEqual({ date: "2026-10-31" });
    expect(dates("tom")[0]).toEqual({ date: "2026-10-31" });
    expect(dates("")).toEqual([]);
  });

  it("reads offsets", () => {
    expect(dates("dans 3 semaines")[0]).toEqual({ date: "2026-11-20" });
    expect(dates("in 2 days")[0]).toEqual({ date: "2026-11-01" });
    expect(dates("in 1 month")[0]).toEqual({ date: "2026-11-30" });
    expect(dates("tra 3 giorni")[0]).toEqual({ date: "2026-11-02" });
  });

  it("reads the coming weekday, never today", () => {
    expect(dates("lundi prochain")[0]).toEqual({ date: "2026-11-02" });
    expect(dates("next monday")[0]).toEqual({ date: "2026-11-02" });
    expect(dates("friday")[0]).toEqual({ date: "2026-11-06" });
    expect(dates("mon")[0]).toEqual({ date: "2026-11-02" });
  });

  it("reads spelled and numeric dates, in the coming year when past", () => {
    expect(dates("15 novembre")[0]).toEqual({ date: "2026-11-15" });
    expect(dates("november 15")[0]).toEqual({ date: "2026-11-15" });
    expect(dates("3 mars")[0]).toEqual({ date: "2027-03-03" });
    expect(dates("15 nov 2028")[0]).toEqual({ date: "2028-11-15" });
    expect(dates("2026-12-24")[0]).toEqual({ date: "2026-12-24" });
    expect(dates("15/11")[0]).toEqual({ date: "2026-11-15" });
    expect(dates("31 février")).toEqual([]);
  });

  it("reads a time after the day", () => {
    expect(dates("demain 9h")[0]).toEqual({ date: "2026-10-31", time: "09:00" });
    expect(dates("tomorrow 9:30 pm")[0]).toEqual({ date: "2026-10-31", time: "21:30" });
    expect(dates("17h30")[0]).toEqual({ date: "2026-10-30", time: "17:30" });
  });
});

it("reads every example the manual gives", () => {
  const examples: Record<string, { date: string; time?: string }> = {
    "today": { date: "2026-10-30" },
    "next monday": { date: "2026-11-02" },
    "in 3 weeks": { date: "2026-11-20" },
    "15 november": { date: "2026-11-15" },
    "tomorrow 9am": { date: "2026-10-31", time: "09:00" },
    "lundi prochain": { date: "2026-11-02" },
    "demain 9h": { date: "2026-10-31", time: "09:00" },
    "nächster Montag": { date: "2026-11-02" },
    "morgen 9:00": { date: "2026-10-31", time: "09:00" },
    "in 3 Wochen": { date: "2026-11-20" },
    "próximo lunes": { date: "2026-11-02" },
    "en 3 semanas": { date: "2026-11-20" },
    "lunedì prossimo": { date: "2026-11-02" },
    "tra 3 settimane": { date: "2026-11-20" },
    "próxima segunda": { date: "2026-11-02" },
    "em 3 semanas": { date: "2026-11-20" },
    "15 novembro": { date: "2026-11-15" },
  };
  for (const [query, expected] of Object.entries(examples)) expect(dates(query)[0], query).toEqual(expected);
});

it("reads the phrasings people actually type, with or without accents", () => {
  const examples: Record<string, { date: string; time?: string; end?: string }> = {
    "demain à 9 heures": { date: "2026-10-31", time: "09:00" },
    "demain a 9h": { date: "2026-10-31", time: "09:00" },
    "demain 9 heures 30": { date: "2026-10-31", time: "09:30" },
    "jeudi dans 2 semaines": { date: "2026-11-12" },
    "jeudi dans deux semaines": { date: "2026-11-12" },
    "thursday in 2 weeks": { date: "2026-11-12" },
    "Donnerstag in 2 Wochen": { date: "2026-11-12" },
    "après-demain": { date: "2026-11-01" },
    "apres demain": { date: "2026-11-01" },
    "day after tomorrow": { date: "2026-11-01" },
    "pasado manana": { date: "2026-11-01" },
    "depois de amanha": { date: "2026-11-01" },
    "avant-hier": { date: "2026-10-28" },
    "dans 2 jours": { date: "2026-11-01" },
    "em 3 semanas": { date: "2026-11-20" },
    "amanha as 9": { date: "2026-10-31", time: "09:00" },
    "fin du mois": { date: "2026-10-31" },
    "le 15": { date: "2026-11-15" },
    "the 15th": { date: "2026-11-15" },
    "vendredi 14h30": { date: "2026-10-30", time: "14:30" },
    "morgen um 9 Uhr": { date: "2026-10-31", time: "09:00" },
    "domani alle 9": { date: "2026-10-31", time: "09:00" },
    "mañana a las 9": { date: "2026-10-31", time: "09:00" },
    "15 nov": { date: "2026-11-15" },
    "nov 15": { date: "2026-11-15" },
    "tmrw": { date: "2026-10-31" },
    "ce week-end": { date: "2026-10-31" },
    "naechsten montag": { date: "2026-11-02" },
    "jueves en 2 semanas": { date: "2026-11-12" },
    "giovedi tra 2 settimane": { date: "2026-11-12" },
    "quinta em 2 semanas": { date: "2026-11-12" },
    "übermorgen": { date: "2026-11-01" },
  };
  for (const [query, expected] of Object.entries(examples)) expect(dates(query)[0], query).toEqual(expected);
});

describe("formatMentionDate", () => {
  it("reads relative while close, then the full date", () => {
    expect(formatMentionDate({ date: "2026-10-30" }, "fr", NOW)).toBe("Aujourd’hui");
    expect(formatMentionDate({ date: "2026-10-31" }, "en", NOW)).toBe("Tomorrow");
    expect(formatMentionDate({ date: "2026-10-29" }, "de", NOW)).toBe("Gestern");
    expect(formatMentionDate({ date: "2026-11-15" }, "en", NOW)).toBe("November 15");
    expect(formatMentionDate({ date: "2027-01-02" }, "en", NOW)).toBe("January 2, 2027");
  });

  it("adds the time and the end, and stays absolute without a reader's day", () => {
    expect(formatMentionDate({ date: "2026-10-31", time: "09:30" }, "en", NOW)).toBe("Tomorrow 09:30 AM");
    expect(formatMentionDate({ date: "2026-11-02", end: "2026-11-04" }, "en", NOW)).toBe("November 2 → November 4");
    expect(formatMentionDate({ date: "2026-10-30" }, "en", null)).toBe("October 30, 2026");
  });
});

describe("the stored date", () => {
  it("keeps only well-formed metadata", () => {
    expect(mentionDateFrom("2026-11-02", { time: "09:30", end: "2026-11-01" })).toEqual({ date: "2026-11-02", time: "09:30" });
    expect(mentionDateFrom("2026-02-30")).toBeNull();
    expect(mentionDateMeta({ date: "2026-11-02" })).toBeNull();
    expect(mentionDateMeta({ date: "2026-11-02", time: "09:30", end: "2026-11-05" })).toEqual({ time: "09:30", end: "2026-11-05" });
  });
});

it("keeps the menu open on what may still become a date", () => {
  for (const query of ["d", "dem", "lundi pro", "15", "in", "nov"]) expect(isDatePrefix(query), query).toBe(true);
  for (const query of ["", "zz", "camille"]) expect(isDatePrefix(query), query).toBe(false);
});

it("tells how far a full date is from now, and nothing for one the pill already says", () => {
  expect(relativeMentionDate({ date: "2026-11-20" }, "en", NOW)).toBe("in 3 weeks");
  expect(relativeMentionDate({ date: "2026-10-25" }, "fr", NOW)).toBe("il y a 5 jours");
  expect(relativeMentionDate({ date: "2026-10-31" }, "en", NOW)).toBeNull();
  expect(relativeMentionDate({ date: "2026-10-30", time: "17:05" }, "en", NOW)).toBe("in 3 hours");
});

it("offers @date, which inserts now and opens the picker", () => {
  const options = dateMentionOptions("date", "en", NOW, "Pick a date…");
  expect(options.at(-1)).toEqual({
    type: "date", id: "2026-10-30", label: "Pick a date…", meta: { time: "14:05" }, openPicker: true,
  });
  for (const word of ["dat", "datum", "fecha", "data"]) {
    expect(dateMentionOptions(word, "fr", NOW, "Choisir une date…").some((option) => option.openPicker), word).toBe(true);
  }
  expect(dateMentionOptions("demain", "fr", NOW, "Choisir une date…").some((option) => option.openPicker)).toBe(false);
});

it("reads a time said in words, half and quarters included, in every language", () => {
  const tomorrowAt = (time: string) => ({ date: "2026-10-31", time });
  const examples: Record<string, { date: string; time?: string }> = {
    "demain à 8 heures et demi": tomorrowAt("08:30"),
    "demain à 8 heures et demie": tomorrowAt("08:30"),
    "demain 8h et quart": tomorrowAt("08:15"),
    "demain à 8 heures trois quarts": tomorrowAt("08:45"),
    "demain à 9 heures moins le quart": tomorrowAt("08:45"),
    "demain à midi et demi": tomorrowAt("12:30"),
    "demain midi": tomorrowAt("12:00"),
    "tomorrow at half past 8": tomorrowAt("08:30"),
    "tomorrow at quarter past 8": tomorrowAt("08:15"),
    "tomorrow at a quarter to 9": tomorrowAt("08:45"),
    "tomorrow at noon": tomorrowAt("12:00"),
    "morgen um halb 9": tomorrowAt("08:30"),
    "morgen um viertel nach 8": tomorrowAt("08:15"),
    "morgen um viertel vor 9": tomorrowAt("08:45"),
    "morgen um dreiviertel 9": tomorrowAt("08:45"),
    "mañana a las 8 y media": tomorrowAt("08:30"),
    "mañana a las 8 y cuarto": tomorrowAt("08:15"),
    "mañana a las 9 menos cuarto": tomorrowAt("08:45"),
    "domani alle 8 e mezza": tomorrowAt("08:30"),
    "domani alle 8 e un quarto": tomorrowAt("08:15"),
    "domani alle 8 e tre quarti": tomorrowAt("08:45"),
    "amanhã às 8 e meia": tomorrowAt("08:30"),
    "amanhã às 8 e quinze": tomorrowAt("08:15"),
    "amanhã quinze para as 9": tomorrowAt("08:45"),
    "jeudi dans 2 semaines à 8 heures et demie": { date: "2026-11-12", time: "08:30" },
    "vendredi à 9 heures moins le quart": { date: "2026-11-06", time: "08:45" },
    "friday at a quarter to 9": { date: "2026-11-06", time: "08:45" },
    "Freitag um viertel vor 9": { date: "2026-11-06", time: "08:45" },
    "viernes a las 9 menos cuarto": { date: "2026-11-06", time: "08:45" },
    "venerdì alle 9 meno un quarto": { date: "2026-11-06", time: "08:45" },
    "sexta quinze para as 9": { date: "2026-11-06", time: "08:45" },
  };
  for (const [query, expected] of Object.entries(examples)) expect(dates(query)[0], query).toEqual(expected);
  // The afternoon is not noon, and an offset is not a time.
  expect(spokenTimes("demain apres midi")).toBe("demain apres midi");
  expect(spokenTimes("dans 3 semaines")).toBe("dans 3 semaines");
});

it("lists dates first only for a query that clearly is one, so Enter picks it", () => {
  for (const query of ["date", "datum", "demain", "tomorrow", "demain à 9h", "jeudi dans 2 semaines", "15 novembre"]) {
    expect(datesFirst(query, "fr", NOW), query).toBe(true);
  }
  for (const query of ["dat", "dem", "camille", "design review"]) expect(datesFirst(query, "fr", NOW), query).toBe(false);
});

it("survives a typo per word, as search engines do", () => {
  const examples: Record<string, { date: string; time?: string }> = {
    // 8:30 has passed at 14:05: the next one.
    "8 heyre et demo": { date: "2026-10-31", time: "08:30" },
    "demian à 9h": { date: "2026-10-31", time: "09:00" },
    "dmeain": { date: "2026-10-31" },
    "tomorow at half past 8": { date: "2026-10-31", time: "08:30" },
    "jeudi dnas 2 semianes": { date: "2026-11-12" },
    "mercerdi": { date: "2026-11-04" },
    "15 novmbre": { date: "2026-11-15" },
    "morgn um halb 9": { date: "2026-10-31", time: "08:30" },
    "demian à 8 heyre et demi": { date: "2026-10-31", time: "08:30" },
    "mañna a las 8 y media": { date: "2026-10-31", time: "08:30" },
    "domnai alle 8 e mezza": { date: "2026-10-31", time: "08:30" },
    "amanah às 8 e meia": { date: "2026-10-31", time: "08:30" },
  };
  for (const [query, expected] of Object.entries(examples)) expect(dates(query)[0], query).toEqual(expected);
  // A word still being typed, a short word and a name stay as they are.
  expect(correctTypos("dema")).toBe("dema");
  expect(correctTypos("le 15")).toBe("le 15");
  expect(correctTypos("camille")).toBe("camille");
});
