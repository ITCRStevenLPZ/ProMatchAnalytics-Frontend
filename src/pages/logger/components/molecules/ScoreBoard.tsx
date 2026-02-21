import { MatchEvent } from "../../../../store/useMatchLogStore";

interface ScoreBoardProps {
  t: any;
  match: any;
  liveScore: { home: number; away: number };
  goalEvents: { home: MatchEvent[]; away: MatchEvent[] };
  formatGoalLabel: (event: MatchEvent) => string;
  queuedCount: number;
  pendingAckCount: number;
  transitionError: string | null;
  toastMessage?: string;
}

export default function ScoreBoard({
  t,
  match,
  liveScore,
  goalEvents,
  formatGoalLabel,
  queuedCount,
  pendingAckCount,
  transitionError,
  toastMessage,
}: ScoreBoardProps) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="flex flex-col flex-1">
        <div className="text-2xl sm:text-3xl font-bold text-slate-100 text-center">
          {t("matchTitle", "{{home}} vs {{away}}", {
            home: match.home_team.name,
            away: match.away_team.name,
          })}
        </div>
        <div className="mt-3 w-full flex justify-center">
          <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 shadow-lg bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 sm:px-7 py-4 grid grid-cols-[minmax(120px,0.9fr)_minmax(190px,1.5fr)_minmax(120px,0.9fr)] sm:grid-cols-[minmax(150px,0.85fr)_minmax(260px,1.6fr)_minmax(150px,0.85fr)] items-center gap-3 sm:gap-5 min-w-[260px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.04),transparent_30%)]" />
            <div className="flex flex-col items-center z-10 min-w-0">
              <span className="text-sm sm:text-base uppercase tracking-wide text-slate-300 truncate max-w-full text-center">
                {match.home_team.name}
              </span>
              <span
                className="text-5xl sm:text-6xl font-black text-emerald-300 drop-shadow"
                data-testid="home-score"
              >
                {liveScore.home || match.home_team.score || 0}
              </span>
            </div>
            <div className="z-10 flex flex-col items-center px-2 sm:px-4">
              <span className="text-sm font-semibold text-slate-400">
                {t("statusLabel", "Status")}
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-200">
                {t("vs", "VS")}
              </span>
            </div>
            <div className="flex flex-col items-center z-10 min-w-0">
              <span className="text-sm sm:text-base uppercase tracking-wide text-slate-300 text-center truncate max-w-full">
                {match.away_team.name}
              </span>
              <span
                className="text-5xl sm:text-6xl font-black text-amber-300 drop-shadow"
                data-testid="away-score"
              >
                {liveScore.away || match.away_team.score || 0}
              </span>
            </div>
          </div>
        </div>
        {(goalEvents.home.length > 0 || goalEvents.away.length > 0) && (
          <div
            className="mt-3 w-full flex flex-col items-center gap-2"
            data-testid="goal-log-board"
          >
            <span className="text-xs uppercase tracking-widest text-slate-400">
              {t("goalIndicator", "Goal")}
            </span>
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex flex-col items-center gap-1">
                {goalEvents.home.map((event) => (
                  <span
                    key={event.client_id || event._id || event.match_clock}
                    data-testid="goal-log-home"
                    className="text-xs text-emerald-200 bg-emerald-900/30 border border-emerald-700/40 px-2 py-1 rounded-full"
                  >
                    {formatGoalLabel(event)}
                  </span>
                ))}
              </div>
              <div className="flex flex-col items-center gap-1">
                {goalEvents.away.map((event) => (
                  <span
                    key={event.client_id || event._id || event.match_clock}
                    data-testid="goal-log-away"
                    className="text-xs text-amber-200 bg-amber-900/30 border border-amber-700/40 px-2 py-1 rounded-full"
                  >
                    {formatGoalLabel(event)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {queuedCount > 0 && (
          <span
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200"
            title="Events queued for send"
          >
            🔄 {t("queuedLabel", "Queued: {{count}}", { count: queuedCount })}
          </span>
        )}
        {pendingAckCount > 0 && (
          <span
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold border border-blue-200"
            title="Awaiting server acknowledgements"
          >
            ⏳{" "}
            {t("pendingAckLabel", "Pending acks: {{count}}", {
              count: pendingAckCount,
            })}
          </span>
        )}
        {(transitionError || toastMessage) && (
          <span
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200"
            title="Last error"
          >
            ⚠️ {transitionError || toastMessage}
          </span>
        )}
      </div>
    </div>
  );
}
