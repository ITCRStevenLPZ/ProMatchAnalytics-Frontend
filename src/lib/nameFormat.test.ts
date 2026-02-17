import { describe, expect, it } from "vitest";

import { formatPlayerName } from "./nameFormat";

describe("formatPlayerName", () => {
  it("converts uppercase full names to title case", () => {
    expect(formatPlayerName("LIONEL ANDRES MESSI")).toBe("Lionel Andres Messi");
  });

  it("normalizes mixed casing and extra spaces", () => {
    expect(formatPlayerName("  keVin   DE brUyNe  ")).toBe("Kevin De Bruyne");
  });

  it("preserves identifier-like values", () => {
    expect(formatPlayerName("HOME_10_PLAYER")).toBe("HOME_10_PLAYER");
  });

  it("supports punctuation within names", () => {
    expect(formatPlayerName("O'CONNOR-SMITH")).toBe("O'Connor-Smith");
  });
});
