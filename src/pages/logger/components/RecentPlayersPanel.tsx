import React from "react";
import { TFunction } from "i18next";
import { Clock } from "lucide-react";
import { Player } from "../types";

interface RecentPlayer {
  player: Player;
  team: "home" | "away";
  lastActionTime: string;
  actionCount: number;
}

interface RecentPlayersPanelProps {
  recentPlayers: RecentPlayer[];
  onPlayerClick: (player: Player, team: "home" | "away") => void;
  maxDisplay?: number;
  t: TFunction<"logger">;
}

const RecentPlayersPanel: React.FC<RecentPlayersPanelProps> = ({
  recentPlayers,
  onPlayerClick,
  maxDisplay = 5,
  t,
}) => {
  const displayPlayers = recentPlayers.slice(0, maxDisplay);

  if (displayPlayers.length === 0) {
    return null;
  }

  return (
    <div
      className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-3 mb-4"
      data-testid="recent-players-panel"
    >
      <div className="flex items-center gap-2 mb-2">
        <Clock size={14} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          {t("recentPlayers", "Recent Players")}
        </span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {displayPlayers.map((rp, index) => (
          <button
            key={`${rp.player.id}-${index}`}
            onClick={() => onPlayerClick(rp.player, rp.team)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg
              border-2 transition-all duration-150
              hover:scale-105 hover:shadow-md
              ${
                rp.team === "home"
                  ? "bg-red-50 border-red-200 hover:border-red-400"
                  : "bg-blue-50 border-blue-200 hover:border-blue-400"
              }
            `}
          >
            <div
              className={`
              w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm
              ${rp.team === "home" ? "bg-red-500" : "bg-blue-500"}
            `}
            >
              {rp.player.jersey_number}
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-800 whitespace-nowrap">
                {rp.player.full_name.split(" ").pop()}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <span>{rp.actionCount}x</span>
                <span className="text-gray-300">•</span>
                <span>{rp.lastActionTime}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentPlayersPanel;

// Hook to manage recent players state
export const useRecentPlayers = (maxHistory = 10) => {
  const [recentPlayers, setRecentPlayers] = React.useState<RecentPlayer[]>([]);

  const addRecentPlayer = React.useCallback(
    (player: Player, team: "home" | "away", matchClock: string) => {
      setRecentPlayers((prev) => {
        // Check if player already exists
        const existingIndex = prev.findIndex(
          (rp) => rp.player.id === player.id,
        );

        if (existingIndex >= 0) {
          // Update existing player
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            lastActionTime: matchClock,
            actionCount: updated[existingIndex].actionCount + 1,
          };
          // Move to front
          const [item] = updated.splice(existingIndex, 1);
          return [item, ...updated].slice(0, maxHistory);
        }

        // Add new player
        const newEntry: RecentPlayer = {
          player,
          team,
          lastActionTime: matchClock,
          actionCount: 1,
        };
        return [newEntry, ...prev].slice(0, maxHistory);
      });
    },
    [maxHistory],
  );

  const clearRecentPlayers = React.useCallback(() => {
    setRecentPlayers([]);
  }, []);

  return {
    recentPlayers,
    addRecentPlayer,
    clearRecentPlayers,
  };
};
