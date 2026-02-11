import type { MatchEvent } from "../store/useMatchLogStore";

const buildApiBase = (raw?: string) => {
  const sanitized = (raw || "http://localhost:8000").replace(/\/+$/, "");
  return sanitized.endsWith("/api/v1") ? sanitized : `${sanitized}/api/v1`;
};

export const IS_E2E_TEST_MODE = import.meta.env.VITE_E2E_TEST_MODE === "true";
const E2E_BYPASS_TOKEN =
  import.meta.env.VITE_E2E_BYPASS_TOKEN ?? "e2e-playwright";

const API_URL = buildApiBase(import.meta.env.VITE_API_URL);
export const LOGGER_API_URL = `${API_URL}/logger`;
export const EVENTS_API_URL = `${API_URL}/events`;

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const acc: Record<string, string> = {};
    headers.forEach((value, key) => {
      acc[key] = value;
    });
    return acc;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
};

import { auth } from "./firebase";

export const fetchLoggerWithAuth = async (url: string, init?: RequestInit) => {
  let token = "";

  if (IS_E2E_TEST_MODE) {
    token = E2E_BYPASS_TOKEN;
  } else {
    const user = auth.currentUser;
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (e) {
        console.error("[loggerApi] token error", e);
      }
    }
  }

  const mergedHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...normalizeHeaders(init?.headers),
  };

  return fetch(url, { ...init, headers: mergedHeaders });
};

export interface MatchEventsPage {
  items: MatchEvent[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
  next_page?: number | null;
}

export const fetchAllMatchEvents = async (
  matchId: string,
  pageSize = 500,
): Promise<MatchEvent[]> => {
  const aggregated: MatchEvent[] = [];
  let currentPage = 1;
  let safetyCounter = 0;
  const maxPages = 100;

  while (safetyCounter < maxPages) {
    safetyCounter += 1;
    const params = new URLSearchParams({
      page: String(currentPage),
      page_size: String(pageSize),
    });
    const response = await fetchLoggerWithAuth(
      `${LOGGER_API_URL}/matches/${matchId}/events?${params.toString()}`,
    );
    if (!response.ok) {
      const errorPayload = await response.text().catch(() => "");
      throw new Error(
        `Failed to fetch events (${response.status} ${response.statusText}): ${errorPayload}`,
      );
    }
    const payload = await response.json();

    if (Array.isArray(payload)) {
      aggregated.splice(0, aggregated.length, ...payload);
      break;
    }

    const pageData = payload as MatchEventsPage;
    aggregated.push(...pageData.items);

    if (!pageData.has_next || pageData.items.length === 0) {
      break;
    }

    currentPage = pageData.next_page ?? currentPage + 1;
  }

  return aggregated;
};

export const updateMatchStatus = async (
  matchId: string,
  status?: string,
  clockOperation?: "start" | "stop" | "reset",
  matchTime?: number,
) => {
  const body: any = { status, clock_operation: clockOperation };
  if (matchTime !== undefined) {
    body.match_time_seconds = matchTime;
  }
  const response = await fetchLoggerWithAuth(
    `${LOGGER_API_URL}/matches/${matchId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "");
    console.error(
      "Update status failed:",
      response.status,
      response.statusText,
      errorPayload,
    );
    throw new Error(`Failed to update match status: ${errorPayload}`);
  }

  return response.json();
};

export const updateMatch = async (
  matchId: string,
  updates: Record<string, any>,
) => {
  // Use the clock-mode endpoint for clock-related updates
  const response = await fetchLoggerWithAuth(
    `${LOGGER_API_URL}/matches/${matchId}/clock-mode`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
  );

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "");
    console.error(
      "Update match failed:",
      response.status,
      response.statusText,
      errorPayload,
    );
    throw new Error(`Failed to update match: ${errorPayload}`);
  }

  return response.json();
};

export const resetMatch = async (matchId: string) => {
  const response = await fetchLoggerWithAuth(
    `${LOGGER_API_URL}/matches/${matchId}/reset`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "");
    throw new Error(`Failed to reset match: ${errorPayload}`);
  }

  return response.json();
};

export const getMatch = async (matchId: string) => {
  const response = await fetchLoggerWithAuth(
    `${LOGGER_API_URL}/matches/${matchId}`,
  );
  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "");
    console.error(
      "Get match failed:",
      response.status,
      response.statusText,
      errorPayload,
    );
    throw new Error(`Failed to fetch match: ${errorPayload}`);
  }
  return response.json();
};

export const updateMatchEvent = async (
  eventId: string,
  updates: Partial<MatchEvent> & { notes?: string | null },
): Promise<MatchEvent> => {
  const response = await fetchLoggerWithAuth(`${EVENTS_API_URL}/${eventId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "");
    throw new Error(`Failed to update event: ${errorPayload}`);
  }

  return response.json();
};

export const deleteMatchEvent = async (eventId: string): Promise<void> => {
  const response = await fetchLoggerWithAuth(`${EVENTS_API_URL}/${eventId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorPayload = await response.text().catch(() => "");
    throw new Error(`Failed to delete event: ${errorPayload}`);
  }
};
