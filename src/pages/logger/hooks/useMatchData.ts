import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import {
  fetchAllMatchEvents,
  fetchLoggerWithAuth,
  IS_E2E_TEST_MODE,
  LOGGER_API_URL,
} from "../../../lib/loggerApi";
import { normalizeMatchPayload } from "../utils";
import type { Match } from "../types";

interface UseMatchDataParams {
  matchId?: string;
  isLoggerReady: boolean;
  t: (...args: any[]) => unknown;
  setLiveEvents: (events: MatchEvent[]) => void;
}

export interface UseMatchDataResult {
  match: Match | null;
  setMatch: Dispatch<SetStateAction<Match | null>>;
  loading: boolean;
  error: string | null;
  fetchMatch: () => Promise<void>;
  hydrateEvents: () => Promise<void>;
}

export const useMatchData = ({
  matchId,
  isLoggerReady,
  t,
  setLiveEvents,
}: UseMatchDataParams): UseMatchDataResult => {
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatch = useCallback(async () => {
    if (!matchId || !isLoggerReady) return;
    try {
      const response = await fetchLoggerWithAuth(
        `${LOGGER_API_URL}/matches/${matchId}`,
      );
      if (!response.ok) {
        const errorPayload = await response.text().catch(() => "");
        console.error("Failed to fetch match payload", {
          status: response.status,
          statusText: response.statusText,
          body: errorPayload,
        });
        throw new Error("Failed to fetch match");
      }
      const data = await response.json();
      setMatch(normalizeMatchPayload(data));
    } catch (err: any) {
      setError(err.message || String(t("errorLoadingMatch")));
    } finally {
      setLoading(false);
    }
  }, [isLoggerReady, matchId, t]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  const hydrateEvents = useCallback(async () => {
    if (!matchId) return;
    try {
      const events = await fetchAllMatchEvents(matchId);
      if (IS_E2E_TEST_MODE) {
        console.log("[hydrateEvents]", matchId, "items", events.length);
      }
      setLiveEvents(events);
    } catch (err) {
      console.error("Failed to hydrate match events", err);
    }
  }, [matchId, setLiveEvents]);

  return {
    match,
    setMatch,
    loading,
    error,
    fetchMatch,
    hydrateEvents,
  };
};
