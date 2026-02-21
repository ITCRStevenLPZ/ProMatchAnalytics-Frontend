import { describe, it, expect } from "vitest";

import { useActionFlow } from "./useActionFlow";
import { useAudioFeedback } from "./useAudioFeedback";
import { useClockDrift } from "./useClockDrift";
import { useCockpitAutoEffects } from "./useCockpitAutoEffects";
import { useCockpitClockHandlers } from "./useCockpitClockHandlers";
import { useCockpitE2EPlayersSeed } from "./useCockpitE2EPlayersSeed";
import { useCockpitEventHandlers } from "./useCockpitEventHandlers";
import { useCockpitExpelledPlayerEffect } from "./useCockpitExpelledPlayerEffect";
import { useCockpitHarness } from "./useCockpitHarness";
import { useCockpitHarnessEvents } from "./useCockpitHarnessEvents";
import { useCockpitIneffectiveBreakdown } from "./useCockpitIneffectiveBreakdown";
import { useCockpitIneffectiveTickEffect } from "./useCockpitIneffectiveTickEffect";
import { useCockpitInteractionHandlers } from "./useCockpitInteractionHandlers";
import { useCockpitKeyboardHandlers } from "./useCockpitKeyboardHandlers";
import { useCockpitLifecycleEffects } from "./useCockpitLifecycleEffects";
import { useCockpitLocalEffects } from "./useCockpitLocalEffects";
import { useCockpitStatusProjection } from "./useCockpitStatusProjection";
import { useCockpitSubstitutionFlow } from "./useCockpitSubstitutionFlow";
import { useCockpitToast } from "./useCockpitToast";
import { useCockpitTransitionState } from "./useCockpitTransitionState";
import { useCockpitVarDerivedState } from "./useCockpitVarDerivedState";
import { useDisciplinary } from "./useDisciplinary";
import { useDuplicateTelemetry } from "./useDuplicateTelemetry";
import { useIneffectiveTime } from "./useIneffectiveTime";
import { useLiveScore } from "./useLiveScore";
import { useMatchData } from "./useMatchData";
import { useMatchTimer } from "./useMatchTimer";
import { useOnFieldRoster } from "./useOnFieldRoster";
import { usePeriodManager } from "./usePeriodManager";
import { useResetMatch } from "./useResetMatch";
import { useTimeoutTimer } from "./useTimeoutTimer";
import { useTransitionGuards } from "./useTransitionGuards";
import { useUnifiedClockDisplay } from "./useUnifiedClockDisplay";
import { useVarTimer } from "./useVarTimer";

type HookContract = {
  name: string;
  hook: unknown;
};

const HOOK_CONTRACTS: HookContract[] = [
  { name: "useActionFlow", hook: useActionFlow },
  { name: "useAudioFeedback", hook: useAudioFeedback },
  { name: "useClockDrift", hook: useClockDrift },
  { name: "useCockpitAutoEffects", hook: useCockpitAutoEffects },
  { name: "useCockpitClockHandlers", hook: useCockpitClockHandlers },
  { name: "useCockpitE2EPlayersSeed", hook: useCockpitE2EPlayersSeed },
  { name: "useCockpitEventHandlers", hook: useCockpitEventHandlers },
  {
    name: "useCockpitExpelledPlayerEffect",
    hook: useCockpitExpelledPlayerEffect,
  },
  { name: "useCockpitHarness", hook: useCockpitHarness },
  { name: "useCockpitHarnessEvents", hook: useCockpitHarnessEvents },
  {
    name: "useCockpitIneffectiveBreakdown",
    hook: useCockpitIneffectiveBreakdown,
  },
  {
    name: "useCockpitIneffectiveTickEffect",
    hook: useCockpitIneffectiveTickEffect,
  },
  {
    name: "useCockpitInteractionHandlers",
    hook: useCockpitInteractionHandlers,
  },
  { name: "useCockpitKeyboardHandlers", hook: useCockpitKeyboardHandlers },
  { name: "useCockpitLifecycleEffects", hook: useCockpitLifecycleEffects },
  { name: "useCockpitLocalEffects", hook: useCockpitLocalEffects },
  { name: "useCockpitStatusProjection", hook: useCockpitStatusProjection },
  {
    name: "useCockpitSubstitutionFlow",
    hook: useCockpitSubstitutionFlow,
  },
  { name: "useCockpitToast", hook: useCockpitToast },
  { name: "useCockpitTransitionState", hook: useCockpitTransitionState },
  { name: "useCockpitVarDerivedState", hook: useCockpitVarDerivedState },
  { name: "useDisciplinary", hook: useDisciplinary },
  { name: "useDuplicateTelemetry", hook: useDuplicateTelemetry },
  { name: "useIneffectiveTime", hook: useIneffectiveTime },
  { name: "useLiveScore", hook: useLiveScore },
  { name: "useMatchData", hook: useMatchData },
  { name: "useMatchTimer", hook: useMatchTimer },
  { name: "useOnFieldRoster", hook: useOnFieldRoster },
  { name: "usePeriodManager", hook: usePeriodManager },
  { name: "useResetMatch", hook: useResetMatch },
  { name: "useTimeoutTimer", hook: useTimeoutTimer },
  { name: "useTransitionGuards", hook: useTransitionGuards },
  { name: "useUnifiedClockDisplay", hook: useUnifiedClockDisplay },
  { name: "useVarTimer", hook: useVarTimer },
];

describe("logger hooks contract", () => {
  it("covers all logger hook exports", () => {
    expect(HOOK_CONTRACTS).toHaveLength(34);
  });

  it.each(HOOK_CONTRACTS)("$name is exported as a function", ({ hook }) => {
    expect(typeof hook).toBe("function");
  });
});
