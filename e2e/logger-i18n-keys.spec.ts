import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const loadLoggerLocale = (locale: "en" | "es"): JsonRecord => {
  const filePath = path.join(
    process.cwd(),
    "public",
    "locales",
    locale,
    "logger.json",
  );
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as JsonRecord;
};

const getNestedValue = (obj: JsonRecord, dottedPath: string): unknown =>
  dottedPath.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as JsonRecord)[segment];
  }, obj);

const REQUIRED_LOGGER_KEYS = [
  "homeTeam",
  "awayTeam",
  "analytics.score",
  "analytics.effectiveTimePercent",
] as const;

test.describe("Logger locale key coverage", () => {
  for (const locale of ["en", "es"] as const) {
    test(`required logger keys exist and are non-empty (${locale})`, async () => {
      const localeJson = loadLoggerLocale(locale);

      for (const key of REQUIRED_LOGGER_KEYS) {
        const value = getNestedValue(localeJson, key);
        expect(value, `Missing locale key: ${locale}.${key}`).toBeDefined();
        expect(
          typeof value,
          `Locale value must be a string: ${locale}.${key}`,
        ).toBe("string");
        expect((value as string).trim().length).toBeGreaterThan(0);
      }
    });
  }
});
