import { useMemo } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import type { Match } from "../types";

/** Per-player aggregate stats derived from live + queued events. */
export interface PlayerStats {
  playerId: string;
  playerName: string;
  jerseyNumber: number;
  teamSide: "home" | "away";
  /** Total events where this player is the author */
  totalEvents: number;
  passesGood: number;
  passesBad: number;
  passesReceived: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  duelsWon: number;
  duelsLost: number;
  foulsCommitted: number;
  foulsReceived: number;
  interceptions: number;
  recoveries: number;
  clearances: number;
  blocks: number;
  yellowCards: number;
  redCards: number;
}

const EMPTY: PlayerStats[] = [];

/**
 * Aggregates per-player statistics from match events.
 *
 * Author player is always `event.player_id`.
 * Destination / target player varies by event type and lives in `event.data`:
 *   - Pass → `data.receiver_id`
 *   - FoulCommitted → `data.target_player_id`
 *   - Duel → `data.target_player_id`
 */
export function usePlayerStats(
  match: Match | null,
  events: MatchEvent[],
): PlayerStats[] {
  return useMemo(() => {
    if (!match || events.length === 0) return EMPTY;

    const homeTeamId = match.home_team.id;

    // Build a lookup: playerId → { name, jersey, teamSide }
    const playerLookup = new Map<
      string,
      { name: string; jersey: number; teamSide: "home" | "away" }
    >();
    for (const p of match.home_team.players) {
      playerLookup.set(p.id, {
        name: p.short_name || p.full_name,
        jersey: p.jersey_number,
        teamSide: "home",
      });
    }
    for (const p of match.away_team.players) {
      playerLookup.set(p.id, {
        name: p.short_name || p.full_name,
        jersey: p.jersey_number,
        teamSide: "away",
      });
    }

    const statsMap = new Map<string, PlayerStats>();

    const getOrCreate = (playerId: string): PlayerStats => {
      let s = statsMap.get(playerId);
      if (!s) {
        const info = playerLookup.get(playerId);
        s = {
          playerId,
          playerName: info?.name ?? `#${playerId}`,
          jerseyNumber: info?.jersey ?? 0,
          teamSide: info?.teamSide ?? "home",
          totalEvents: 0,
          passesGood: 0,
          passesBad: 0,
          passesReceived: 0,
          shots: 0,
          shotsOnTarget: 0,
          goals: 0,
          duelsWon: 0,
          duelsLost: 0,
          foulsCommitted: 0,
          foulsReceived: 0,
          interceptions: 0,
          recoveries: 0,
          clearances: 0,
          blocks: 0,
          yellowCards: 0,
          redCards: 0,
        };
        statsMap.set(playerId, s);
      }
      return s;
    };

    for (const event of events) {
      const authorId = event.player_id;
      if (!authorId) continue;

      const isHomeTeam = event.team_id === homeTeamId;
      const author = getOrCreate(authorId);

      // Ensure teamSide is correct based on event data
      if (!playerLookup.has(authorId)) {
        author.teamSide = isHomeTeam ? "home" : "away";
      }

      author.totalEvents++;

      const data = event.data ?? {};
      const type = event.type;

      switch (type) {
        case "Pass": {
          const outcome = String(data.outcome ?? "").toLowerCase();
          if (outcome === "complete") {
            author.passesGood++;
            // Credit the receiver with passesReceived
            const receiverId =
              data.receiver_id ?? data.recipient_id ?? undefined;
            if (receiverId) {
              getOrCreate(receiverId).passesReceived++;
            }
          } else {
            // Incomplete, Out, Pass Offside
            author.passesBad++;
          }
          break;
        }

        case "Shot": {
          author.shots++;
          const outcome = String(data.outcome ?? "").toLowerCase();
          if (
            outcome === "goal" ||
            outcome === "saved" ||
            outcome === "ontarget" ||
            outcome === "on target"
          ) {
            author.shotsOnTarget++;
          }
          if (outcome === "goal") {
            author.goals++;
          }
          break;
        }

        case "Duel": {
          const outcome = String(data.outcome ?? "").toLowerCase();
          if (outcome === "won") {
            author.duelsWon++;
          } else {
            author.duelsLost++;
          }
          break;
        }

        case "FoulCommitted": {
          author.foulsCommitted++;
          // Credit the fouled player with foulsReceived
          const fouledId = data.target_player_id ?? data.opponent_id;
          if (fouledId) {
            getOrCreate(fouledId).foulsReceived++;
          }
          break;
        }

        case "Card": {
          const cardType = String(data.card_type ?? "").toLowerCase();
          if (cardType.includes("cancel")) {
            // Cancelled cards are not counted
          } else if (cardType.includes("red")) {
            author.redCards++;
          } else if (cardType.includes("yellow")) {
            author.yellowCards++;
          }
          break;
        }

        case "Interception":
          author.interceptions++;
          break;

        case "Recovery":
          author.recoveries++;
          break;

        case "Clearance":
          author.clearances++;
          break;

        case "Block":
          author.blocks++;
          break;

        default:
          break;
      }
    }

    // Return sorted: home first, then away, within each group by jersey number
    return Array.from(statsMap.values()).sort((a, b) => {
      if (a.teamSide !== b.teamSide) {
        return a.teamSide === "home" ? -1 : 1;
      }
      return a.jerseyNumber - b.jerseyNumber;
    });
  }, [match, events]);
}
