import type { MatchEvent } from "../../../store/useMatchLogStore";

export const parseTimestampSafe = (timestamp?: string | null): number => {
  if (!timestamp) return 0;
  const normalized =
    timestamp.endsWith("Z") ||
    timestamp.includes("+") ||
    timestamp.includes("-", 10)
      ? timestamp
      : `${timestamp}Z`;
  return new Date(normalized).getTime();
};

export const parseClockToSeconds = (clock?: string): number => {
  if (!clock) return 0;
  const [mm, rest] = clock.split(":");
  const seconds = parseFloat(rest || "0");
  return Number(mm) * 60 + seconds;
};

export const compareCardEventOrder = (
  left: { event: MatchEvent; index: number },
  right: { event: MatchEvent; index: number },
) => {
  const leftPeriod = Number(left.event.period || 0);
  const rightPeriod = Number(right.event.period || 0);
  if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;

  const leftTs = Date.parse(left.event.timestamp || "");
  const rightTs = Date.parse(right.event.timestamp || "");
  const leftHasTs = Number.isFinite(leftTs);
  const rightHasTs = Number.isFinite(rightTs);
  if (leftHasTs && rightHasTs && leftTs !== rightTs) return leftTs - rightTs;

  const leftClock = parseClockToSeconds(left.event.match_clock);
  const rightClock = parseClockToSeconds(right.event.match_clock);
  if (leftClock !== rightClock) return leftClock - rightClock;

  return left.index - right.index;
};

export const compareSubstitutionEventOrder = (
  left: { event: MatchEvent; index: number },
  right: { event: MatchEvent; index: number },
) => {
  const leftPeriod = Number(left.event.period || 0);
  const rightPeriod = Number(right.event.period || 0);
  if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;

  const leftClock = parseClockToSeconds(left.event.match_clock);
  const rightClock = parseClockToSeconds(right.event.match_clock);
  if (leftClock !== rightClock) return leftClock - rightClock;

  const leftTs = Date.parse(left.event.timestamp || left.event._saved_at || "");
  const rightTs = Date.parse(
    right.event.timestamp || right.event._saved_at || "",
  );
  const leftHasTs = Number.isFinite(leftTs);
  const rightHasTs = Number.isFinite(rightTs);
  if (leftHasTs && rightHasTs && leftTs !== rightTs) return leftTs - rightTs;

  return left.index - right.index;
};

export const formatSecondsAsClock = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export const formatSecondsAsClockWithMs = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const mins = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const ms = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(mins).padStart(2, "0")}:${String(wholeSeconds).padStart(
    2,
    "0",
  )}.${String(ms).padStart(3, "0")}`;
};

export const addMillisecondsToClock = (
  clock: string,
  deltaMs: number,
): string => {
  const match = clock.match(/^(\d+):(\d{2})(?:\.(\d{3}))?$/);
  if (!match) return clock;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const milliseconds = Number(match[3] || 0);
  const totalMs = minutes * 60_000 + seconds * 1_000 + milliseconds + deltaMs;
  const safeTotal = Math.max(0, totalMs);
  const nextMinutes = Math.floor(safeTotal / 60_000);
  const remainder = safeTotal % 60_000;
  const nextSeconds = Math.floor(remainder / 1_000);
  const nextMs = remainder % 1_000;
  return `${String(nextMinutes).padStart(2, "0")}:${String(
    nextSeconds,
  ).padStart(2, "0")}.${String(nextMs).padStart(3, "0")}`;
};

export const getActiveYellowCountForPlayer = (
  events: MatchEvent[],
  playerId: string,
): number => {
  let yellow = 0;
  let red = 0;

  events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) => event.type === "Card" && event.player_id === playerId,
    )
    .sort(compareCardEventOrder)
    .forEach(({ event }) => {
      const cardType = String(event.data?.card_type || "").toLowerCase();

      if (cardType.includes("cancel")) {
        if (red > 0 && yellow >= 2) {
          red -= 1;
          yellow -= 1;
        } else if (red > 0) {
          red -= 1;
        } else if (yellow > 0) {
          yellow -= 1;
        }
        return;
      }

      if (cardType.includes("yellow")) {
        yellow += 1;
        return;
      }

      if (cardType.includes("red")) {
        red += 1;
      }
    });

  return yellow;
};
