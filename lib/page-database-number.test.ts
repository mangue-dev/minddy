import { describe, expect, it } from "vitest";
import {
  formatDatabaseNumber,
  isDatabaseCurrency,
  isDatabaseNumberDraft,
  detectDatabaseNumberFormat,
  evaluateDatabaseNumber,
  isDatabaseNumberExpression,
  parseDatabaseNumber,
} from "./page-database-number";

describe("number cell parsing", () => {
  it("reads figures the way people write them", () => {
    expect(parseDatabaseNumber("42")).toBe(42);
    expect(parseDatabaseNumber("12,5")).toBe(12.5);
    expect(parseDatabaseNumber("-0.25")).toBe(-0.25);
    expect(parseDatabaseNumber("1 234,50 €")).toBe(1234.5);
    expect(parseDatabaseNumber("$1,234.50")).toBe(1234.5);
    expect(parseDatabaseNumber("1.234,5")).toBe(1234.5);
    expect(parseDatabaseNumber("1,234,567")).toBe(1234567);
    expect(parseDatabaseNumber("  ")).toBeNull();
    expect(parseDatabaseNumber("")).toBeNull();
  });

  it("keeps a lone percentage as its figure", () => {
    expect(parseDatabaseNumber("25 %")).toBe(25);
    expect(parseDatabaseNumber("-7,5%")).toBe(-7.5);
  });

  it("evaluates calculations with the usual precedence", () => {
    expect(evaluateDatabaseNumber("14 + 2")).toBe(16);
    expect(evaluateDatabaseNumber("2 + 3 * 4")).toBe(14);
    expect(evaluateDatabaseNumber("(2 + 3) * 4")).toBe(20);
    expect(evaluateDatabaseNumber("10 / 4")).toBe(2.5);
    expect(evaluateDatabaseNumber("2 ^ 3 ^ 2")).toBe(512);
    expect(evaluateDatabaseNumber("-(3 - 5) × 2")).toBe(4);
    expect(evaluateDatabaseNumber("9 ÷ 3 − 1")).toBe(2);
    expect(evaluateDatabaseNumber("0.1 + 0.2")).toBe(0.3);
    expect(evaluateDatabaseNumber("1 200,50 € * 2")).toBe(2401);
  });

  it("applies a percentage inside a calculation as a calculator does", () => {
    expect(evaluateDatabaseNumber("80 + 20 %")).toBe(96);
    expect(evaluateDatabaseNumber("200 - 10%")).toBe(180);
    expect(evaluateDatabaseNumber("200 * 10%")).toBe(20);
  });

  it("refuses what is not a figure or a calculation", () => {
    expect(evaluateDatabaseNumber("abc")).toBeUndefined();
    expect(evaluateDatabaseNumber("1 +")).toBeUndefined();
    expect(evaluateDatabaseNumber("(1 + 2")).toBeUndefined();
    expect(evaluateDatabaseNumber("1 / 0")).toBeUndefined();
    expect(evaluateDatabaseNumber("1..2")).toBeUndefined();
    expect(evaluateDatabaseNumber("€")).toBeUndefined();
    expect(evaluateDatabaseNumber("constructor")).toBeUndefined();
  });

  it("reads a calculation in the cell editor only", () => {
    expect(parseDatabaseNumber("14 + 2")).toBeUndefined();
    // An imported date is not a subtraction.
    expect(parseDatabaseNumber("2026-01-05")).toBeUndefined();
    expect(parseDatabaseNumber("-14")).toBe(-14);
  });

  it("lets a draft hold operators and units, never letters", () => {
    expect(isDatabaseNumberDraft("(14 + 2) * 3 %")).toBe(true);
    expect(isDatabaseNumberDraft("12 €")).toBe(true);
    // Letters are let through for a currency code and judged on save.
    expect(isDatabaseNumberDraft("12 chf")).toBe(true);
    expect(isDatabaseNumberDraft("12 @")).toBe(false);
    expect(evaluateDatabaseNumber("12a")).toBeUndefined();
    expect(isDatabaseNumberExpression("14 + 2")).toBe(true);
    expect(isDatabaseNumberExpression("-14")).toBe(false);
  });
});

describe("format taken from what is typed", () => {
  it("reads a currency from its sign or its code", () => {
    expect(detectDatabaseNumberFormat("12 €")).toEqual({ number_format: "currency", currency: "EUR" });
    expect(detectDatabaseNumberFormat("$1,200")).toEqual({ number_format: "currency", currency: "USD" });
    expect(detectDatabaseNumberFormat("40 chf")).toEqual({ number_format: "currency", currency: "CHF" });
    expect(detectDatabaseNumberFormat("(14 + 2) * 10 €")).toEqual({ number_format: "currency", currency: "EUR" });
    expect(evaluateDatabaseNumber("40 CHF")).toBe(40);
    expect(parseDatabaseNumber("USD 1,5")).toBe(1.5);
  });

  it("reads a percentage from one figure followed by the sign", () => {
    expect(detectDatabaseNumberFormat("25 %")).toEqual({ number_format: "percent" });
    expect(detectDatabaseNumberFormat("-7,5%")).toEqual({ number_format: "percent" });
  });

  it("leaves the column alone for a plain figure or a calculation", () => {
    expect(detectDatabaseNumberFormat("25")).toBeNull();
    expect(detectDatabaseNumberFormat("80 + 20 %")).toBeNull();
    expect(detectDatabaseNumberFormat("")).toBeNull();
  });
});

describe("number cell display", () => {
  it("keeps a plain number as typed", () => {
    expect(formatDatabaseNumber(2026, undefined, "fr")).toBe("2026");
    expect(formatDatabaseNumber(1234.5, { number_format: "number" }, "en")).toBe("1234.5");
    // Thousands are grouped from five digits on, in the reader's locale.
    expect(formatDatabaseNumber(12345.5, undefined, "en")).toBe("12,345.5");
    expect(formatDatabaseNumber(1234567, undefined, "de")).toBe("1.234.567");
    expect(formatDatabaseNumber(1.5, undefined, "fr")).toBe("1,5");
  });

  it("shows a percentage without rescaling the value", () => {
    expect(formatDatabaseNumber(25, { number_format: "percent" }, "en")).toBe("25%");
  });

  it("shows a currency in the reader's locale", () => {
    expect(formatDatabaseNumber(1234.5, { number_format: "currency", currency: "USD" }, "en"))
      .toBe("$1,234.50");
    expect(formatDatabaseNumber(5, { number_format: "currency", currency: "EUR" }, "fr"))
      .toMatch(/^5,00\s€$/);
  });

  it("falls back to the plain figure for an unknown currency", () => {
    expect(isDatabaseCurrency("XXX")).toBe(false);
    expect(formatDatabaseNumber(5, { number_format: "currency", currency: "XXX" }, "en")).toBe("5");
  });
});
