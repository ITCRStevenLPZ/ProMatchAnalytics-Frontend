import { describe, it, expect } from "vitest";
import {
  locationToZoneId,
  computeHeatMapData,
  intensityToColor,
  ZONES,
  TOTAL_ZONES,
  ZONE_COLS,
  ZONE_ROWS,
  ZONE_W,
  ZONE_H,
} from "./heatMapZones";

describe("heatMapZones", () => {
  describe("ZONES", () => {
    it("should have 24 zones (6×4)", () => {
      expect(ZONES).toHaveLength(TOTAL_ZONES);
      expect(TOTAL_ZONES).toBe(24);
      expect(ZONE_COLS).toBe(6);
      expect(ZONE_ROWS).toBe(4);
    });

    it("should cover the full pitch width (120) and height (80)", () => {
      const maxX = Math.max(...ZONES.map((z) => z.x1));
      const maxY = Math.max(...ZONES.map((z) => z.y1));
      expect(maxX).toBe(120);
      expect(maxY).toBe(80);
    });

    it("each zone should have consistent dimensions", () => {
      for (const zone of ZONES) {
        expect(zone.x1 - zone.x0).toBe(ZONE_W);
        expect(zone.y1 - zone.y0).toBe(ZONE_H);
      }
    });
  });

  describe("locationToZoneId", () => {
    it("should return zone 0 for top-left corner (0, 0)", () => {
      expect(locationToZoneId(0, 0)).toBe(0);
    });

    it("should return zone 5 for top-right corner (119, 0)", () => {
      expect(locationToZoneId(119, 0)).toBe(5);
    });

    it("should return zone 18 for bottom-left (0, 79)", () => {
      expect(locationToZoneId(0, 79)).toBe(18);
    });

    it("should return zone 23 for bottom-right (120, 80)", () => {
      expect(locationToZoneId(120, 80)).toBe(23);
    });

    it("should return centre zone for mid-pitch (60, 40)", () => {
      // col 3 (60/20=3), row 2 (40/20=2) → id = 2*6+3 = 15
      expect(locationToZoneId(60, 40)).toBe(15);
    });

    it("should clamp negative values to zone 0", () => {
      expect(locationToZoneId(-5, -5)).toBe(0);
    });

    it("should clamp excessive values to zone 23", () => {
      expect(locationToZoneId(200, 200)).toBe(23);
    });

    it("should map penalty area locations correctly", () => {
      // Left penalty area: roughly x=8, y=40 → col 0, row 2 → zone 12
      expect(locationToZoneId(8, 40)).toBe(12);
      // Right penalty area: x=112, y=40 → col 5, row 2 → zone 17
      expect(locationToZoneId(112, 40)).toBe(17);
    });
  });

  describe("computeHeatMapData", () => {
    const events = [
      { team_id: "home", location: [10, 10] }, // zone 0
      { team_id: "home", location: [10, 10] }, // zone 0
      { team_id: "home", location: [60, 40] }, // zone 15
      { team_id: "away", location: [90, 60] }, // zone 16 (col 4, row 3)
      { team_id: "away", location: [110, 70] }, // zone 23
      { team_id: "home", location: null }, // no location, skipped
      { team_id: "away" }, // no location, skipped
    ] as any[];

    it("should count all events for combined heat map", () => {
      const data = computeHeatMapData(events);
      expect(data.total).toBe(5);
      expect(data.counts[0]).toBe(2); // two home events at (10,10)
      expect(data.counts[15]).toBe(1); // one home event at (60,40)
      expect(data.max).toBe(2);
    });

    it("should filter by team for home heat map", () => {
      const data = computeHeatMapData(events, "home");
      expect(data.total).toBe(3);
      expect(data.counts[0]).toBe(2);
      expect(data.counts[15]).toBe(1);
    });

    it("should filter by team for away heat map", () => {
      const data = computeHeatMapData(events, "away");
      expect(data.total).toBe(2);
      expect(data.counts[0]).toBe(0);
    });

    it("should return all zeros for empty events", () => {
      const data = computeHeatMapData([]);
      expect(data.total).toBe(0);
      expect(data.max).toBe(0);
      expect(data.counts.every((c) => c === 0)).toBe(true);
    });

    it("should skip events without location", () => {
      const evts = [
        { team_id: "home" },
        { team_id: "home", location: null },
        { team_id: "home", location: [] },
      ] as any[];
      const data = computeHeatMapData(evts);
      expect(data.total).toBe(0);
    });
  });

  describe("intensityToColor", () => {
    it("should return transparent for intensity 0", () => {
      expect(intensityToColor(0)).toBe("rgba(0,0,0,0)");
    });

    it("should return a yellow-ish colour for low intensity", () => {
      const color = intensityToColor(0.1);
      expect(color).toMatch(/^rgba\(255,/);
      // Green channel should be high (yellow)
      const g = parseInt(color.split(",")[1]);
      expect(g).toBeGreaterThan(200);
    });

    it("should return a red-ish colour for max intensity", () => {
      const color = intensityToColor(1.0);
      expect(color).toMatch(/^rgba\(220,40,0,/);
    });

    it("should clamp values above 1", () => {
      const color = intensityToColor(2.0);
      expect(color).toBe(intensityToColor(1.0));
    });
  });
});
