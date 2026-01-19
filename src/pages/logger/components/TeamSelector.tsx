import { Match } from "../types";

interface TeamSelectorProps {
  match: Match;
  selectedTeam: "home" | "away" | "both";
  onTeamChange: (team: "home" | "away" | "both") => void;
  disabled?: boolean;
}

const TeamSelector = ({
  match,
  selectedTeam,
  onTeamChange,
  disabled = false,
}: TeamSelectorProps) => (
  <div className="bg-slate-800 rounded-lg shadow p-4 border border-slate-700">
    <div className="flex gap-2">
      <button
        onClick={() => onTeamChange("home")}
        disabled={disabled}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedTeam === "home"
            ? "bg-red-900/40 text-red-100 border border-red-500/50"
            : "bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
        }`}
      >
        {match.home_team.short_name}
      </button>
      <button
        onClick={() => onTeamChange("away")}
        disabled={disabled}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedTeam === "away"
            ? "bg-blue-900/40 text-blue-100 border border-blue-500/50"
            : "bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
        }`}
      >
        {match.away_team.short_name}
      </button>
      <button
        onClick={() => onTeamChange("both")}
        disabled={disabled}
        className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selectedTeam === "both"
            ? "bg-indigo-900/40 text-indigo-100 border border-indigo-500/50"
            : "bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
        }`}
      >
        Both
      </button>
    </div>
  </div>
);

export default TeamSelector;
