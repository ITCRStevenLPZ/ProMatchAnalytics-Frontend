import React from "react";
import { useMatchLogStore, MatchEvent } from "../../store/useMatchLogStore";
import { Clock, CheckCircle2, AlertCircle } from "lucide-react";

export const EventTimeline: React.FC = () => {
  const { liveEvents, pendingAcks } = useMatchLogStore();

  // Sort events by timestamp descending (newest first)
  const sortedEvents = [...liveEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const getStatusIcon = (event: MatchEvent) => {
    // Check if this event is pending ack (optimistic)
    const isPending = event.client_id && pendingAcks[event.client_id];

    if (isPending) {
      return <Clock size={14} className="text-gray-400" />;
    }
    if (event._id) {
      // If it has a server ID, it's confirmed
      return <CheckCircle2 size={14} className="text-green-500" />;
    }
    return <AlertCircle size={14} className="text-orange-400" />; // Fallback/Queue state
  };

  if (sortedEvents.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        No events logged yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Match Log</h3>
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
        {sortedEvents.map((event, index) => (
          <div
            key={event.client_id || event._id || index}
            className="bg-white p-3 rounded border border-gray-100 shadow-sm flex items-center justify-between"
            data-testid="viewer-event-item"
          >
            <div className="flex items-center gap-3">
              <div className="font-mono text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {event.match_clock}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {event.type}
                </div>
                <div className="text-xs text-gray-500">
                  {event.team_id}
                  {event.player_id ? ` · ${event.player_id}` : ""}
                </div>
              </div>
            </div>
            <div
              className="flex items-center gap-2"
              title={event._id ? "Synced" : "Pending"}
            >
              {getStatusIcon(event)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
