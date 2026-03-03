import { useState, useMemo } from "react";
import {
  Users,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "../../../../components/icons";
import type { PlayerStats } from "../../hooks/usePlayerStats";

type SortField = keyof Pick<
  PlayerStats,
  | "jerseyNumber"
  | "totalEvents"
  | "passesGood"
  | "passesBad"
  | "passesReceived"
  | "shots"
  | "shotsOnTarget"
  | "goals"
  | "penalties"
  | "penaltyGoals"
  | "duelsWon"
  | "duelsLost"
  | "foulsCommitted"
  | "foulsReceived"
  | "interceptions"
  | "recoveries"
  | "clearances"
  | "blocks"
  | "yellowCards"
  | "redCards"
>;

type TeamFilter = "all" | "home" | "away";

interface ColumnDef {
  key: SortField;
  label: string;
  abbr: string;
  group: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "jerseyNumber", label: "Jersey", abbr: "#", group: "info" },
  { key: "totalEvents", label: "Events", abbr: "EVT", group: "general" },
  { key: "passesGood", label: "Good Passes", abbr: "PG", group: "passing" },
  { key: "passesBad", label: "Bad Passes", abbr: "PB", group: "passing" },
  {
    key: "passesReceived",
    label: "Passes Received",
    abbr: "PR",
    group: "passing",
  },
  { key: "shots", label: "Shots", abbr: "SH", group: "shooting" },
  {
    key: "shotsOnTarget",
    label: "Shots on Target",
    abbr: "SOT",
    group: "shooting",
  },
  { key: "goals", label: "Goals", abbr: "G", group: "shooting" },
  { key: "penalties", label: "Penalties", abbr: "PEN", group: "shooting" },
  {
    key: "penaltyGoals",
    label: "Penalty Goals",
    abbr: "PGO",
    group: "shooting",
  },
  { key: "duelsWon", label: "Duels Won", abbr: "DW", group: "duels" },
  { key: "duelsLost", label: "Duels Lost", abbr: "DL", group: "duels" },
  {
    key: "foulsCommitted",
    label: "Fouls Done",
    abbr: "FC",
    group: "discipline",
  },
  {
    key: "foulsReceived",
    label: "Fouls Received",
    abbr: "FR",
    group: "discipline",
  },
  {
    key: "interceptions",
    label: "Interceptions",
    abbr: "INT",
    group: "defensive",
  },
  { key: "recoveries", label: "Recoveries", abbr: "REC", group: "defensive" },
  { key: "clearances", label: "Clearances", abbr: "CLR", group: "defensive" },
  { key: "blocks", label: "Blocks", abbr: "BLK", group: "defensive" },
  {
    key: "yellowCards",
    label: "Yellow Cards",
    abbr: "YC",
    group: "discipline",
  },
  { key: "redCards", label: "Red Cards", abbr: "RC", group: "discipline" },
];

interface PlayerStatsTableProps {
  stats: PlayerStats[];
  homeTeamName: string;
  awayTeamName: string;
  t: (key: string, fallback: string) => string;
}

export function PlayerStatsTable({
  stats,
  homeTeamName,
  awayTeamName,
  t,
}: PlayerStatsTableProps) {
  const [sortField, setSortField] = useState<SortField>("totalEvents");
  const [sortAsc, setSortAsc] = useState(false);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");

  const filtered = useMemo(() => {
    let rows = stats;
    if (teamFilter !== "all") {
      rows = rows.filter((r) => r.teamSide === teamFilter);
    }
    return [...rows].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      const diff = (av as number) - (bv as number);
      return sortAsc ? diff : -diff;
    });
  }, [stats, sortField, sortAsc, teamFilter]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (field !== sortField) {
      return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    }
    return sortAsc ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  if (stats.length === 0) {
    return (
      <div
        className="bg-white rounded-lg shadow-lg p-6 text-center text-gray-400"
        data-testid="player-stats-table"
      >
        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>{t("analytics.noPlayerStats", "No player events recorded yet")}</p>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg shadow-lg p-4 sm:p-6"
      data-testid="player-stats-table"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Users className="text-indigo-600" />
          {t("analytics.playerStats", "Player Statistics")}
        </h3>

        {/* Team filter buttons */}
        <div
          className="flex gap-1 rounded-lg bg-gray-100 p-1"
          data-testid="player-stats-team-filter"
        >
          {(
            [
              { key: "all", label: t("analytics.allTeams", "All") },
              { key: "home", label: homeTeamName },
              { key: "away", label: awayTeamName },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setTeamFilter(opt.key as TeamFilter)}
              data-testid={`player-stats-filter-${opt.key}`}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                teamFilter === opt.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto -mx-4 sm:-mx-6">
        <div className="min-w-[900px] px-4 sm:px-6">
          <table className="w-full text-sm" data-testid="player-stats-grid">
            <thead>
              <tr className="border-b-2 border-gray-200">
                {/* Player name column */}
                <th className="text-left py-2 px-2 font-semibold text-gray-700 sticky left-0 bg-white z-10 min-w-[130px]">
                  {t("analytics.player", "Player")}
                </th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="py-2 px-1 text-center cursor-pointer select-none hover:bg-gray-50 transition-colors"
                    title={col.label}
                    onClick={() => handleSort(col.key)}
                    data-testid={`player-stats-col-${col.abbr.replace(
                      /[^a-zA-Z0-9]/g,
                      "",
                    )}`}
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="font-semibold text-gray-600 text-xs">
                        {col.abbr}
                      </span>
                      <SortIcon field={col.key} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr
                  key={player.playerId}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  data-testid={`player-stats-row-${player.playerId}`}
                >
                  {/* Player name cell */}
                  <td className="py-2 px-2 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${
                          player.teamSide === "home"
                            ? "bg-emerald-500"
                            : "bg-blue-500"
                        }`}
                      >
                        {player.jerseyNumber}
                      </span>
                      <span
                        className="font-medium text-gray-800 truncate max-w-[100px]"
                        title={player.playerName}
                      >
                        {player.playerName}
                      </span>
                    </div>
                  </td>
                  {COLUMNS.map((col) => {
                    const val = player[col.key];
                    const isZero = val === 0;
                    return (
                      <td
                        key={col.key}
                        className={`py-2 px-1 text-center tabular-nums ${
                          isZero ? "text-gray-300" : "text-gray-800 font-medium"
                        }`}
                        data-testid={`ps-${player.playerId}-${col.abbr.replace(
                          /[^a-zA-Z0-9]/g,
                          "",
                        )}`}
                      >
                        {isZero ? "–" : val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 uppercase tracking-wide">
        <span>PG = {t("analytics.goodPasses", "Good Passes")}</span>
        <span>PB = {t("analytics.badPasses", "Bad Passes")}</span>
        <span>PR = {t("analytics.passesReceived", "Passes Recv")}</span>
        <span>SH = {t("analytics.shots", "Shots")}</span>
        <span>SOT = {t("analytics.shotsOnTarget", "On Target")}</span>
        <span>G = {t("analytics.goals", "Goals")}</span>
        <span>PEN = {t("analytics.penalties", "Penalties")}</span>
        <span>PGO = {t("analytics.penaltyGoals", "Penalty Goals")}</span>
        <span>DW = {t("analytics.duelsWon", "Duels Won")}</span>
        <span>DL = {t("analytics.duelsLost", "Duels Lost")}</span>
        <span>FC = {t("analytics.foulsCommitted", "Fouls Done")}</span>
        <span>FR = {t("analytics.foulsReceived", "Fouls Recv")}</span>
        <span>INT = {t("analytics.interceptions", "Interceptions")}</span>
        <span>REC = {t("analytics.recoveries", "Recoveries")}</span>
        <span>CLR = {t("analytics.clearances", "Clearances")}</span>
        <span>BLK = {t("analytics.blocks", "Blocks")}</span>
        <span>YC = {t("analytics.yellowCards", "Yellow Cards")}</span>
        <span>RC = {t("analytics.redCards", "Red Cards")}</span>
      </div>
    </div>
  );
}
