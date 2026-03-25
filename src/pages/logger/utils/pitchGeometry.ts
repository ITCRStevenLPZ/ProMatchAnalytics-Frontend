import { PITCH_HEIGHT, PITCH_WIDTH } from "./heatMapZones";

// IFAB reference dimensions (meters) for a professional 11v11 pitch.
// Source: Law 1 "The Field of Play" (IFAB). We use a common reference pitch
// size (105m x 68m) and map it into the internal StatsBomb-style coordinate
// space (120 x 80) used across the logger.
const REF_LENGTH_M = 105;
const REF_WIDTH_M = 68;

export const toPitchX = (meters: number) =>
  (meters / REF_LENGTH_M) * PITCH_WIDTH;
export const toPitchY = (meters: number) =>
  (meters / REF_WIDTH_M) * PITCH_HEIGHT;

export const PITCH_MARKINGS = {
  penaltyAreaDepth: toPitchX(16.5),
  penaltyAreaHeight: toPitchY(40.32),
  goalAreaDepth: toPitchX(5.5),
  goalAreaHeight: toPitchY(18.32),
  centerCircleRx: toPitchX(9.15),
  centerCircleRy: toPitchY(9.15),
  penaltyMarkX: toPitchX(11),
  penaltyMarkRadius: 0.5,
  cornerArcR: toPitchX(1),
};

export const PITCH_MARKINGS_DERIVED = {
  penaltyAreaY: (PITCH_HEIGHT - PITCH_MARKINGS.penaltyAreaHeight) / 2,
  goalAreaY: (PITCH_HEIGHT - PITCH_MARKINGS.goalAreaHeight) / 2,
};

// Penalty arc endpoints are where the penalty-circle intersects the penalty box
// line. Because x and y scales differ slightly (120/105 vs 80/68), the circle
// is represented as an ellipse in pitch coordinates.
const penaltyArcXOffset =
  PITCH_MARKINGS.penaltyAreaDepth - PITCH_MARKINGS.penaltyMarkX;
const penaltyArcTerm =
  1 -
  (penaltyArcXOffset * penaltyArcXOffset) /
    (PITCH_MARKINGS.centerCircleRx * PITCH_MARKINGS.centerCircleRx);

export const PENALTY_ARC_Y_OFFSET =
  PITCH_MARKINGS.centerCircleRy * Math.sqrt(Math.max(0, penaltyArcTerm));
