import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { MatchEvent, DuplicateHighlight } from '../../../store/useMatchLogStore';
import { Match } from '../types';

interface LiveEventFeedProps {
  events: MatchEvent[];
  match: Match | null;
  duplicateHighlight?: DuplicateHighlight | null;
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
  if (!outcome) return 'text-gray-500';
  const lower = outcome.toLowerCase();
  if (lower.includes('complete') || lower.includes('success') || lower.includes('won')) {
    return 'text-green-600';
  }
  if (lower.includes('incomplete') || lower.includes('failed') || lower.includes('lost')) {
    return 'text-red-600';
  }
  if (lower.includes('goal')) {
    return 'text-green-700 font-bold';
  }
  return 'text-gray-600';
};

const getPlayerName = (playerId: string | undefined, match: Match | null): string => {
  if (!playerId || !match) return 'Team Event';
  
  const allPlayers = [
    ...match.home_team.players,
    ...match.away_team.players,
  ];
  
  const player = allPlayers.find(p => p.id === playerId);
  return player ? `#${player.jersey_number} ${player.full_name}` : playerId;
};

const getTeamName = (teamId: string, match: Match | null): string => {
  if (!match) return '';
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
  
  return details.join(' • ');
};

export const LiveEventFeed: React.FC<LiveEventFeedProps> = ({
  events,
  match,
  duplicateHighlight,
  t,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const pendingCount = useMemo(
    () => events.filter((event) => event.client_id && !event._id).length,
    [events]
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('liveEvents', 'Live Events')}</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              {events.length} {t('eventsLabel', 'events')}
            </span>
            {pendingCount > 0 && (
              <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full border border-amber-200" title={t('pendingEvents', 'Events awaiting confirmation')}>
                {t('pending', 'Pending')}: {pendingCount}
              </span>
            )}
          </div>
        </div>
        
        {/* Page Size Selector */}
        {events.length > 10 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-600">{t('show', 'Show')}:</span>
            {[10, 20, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`text-xs px-2 py-1 rounded ${
                  pageSize === size
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Events List */}
      <div className="space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto p-2">
        {events.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-12">
            <Users size={48} className="mx-auto mb-3 text-gray-300" />
            <p>{t('noEvents', 'No events yet')}</p>
            <p className="text-xs mt-1">{t('startLogging', 'Start logging to see events appear here')}</p>
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
                    ? 'border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-300'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {EVENT_TYPE_ICONS[event.type] || <AlertCircle size={14} className="text-gray-400" />}
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {event.type}
                    </span>
                    {teamName && (
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                        {teamName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500 font-mono">
                      P{event.period}
                    </span>
                    <span className="text-sm font-mono font-semibold text-gray-900">
                      {event.match_clock}
                    </span>
                  </div>
                </div>

                {/* Player Info */}
                {event.player_id && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <User size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-700 font-medium">
                      {playerName}
                    </span>
                  </div>
                )}

                {/* Event Details */}
                {eventDetails && (
                  <div className="flex items-center gap-1 mt-2">
                    {event.data?.outcome === 'Complete' && <CheckCircle size={12} className="text-green-600" />}
                    {event.data?.outcome === 'Incomplete' && <XCircle size={12} className="text-red-600" />}
                    {event.data?.outcome === 'Goal' && <CheckCircle size={12} className="text-green-700" />}
                    <span className={`text-xs ${outcomeColor}`}>
                      {eventDetails}
                    </span>
                  </div>
                )}

                {/* Status Indicators */}
                <div className="flex items-center gap-2 mt-2">
                  {event._confirmed && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle size={10} />
                      {t('confirmed', 'Confirmed')}
                    </span>
                  )}
                  {event.client_id && !event._id && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                      {t('pending', 'Pending')}
                    </span>
                  )}
                  {isHighlighted && (
                    <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                      {t('duplicate', 'Duplicate')}
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
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {t('showing', 'Showing')} {startIndex + 1}-{Math.min(endIndex, reversedEvents.length)} {t('of', 'of')} {reversedEvents.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('firstPage', 'First page')}
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('previousPage', 'Previous page')}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-gray-700 px-3">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('nextPage', 'Next page')}
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('lastPage', 'Last page')}
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
