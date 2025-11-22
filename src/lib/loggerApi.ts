import type { MatchEvent } from '../store/useMatchLogStore';

const buildApiBase = (raw?: string) => {
  const sanitized = (raw || 'http://localhost:8000').replace(/\/+$/, '');
  return sanitized.endsWith('/api/v1') ? sanitized : `${sanitized}/api/v1`;
};

export const IS_E2E_TEST_MODE = import.meta.env.VITE_E2E_TEST_MODE === 'true';
const E2E_BYPASS_TOKEN = import.meta.env.VITE_E2E_BYPASS_TOKEN ?? 'e2e-playwright';

const API_URL = buildApiBase(import.meta.env.VITE_API_URL);
export const LOGGER_API_URL = `${API_URL}/logger`;

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

export const fetchLoggerWithAuth = (url: string, init?: RequestInit) => {
  if (!IS_E2E_TEST_MODE) {
    return fetch(url, init);
  }
  const mergedHeaders = {
    Authorization: `Bearer ${E2E_BYPASS_TOKEN}`,
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
      const errorPayload = await response.text().catch(() => '');
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
