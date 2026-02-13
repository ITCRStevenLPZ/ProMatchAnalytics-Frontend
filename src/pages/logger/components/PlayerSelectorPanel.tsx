import { useEffect, useState } from "react";
import { TFunction } from "i18next";
import { Users, LayoutGrid, Map } from "lucide-react";
import SoccerField from "../../../components/SoccerField";
import { FieldCoordinate, Match, Player } from "../types";

type PositionGroup = "goalkeeper" | "defense" | "midfield" | "attack" | "other";

const POSITION_GROUP_ORDER: PositionGroup[] = [
  "goalkeeper",
  "defense",
  "midfield",
  "attack",
  "other",
];

const normalizePosition = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();

const getPositionGroup = (raw?: string | null): PositionGroup => {
  const normalized = normalizePosition(raw || "");
  if (!normalized) return "other";
  if (
    normalized.includes("gk") ||
    normalized.includes("goalkeeper") ||
    normalized.includes("portero") ||
    normalized.includes("keeper")
  ) {
    return "goalkeeper";
  }
  if (
    normalized.includes("def") ||
    normalized.includes("back") ||
    normalized.includes("lateral") ||
    normalized.includes("carrilero") ||
    normalized.includes("libero") ||
    normalized.includes("cb") ||
    normalized.includes("lb") ||
    normalized.includes("rb")
  ) {
    return "defense";
  }
  if (
    normalized.includes("mid") ||
    normalized.includes("centro") ||
    normalized.includes("medio") ||
    normalized.includes("volante") ||
    normalized.includes("cm") ||
    normalized.includes("dm") ||
    normalized.includes("am")
  ) {
    return "midfield";
  }
  if (
    normalized.includes("fwd") ||
    normalized.includes("forward") ||
    normalized.includes("att") ||
    normalized.includes("striker") ||
    normalized.includes("delantero") ||
    normalized.includes("extremo") ||
    normalized.includes("wing") ||
    normalized.includes("st") ||
    normalized.includes("cf")
  ) {
    return "attack";
  }
  return "other";
};

const getGroupMeta = (group: PositionGroup) => {
  switch (group) {
    case "goalkeeper":
      return {
        label: "GK",
        dot: "bg-cyan-400",
        border: "border-cyan-500/60",
        badge: "bg-cyan-500/10 text-cyan-200 border-cyan-500/40",
      };
    case "defense":
      return {
        label: "DEF",
        dot: "bg-emerald-400",
        border: "border-emerald-500/60",
        badge: "bg-emerald-500/10 text-emerald-200 border-emerald-500/40",
      };
    case "midfield":
      return {
        label: "MID",
        dot: "bg-amber-400",
        border: "border-amber-500/60",
        badge: "bg-amber-500/10 text-amber-200 border-amber-500/40",
      };
    case "attack":
      return {
        label: "ATT",
        dot: "bg-rose-400",
        border: "border-rose-500/60",
        badge: "bg-rose-500/10 text-rose-200 border-rose-500/40",
      };
    default:
      return {
        label: "OTH",
        dot: "bg-slate-400",
        border: "border-slate-500/50",
        badge: "bg-slate-500/10 text-slate-200 border-slate-500/40",
      };
  }
};

const sortPlayersByGroup = (players: Player[]) =>
  [...players].sort((a, b) => {
    const groupA = getPositionGroup(a.position);
    const groupB = getPositionGroup(b.position);
    const groupDelta =
      POSITION_GROUP_ORDER.indexOf(groupA) -
      POSITION_GROUP_ORDER.indexOf(groupB);
    if (groupDelta !== 0) return groupDelta;
    return a.jersey_number - b.jersey_number;
  });

interface PlayerSelectorPanelProps {
  match: Match;
  flipSides?: boolean;
  selectedPlayer: Player | null;
  selectedTeam: "home" | "away" | "both";
  onFieldIds: { home: Set<string>; away: Set<string> };
  onPlayerClick: (player: Player) => void;
  onFieldPlayerClick?: (
    player: Player,
    anchor: { xPercent: number; yPercent: number },
    location: [number, number],
    side: "home" | "away",
  ) => void;
  onFieldDestinationClick?: (coordinate: FieldCoordinate) => void;
  fieldOverlay?: React.ReactNode;
  forceFieldMode?: boolean;
  forceListMode?: boolean;
  priorityPlayerId?: string | null;
  isReadOnly?: boolean;
  showDestinationControls?: boolean;
  cardSelectionActive?: boolean;
  t: TFunction<"logger">;
}

const PlayerSelectorPanel = ({
  match,
  flipSides = false,
  selectedPlayer,
  selectedTeam,
  onFieldIds,
  onPlayerClick,
  onFieldPlayerClick,
  onFieldDestinationClick,
  fieldOverlay,
  forceFieldMode = false,
  forceListMode = false,
  priorityPlayerId = null,
  isReadOnly = false,
  showDestinationControls = false,
  cardSelectionActive = false,
  t,
}: PlayerSelectorPanelProps) => {
  const [viewMode, setViewMode] = useState<"list" | "field">(
    forceFieldMode ? "field" : "list",
  );
  const resolvedViewMode = forceListMode
    ? "list"
    : forceFieldMode
      ? "field"
      : viewMode;

  useEffect(() => {
    if (forceListMode) {
      setViewMode("list");
      return;
    }
    if (!forceFieldMode) return;
    setViewMode("field");
  }, [forceFieldMode, forceListMode]);
  const prioritizePlayers = (players: Player[]) => {
    if (!priorityPlayerId) return players;
    const index = players.findIndex((p) => p.id === priorityPlayerId);
    if (index <= 0) return players;
    const prioritized = [
      players[index],
      ...players.slice(0, index),
      ...players.slice(index + 1),
    ];
    return prioritized;
  };

  // Filter teams based on selected team
  const teamsToShow =
    selectedTeam === "home"
      ? [
          {
            labelColor: "bg-red-600" as const,
            team: match.home_team,
            tone: "home" as const,
          },
        ]
      : selectedTeam === "away"
        ? [
            {
              labelColor: "bg-blue-600" as const,
              team: match.away_team,
              tone: "away" as const,
            },
          ]
        : [
            {
              labelColor: "bg-red-600" as const,
              team: match.home_team,
              tone: "home" as const,
            },
            {
              labelColor: "bg-blue-600" as const,
              team: match.away_team,
              tone: "away" as const,
            },
          ];

  const renderPlayerGrid = (
    players: Player[],
    tone: "home" | "away",
    disabled = false,
  ) => (
    <div className="grid grid-cols-1 gap-2">
      {sortPlayersByGroup(players).map((player) => {
        const group = getPositionGroup(player.position);
        const meta = getGroupMeta(group);
        const isSelected = selectedPlayer?.id === player.id;
        return (
          <button
            key={player.id}
            data-testid={`player-card-${player.id}`}
            data-player-row="true"
            data-position-group={group}
            onClick={() => !disabled && onPlayerClick(player)}
            disabled={disabled}
            className={`w-full max-w-[420px] mx-auto px-3 py-2 rounded-lg border-l-4 text-left transition-all ${
              disabled
                ? "bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed"
                : isSelected
                  ? "bg-blue-900/40 border-blue-500 ring-1 ring-blue-500"
                  : tone === "home"
                    ? "bg-red-900/20 border-red-900/50 hover:border-red-500/50 hover:bg-red-900/30"
                    : "bg-blue-900/20 border-blue-900/50 hover:border-blue-500/50 hover:bg-blue-900/30"
            } ${meta.border}`}
          >
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <span
                className={`text-xs font-bold min-w-[2.5rem] ${
                  disabled ? "text-slate-600" : "text-slate-200"
                }`}
              >
                #{player.jersey_number}
              </span>
              <span
                className={`flex-1 text-sm truncate ${
                  disabled ? "text-slate-600" : "text-slate-100"
                }`}
              >
                {player.full_name}
              </span>
              <span
                data-testid={`player-position-${player.id}`}
                className={`text-[10px] uppercase tracking-wider border px-2 py-0.5 rounded-full ${meta.badge}`}
              >
                {player.position || meta.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );

  const selectionLocked = isReadOnly && !cardSelectionActive;
  const resolvedFieldOverlay = fieldOverlay;

  return (
    <div
      className="bg-slate-800 rounded-lg shadow p-6 border border-slate-700 relative overflow-visible"
      data-testid="player-grid"
    >
      {selectionLocked && (
        <div className="absolute inset-0 z-10 bg-slate-900/70 backdrop-blur-sm border border-amber-500/40">
          <div className="p-4 flex items-start gap-3 text-amber-200">
            <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <div>
              <p className="font-semibold text-amber-100">
                {t("playerSelectLocked", "Player selection is paused")}
              </p>
              <p className="text-sm text-amber-200/80">
                {t(
                  "playerSelectLockedHint",
                  "Start the clock to enable selecting players.",
                )}
              </p>
            </div>
          </div>
          {resolvedFieldOverlay && (
            <div className="absolute inset-0">
              <div className="relative h-full w-full">
                {resolvedFieldOverlay}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Users size={20} />
          {t("selectPlayer", "Select Player")}
        </h2>
        {!forceFieldMode && !forceListMode && (
          <div className="flex bg-slate-900 rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md ${
                viewMode === "list"
                  ? "bg-slate-700 shadow text-blue-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              title="List View"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode("field")}
              className={`p-1.5 rounded-md ${
                viewMode === "field"
                  ? "bg-slate-700 shadow text-blue-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
              title="Field View"
            >
              <Map size={18} />
            </button>
          </div>
        )}
      </div>

      {resolvedViewMode === "field" ? (
        <div className={`mb-6 ${selectionLocked ? "opacity-50" : ""}`}>
          <SoccerField
            homeTeamName={match.home_team.name}
            awayTeamName={match.away_team.name}
            homePlayers={match.home_team.players.filter((p) =>
              onFieldIds.home.has(p.id),
            )}
            awayPlayers={match.away_team.players.filter((p) =>
              onFieldIds.away.has(p.id),
            )}
            flipSides={flipSides}
            onPlayerClick={(player, anchor, location, side) => {
              if (selectionLocked) return;
              if (onFieldPlayerClick) {
                onFieldPlayerClick(player, anchor, location, side);
                return;
              }
              onPlayerClick(player);
            }}
            onDestinationClick={
              selectionLocked ? undefined : onFieldDestinationClick
            }
            overlay={resolvedFieldOverlay}
            showDestinationControls={showDestinationControls}
          />
        </div>
      ) : (
        <div
          className={`mb-6 ${
            selectedTeam === "both" ? "grid grid-cols-2 gap-4" : ""
          }`}
        >
          {teamsToShow.map(({ labelColor, team, tone }) => {
            const teamOnField =
              tone === "home" ? onFieldIds.home : onFieldIds.away;
            const onFieldPlayers = prioritizePlayers(
              team.players.filter((p) => teamOnField.has(p.id)),
            );
            const benchPlayers = prioritizePlayers(
              team.players.filter((p) => !teamOnField.has(p.id)),
            );
            const benchDisabled = selectionLocked || !cardSelectionActive;

            return (
              <div className="space-y-3" key={team.id}>
                <h3 className="font-medium text-slate-300 flex items-center gap-2 mb-3">
                  <span className={`w-2 h-2 rounded-full ${labelColor}`}></span>
                  {team.name}
                </h3>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    {t("onPitch", "On Pitch")}
                  </div>
                  {renderPlayerGrid(onFieldPlayers, tone, selectionLocked)}
                </div>

                {benchPlayers.length > 0 && (
                  <div
                    className="space-y-2 mt-4"
                    data-testid={`bench-section-${tone}`}
                  >
                    <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      {t("substitutes", "Substitutes")}
                    </div>
                    {renderPlayerGrid(benchPlayers, tone, benchDisabled)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlayerSelectorPanel;
