import React, { useState, useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Users,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
} from "lucide-react";
import {
  MatchEvent,
  DuplicateHighlight,
} from "../../../store/useMatchLogStore";
import { Match } from "../types";

interface LiveEventFeedProps {
  events: MatchEvent[];
  match: Match | null;
  duplicateHighlight?: DuplicateHighlight | null;
  onDeletePending?: (clientId: string) => void;
  t: any;
}

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  Pass: <ArrowRight size={14} className="text-blue-500" />,
  Shot: <AlertCircle size={14} className="text-red-500" />,
  FoulCommitted: <XCircle size={14} className="text-yellow-600" />,
  Card: <AlertCircle size={14} className="text-red-600" />,
  GoalkeeperAction: <User size={14} className="text-purple-500" />,
  SetPiece: <Users size={14} className="text-green-600" />,
};

const getOutcomeColor = (outcome?: string): string => {
  if (!outcome) return "text-gray-500";
  const lower = outcome.toLowerCase();
  if (
    lower.includes("complete") ||
    lower.includes("success") ||
    lower.includes("won")
  ) {
    return "text-green-400";
  }
  if (
    lower.includes("incomplete") ||
    lower.includes("failed") ||
    lower.includes("lost")
  ) {
    return "text-red-400";
  }
  if (lower.includes("goal")) {
    return "text-green-400 font-bold";
  }
  return "text-slate-400";
};

const getPlayerName = (
  playerId: string | undefined,
  match: Match | null,
): string => {
  if (!playerId || !match) return "Team Event";

  const allPlayers = [...match.home_team.players, ...match.away_team.players];

  const player = allPlayers.find((p) => p.id === playerId);
  return player ? `#${player.jersey_number} ${player.full_name}` : playerId;
};

const getTeamName = (teamId: string, match: Match | null): string => {
  if (!match) return "";
  if (teamId === match.home_team.id) return match.home_team.short_name;
  if (teamId === match.away_team.id) return match.away_team.short_name;
  return teamId;
};

const formatEventDetails = (event: MatchEvent): string => {
  const details: string[] = [];

  if (event.data) {
    if (event.data.outcome) details.push(event.data.outcome);
    if (event.data.receiver_name) details.push(`→ ${event.data.receiver_name}`);
    if (event.data.pass_type) details.push(event.data.pass_type);
    if (event.data.shot_type) details.push(event.data.shot_type);
    if (event.data.card_type) details.push(event.data.card_type);
    if (event.data.set_piece_type) details.push(event.data.set_piece_type);
  }

  return details.join(" • ");
};

export const LiveEventFeed: React.FC<LiveEventFeedProps> = ({
  events,
  match,
  duplicateHighlight,
  onDeletePending,
  t,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const pendingCount = useMemo(
    () => events.filter((event) => event.client_id && !event._id).length,
    [events],
  );

  const reversedEvents = useMemo(() => {
    return [...events].reverse();
  }, [events]);

  const totalPages = Math.ceil(reversedEvents.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentEvents = reversedEvents.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page
  };

  return (
    <div className="bg-slate-800 rounded-lg shadow-sm border border-slate-700 h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            {t("liveEvents", "Live Events")}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-400 bg-slate-700 px-3 py-1 rounded-full border border-slate-600">
              {events.length} {t("eventsLabel", "events")}
            </span>
            {pendingCount > 0 && (
              <span
                className="text-xs font-semibold text-amber-300 bg-amber-900/30 px-2 py-1 rounded-full border border-amber-700/50"
                title={t("pendingEvents", "Events awaiting confirmation")}
              >
                {t("pending", "Pending")}: {pendingCount}
              </span>
            )}
          </div>
        </div>

        {/* Page Size Selector */}
        {events.length > 10 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-slate-400">{t("show", "Show")}:</span>
            {[10, 20, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`text-xs px-2 py-1 rounded ${
                  pageSize === size
                    ? "bg-blue-900/40 text-blue-300 font-medium border border-blue-800"
                    : "text-slate-500 hover:bg-slate-700"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Events List */}
      <div className="space-y-1 flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {events.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-12">
            <Users size={48} className="mx-auto mb-3 text-slate-700" />
            <p>{t("noEvents", "No events yet")}</p>
            <p className="text-xs mt-1">
              {t("startLogging", "Start logging to see events appear here")}
            </p>
          </div>
        ) : (
          currentEvents.map((event, index) => {
            const isHighlighted =
              !!duplicateHighlight &&
              duplicateHighlight.match_clock === event.match_clock &&
              duplicateHighlight.period === event.period &&
              duplicateHighlight.team_id === event.team_id;

            const outcomeColor = getOutcomeColor(event.data?.outcome);
            const eventDetails = formatEventDetails(event);
            const playerName = getPlayerName(event.player_id, match);
            const teamName = getTeamName(event.team_id, match);

            return (
              <div
                key={event._id || `${startIndex + index}`}
                data-testid="live-event-item"
                className={`border rounded-lg p-3 transition-all hover:shadow-sm ${
                  isHighlighted
                    ? "border-amber-500/50 bg-amber-900/20 shadow-md ring-1 ring-amber-500/50"
                    : "border-slate-700 hover:border-slate-600 bg-slate-900/50"
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {EVENT_TYPE_ICONS[event.type] || (
                      <AlertCircle size={14} className="text-slate-500" />
                    )}
                    <span className="font-semibold text-sm text-slate-200 truncate">
                      {event.type}
                    </span>
                    {teamName && (
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-medium border border-slate-700">
                        {teamName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-500 font-mono">
                      P{event.period}
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-300">
                      {event.match_clock}
                    </span>
                  </div>
                </div>

                {/* Player Info */}
                {event.player_id && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <User size={12} className="text-slate-500" />
                    <span className="text-xs text-slate-300 font-medium">
                      {playerName}
                    </span>
                  </div>
                )}

                {/* Event Details */}
                {eventDetails && (
                  <div className="flex items-center gap-1 mt-2">
                    {event.data?.outcome === "Complete" && (
                      <CheckCircle size={12} className="text-green-500" />
                    )}
                    {event.data?.outcome === "Incomplete" && (
                      <XCircle size={12} className="text-red-500" />
                    )}
                    {event.data?.outcome === "Goal" && (
                      <CheckCircle size={12} className="text-green-500" />
                    )}
                    <span className={`text-xs ${outcomeColor}`}>
                      {eventDetails}
                    </span>
                  </div>
                )}

                {/* Status Indicators */}
                <div className="flex items-center gap-2 mt-2">
                  {event._confirmed && (
                    <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1 border border-green-900/50">
                      <CheckCircle size={10} />
                      {t("confirmed", "Confirmed")}
                    </span>
                  )}
                  {event.client_id && !event._id && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-yellow-900/30 text-yellow-500 px-2 py-0.5 rounded-full border border-yellow-900/50">
                        {t("pending", "Pending")}
                      </span>
                      {onDeletePending && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePending(event.client_id!);
                          }}
                          className="text-slate-500 hover:text-red-400 p-0.5 rounded hover:bg-slate-800 transition-colors"
                          title={t("deletePending", "Delete pending event")}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                  {isHighlighted && (
                    <span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-0.5 rounded-full font-medium border border-amber-700/50">
                      {t("duplicate", "Duplicate")}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="border-t border-slate-700 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {t("showing", "Showing")} {startIndex + 1}-
              {Math.min(endIndex, reversedEvents.length)} {t("of", "of")}{" "}
              {reversedEvents.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
                title={t("firstPage", "First page")}
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
                title={t("previousPage", "Previous page")}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-slate-300 px-3">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
                title={t("nextPage", "Next page")}
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-slate-200"
                title={t("lastPage", "Last page")}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveEventFeed;
