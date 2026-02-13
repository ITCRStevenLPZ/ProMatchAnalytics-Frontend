import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.MATCH_EVENTS_BASE_URL || "http://127.0.0.1:8000/api/v1";
const MATCH_ID = __ENV.MATCH_ID || "LOADTEST-MATCH";
const AUTH_TOKEN = __ENV.BEARER_TOKEN || "";
const PAGE_SIZE = Number(__ENV.PAGE_SIZE || 500);
const MAX_PAGES = Number(__ENV.MAX_PAGES || 100);

const STEADY_VUS = Number(__ENV.VUS || 25);
const STEADY_DURATION = __ENV.DURATION || "3m";
const RAMP_VUS = Number(__ENV.RAMP_VUS || 50);
const RAMP_DURATION = __ENV.RAMP_DURATION || "2m";

const latencyTrend = new Trend("match_events_latency", true);
const recordsCounter = new Counter("match_events_records_total");

export const options = {
  discardResponseBodies: false,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<400"],
    match_events_latency: ["p(95)<350"],
  },
  scenarios: {
    steady_load: {
      executor: "constant-vus",
      vus: STEADY_VUS,
      duration: STEADY_DURATION,
      gracefulStop: "30s",
    },
    ramp_sweep: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: Math.floor(RAMP_VUS / 2) },
        { duration: RAMP_DURATION, target: RAMP_VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
};

function buildHeaders() {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

function randomPage() {
  return Math.max(1, Math.floor(Math.random() * MAX_PAGES) + 1);
}

export default function () {
  const page = randomPage();
  const url = `${BASE_URL}/matches/${MATCH_ID}/events?page=${page}&page_size=${PAGE_SIZE}`;

  const res = http.get(url, { headers: buildHeaders() });
  latencyTrend.add(res.timings.duration);

  const successful = check(res, {
    "status is 200": (r) => r.status === 200,
    "body under 750kB": (r) => (r.body ? r.body.length : 0) < 750 * 1024,
  });

  if (successful) {
    let items = 0;
    try {
      const payload = res.json();
      if (Array.isArray(payload)) {
        items = payload.length;
      } else if (Array.isArray(payload?.items)) {
        items = payload.items.length;
      }
    } catch (error) {
      // leave items at 0; decoding failure captured via check metrics already
    }
    recordsCounter.add(items);
  }

  sleep(0.5);
}
