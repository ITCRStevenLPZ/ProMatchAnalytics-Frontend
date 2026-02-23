import { describe, it, expect } from "vitest";
import { computeTimerFormulas, TimerFormulaInput } from "../../utils";

/* ── helpers ──────────────────────────────────────────────────── */

const base: TimerFormulaInput = {
  effectiveTime: 600, // 10 min ball-in-play
  ineffectiveSeconds: 120, // 2 min total ineffective
  timeoutSeconds: 30,
  varTimeSeconds: 15,
  teamIneffective: { home: 70, away: 50 },
};

const make = (overrides: Partial<TimerFormulaInput> = {}) => ({
  ...base,
  ...overrides,
});

/* ── tests ────────────────────────────────────────────────────── */

describe("computeTimerFormulas", () => {
  /* ---------- globalSeconds ---------- */

  it("excludes VAR from globalSeconds (matches useMatchTimer formula)", () => {
    const result = computeTimerFormulas(make());
    // effective(600) + ineffective(120) + timeout(30) = 750  (VAR 15 excluded)
    expect(result.globalSeconds).toBe(750);
  });

  it("globalSeconds is zero when all inputs are zero", () => {
    const result = computeTimerFormulas(
      make({
        effectiveTime: 0,
        ineffectiveSeconds: 0,
        timeoutSeconds: 0,
        varTimeSeconds: 0,
        teamIneffective: { home: 0, away: 0 },
      }),
    );
    expect(result.globalSeconds).toBe(0);
  });

  /* ---------- effectiveSeconds ---------- */

  it("does NOT subtract team ineffective from effectiveTime (primary bug fix)", () => {
    const result = computeTimerFormulas(make());
    // Both teams see the full 600 s of effective time
    expect(result.homeEffectiveSeconds).toBe(600);
    expect(result.awayEffectiveSeconds).toBe(600);
  });

  it("effective seconds are equal for both teams", () => {
    const result = computeTimerFormulas(
      make({ teamIneffective: { home: 200, away: 10 } }),
    );
    expect(result.homeEffectiveSeconds).toBe(result.awayEffectiveSeconds);
  });

  /* ---------- effectivePercent ---------- */

  it("uses per-team denominator (effective + team ineffective) for effective %", () => {
    const result = computeTimerFormulas(make());
    // home: 600 / (600 + 70) * 100 = 89.6%
    expect(result.homeEffectivePercent).toBe("89.6%");
    // away: 600 / (600 + 50) * 100 = 92.3%
    expect(result.awayEffectivePercent).toBe("92.3%");
  });

  it("effective % is 100% when team has zero ineffective time", () => {
    const result = computeTimerFormulas(
      make({ teamIneffective: { home: 0, away: 0 } }),
    );
    expect(result.homeEffectivePercent).toBe("100.0%");
    expect(result.awayEffectivePercent).toBe("100.0%");
  });

  it("effective % is 0.0% when effectiveTime is zero (edge)", () => {
    const result = computeTimerFormulas(
      make({ effectiveTime: 0, teamIneffective: { home: 0, away: 0 } }),
    );
    expect(result.homeEffectivePercent).toBe("0.0%");
    expect(result.awayEffectivePercent).toBe("0.0%");
  });

  /* ---------- ineffectivePercent ---------- */

  it("uses per-team denominator for ineffective % (not share of total)", () => {
    const result = computeTimerFormulas(make());
    // home: 70 / (600 + 70) * 100 = 10.4%
    expect(result.homeIneffectivePercent).toBe("10.4%");
    // away: 50 / (600 + 50) * 100 = 7.7%
    expect(result.awayIneffectivePercent).toBe("7.7%");
  });

  it("ineffective % is 0.0% when team has zero ineffective time", () => {
    const result = computeTimerFormulas(
      make({ teamIneffective: { home: 0, away: 30 } }),
    );
    expect(result.homeIneffectivePercent).toBe("0.0%");
    // away: 30 / (600 + 30) = 4.8%
    expect(result.awayIneffectivePercent).toBe("4.8%");
  });

  it("ineffective % is 0.0% when both effective and team ineffective are zero", () => {
    const result = computeTimerFormulas(
      make({ effectiveTime: 0, teamIneffective: { home: 0, away: 0 } }),
    );
    expect(result.homeIneffectivePercent).toBe("0.0%");
    expect(result.awayIneffectivePercent).toBe("0.0%");
  });

  /* ---------- complementary property ---------- */

  it("effective % + ineffective % add up to 100% for each team (since they share the same denom)", () => {
    const result = computeTimerFormulas(make());
    const parseP = (s: string) => parseFloat(s.replace("%", ""));

    const homeSum =
      parseP(result.homeEffectivePercent) +
      parseP(result.homeIneffectivePercent);
    const awaySum =
      parseP(result.awayEffectivePercent) +
      parseP(result.awayIneffectivePercent);

    // Allow 0.2% tolerance for floating-point rounding after .toFixed(1)
    expect(homeSum).toBeCloseTo(100, 0);
    expect(awaySum).toBeCloseTo(100, 0);
  });

  /* ---------- timer independence ---------- */

  it("changing VAR time does not affect effective or ineffective values", () => {
    const a = computeTimerFormulas(make({ varTimeSeconds: 0 }));
    const b = computeTimerFormulas(make({ varTimeSeconds: 999 }));

    expect(a.homeEffectiveSeconds).toBe(b.homeEffectiveSeconds);
    expect(a.awayEffectiveSeconds).toBe(b.awayEffectiveSeconds);
    expect(a.homeEffectivePercent).toBe(b.homeEffectivePercent);
    expect(a.awayEffectivePercent).toBe(b.awayEffectivePercent);
    expect(a.homeIneffectivePercent).toBe(b.homeIneffectivePercent);
    expect(a.awayIneffectivePercent).toBe(b.awayIneffectivePercent);
    // globalSeconds also should not change with VAR
    expect(a.globalSeconds).toBe(b.globalSeconds);
  });

  it("changing timeout does not affect effective or ineffective percentages", () => {
    const a = computeTimerFormulas(make({ timeoutSeconds: 0 }));
    const b = computeTimerFormulas(make({ timeoutSeconds: 300 }));

    expect(a.homeEffectivePercent).toBe(b.homeEffectivePercent);
    expect(a.awayEffectivePercent).toBe(b.awayEffectivePercent);
    expect(a.homeIneffectivePercent).toBe(b.homeIneffectivePercent);
    expect(a.awayIneffectivePercent).toBe(b.awayIneffectivePercent);
  });

  /* ---------- regression guard: effective never decreases when team ineffective increases ---------- */

  it("effective seconds stay constant as team ineffective grows (regression guard)", () => {
    for (let teamIneff = 0; teamIneff <= 500; teamIneff += 50) {
      const result = computeTimerFormulas(
        make({ teamIneffective: { home: teamIneff, away: 0 } }),
      );
      expect(result.homeEffectiveSeconds).toBe(600);
      expect(result.awayEffectiveSeconds).toBe(600);
    }
  });

  /* ---------- totalEffectiveTime and totalIneffectiveSeconds ---------- */

  it("totalEffectiveTime equals the effectiveTime input", () => {
    const result = computeTimerFormulas(make());
    expect(result.totalEffectiveTime).toBe(600);
  });

  it("totalIneffectiveSeconds equals the ineffectiveSeconds input", () => {
    const result = computeTimerFormulas(make());
    expect(result.totalIneffectiveSeconds).toBe(120);
  });

  it("totalEffectiveTime + totalIneffectiveSeconds + timeout = globalSeconds", () => {
    const result = computeTimerFormulas(make());
    expect(
      result.totalEffectiveTime +
        result.totalIneffectiveSeconds +
        base.timeoutSeconds,
    ).toBe(result.globalSeconds);
  });

  it("total fields are zero when all inputs are zero", () => {
    const result = computeTimerFormulas(
      make({
        effectiveTime: 0,
        ineffectiveSeconds: 0,
        timeoutSeconds: 0,
        varTimeSeconds: 0,
        teamIneffective: { home: 0, away: 0 },
      }),
    );
    expect(result.totalEffectiveTime).toBe(0);
    expect(result.totalIneffectiveSeconds).toBe(0);
  });
});
