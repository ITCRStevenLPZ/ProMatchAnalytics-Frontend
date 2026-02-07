import { useState } from "react";
import { TFunction } from "i18next";
import { Users, LayoutGrid, Map } from "lucide-react";
import SoccerField from "../../../components/SoccerField";
import { FieldCoordinate, Match, Player } from "../types";

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
  priorityPlayerId?: string | null;
  isReadOnly?: boolean;
  showDestinationControls?: boolean;
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
  priorityPlayerId = null,
  isReadOnly = false,
  showDestinationControls = false,
  t,
}: PlayerSelectorPanelProps) => {
  const [viewMode, setViewMode] = useState<"list" | "field">(
    forceFieldMode ? "field" : "list",
  );
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
    <div className="grid grid-cols-3 gap-2">
      {players.map((player) => (
        <button
          key={player.id}
          data-testid={`player-card-${player.id}`}
          onClick={() => !disabled && onPlayerClick(player)}
          disabled={disabled}
          className={`p-2 rounded-lg border text-left transition-all ${
            disabled
              ? "bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed"
              : selectedPlayer?.id === player.id
                ? "bg-blue-900/40 border-blue-500 ring-1 ring-blue-500"
                : tone === "home"
                  ? "bg-red-900/20 border-red-900/50 hover:border-red-500/50 hover:bg-red-900/30"
                  : "bg-blue-900/20 border-blue-900/50 hover:border-blue-500/50 hover:bg-blue-900/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-bold ${
                disabled ? "text-slate-600" : "text-slate-200"
              }`}
            >
              #{player.jersey_number}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {player.position}
            </span>
          </div>
          <div
            className={`text-sm truncate ${
              disabled ? "text-slate-600" : "text-slate-300"
            }`}
          >
            {player.full_name}
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="bg-slate-800 rounded-lg shadow p-6 border border-slate-700 relative overflow-visible"
      data-testid="player-grid"
    >
      {isReadOnly && (
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
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Users size={20} />
          {t("selectPlayer", "Select Player")}
        </h2>
        {!forceFieldMode && (
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

      {viewMode === "field" ? (
        <div
          className={`mb-6 ${
            isReadOnly ? "pointer-events-none opacity-50" : ""
          }`}
        >
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
              if (isReadOnly) return;
              if (onFieldPlayerClick) {
                onFieldPlayerClick(player, anchor, location, side);
                return;
              }
              onPlayerClick(player);
            }}
            onDestinationClick={
              isReadOnly ? undefined : onFieldDestinationClick
            }
            overlay={fieldOverlay}
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
                  {renderPlayerGrid(onFieldPlayers, tone, isReadOnly)}
                </div>

                {benchPlayers.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      {t("substitutes", "Substitutes")}
                    </div>
                    {renderPlayerGrid(benchPlayers, tone, true)}
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
