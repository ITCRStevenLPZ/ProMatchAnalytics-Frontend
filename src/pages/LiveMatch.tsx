import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { MatchTimer } from "../components/match/MatchTimer";
import { EventControls } from "../components/match/EventControls";
import { EventTimeline } from "../components/match/EventTimeline";
import { useMatchSocket } from "../hooks/useMatchSocket";
import { useMatchLogStore } from "../store/useMatchLogStore";
import { fetchAllMatchEvents } from "../lib/loggerApi";

export default function LiveMatch() {
  const { t } = useTranslation("matches");
  const { matchId } = useParams<{ matchId: string }>();

  // Use a default ID for testing if none provided
  const activeMatchId = matchId || "MATCH_DEMO_123";

  const {
    setCurrentMatch,
    operatorClock,
    operatorPeriod,
    isConnected,
    setLiveEvents,
    lastTimelineRefreshRequest,
  } = useMatchLogStore();

  const { sendEvent } = useMatchSocket({
    matchId: activeMatchId,
    enabled: true,
  });

  const hydrateEvents = useCallback(async () => {
    if (!activeMatchId) return;
    try {
      const events = await fetchAllMatchEvents(activeMatchId);
      setLiveEvents(events);
    } catch (err) {
      console.error("Failed to hydrate viewer events", err);
    }
  }, [activeMatchId, setLiveEvents]);

  // Initialize session
  useEffect(() => {
    setCurrentMatch(activeMatchId);
    void hydrateEvents();
  }, [activeMatchId, setCurrentMatch, hydrateEvents]);

  useEffect(() => {
    if (!lastTimelineRefreshRequest) return;
    void hydrateEvents();
  }, [lastTimelineRefreshRequest, hydrateEvents]);

  const handleEvent = (type: string, data: any = {}) => {
    // Capture current state from store (which is updated by MatchTimer)
    sendEvent({
      match_clock: operatorClock,
      period: operatorPeriod,
      team_id: "TEAM_A", // Hardcoded for demo/simplicity
      type: type,
      data: data,
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("liveMatch")}</h1>
          <p className="text-gray-500">Match ID: {activeMatchId}</p>
        </div>
        <div
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            isConnected
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {isConnected ? "Connected" : "Offline / Connecting..."}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Controls */}
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              Game Clock
            </h2>
            <MatchTimer />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              Actions
            </h2>
            <EventControls onEvent={handleEvent} />
          </section>
        </div>

        {/* Right Column: Timeline */}
        <div className="lg:col-span-1">
          <EventTimeline />
        </div>
      </div>
    </div>
  );
}
