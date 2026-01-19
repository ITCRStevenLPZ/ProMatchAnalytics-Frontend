/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

const HOST = process.env.PROMATCH_PLAYWRIGHT_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PROMATCH_PLAYWRIGHT_FRONTEND_PORT ?? 4173);
const BACKEND_PORT = Number(
  process.env.PROMATCH_PLAYWRIGHT_BACKEND_PORT ?? 8000,
);
const BACKEND_URL = `http://${HOST}:${BACKEND_PORT}`;
const BACKEND_PYTHON = "../ProMatchAnalytics-Backend/venv/bin/python";

const backendEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value === undefined) continue;
  if (key.toUpperCase().startsWith("VITE_")) continue;
  backendEnv[key] = value;
}
backendEnv.ALLOWED_ORIGINS = `http://${HOST}:${PORT}`;
backendEnv.APP_ENV = backendEnv.APP_ENV ?? "e2e";
backendEnv.PROMATCH_E2E_BYPASS_AUTH =
  backendEnv.PROMATCH_E2E_BYPASS_AUTH ?? "1";
backendEnv.PROMATCH_E2E_BYPASS_TOKEN =
  backendEnv.PROMATCH_E2E_BYPASS_TOKEN ?? "e2e-playwright";
backendEnv.PROMATCH_E2E_BYPASS_EMAIL =
  backendEnv.PROMATCH_E2E_BYPASS_EMAIL ?? "e2e@example.com";
backendEnv.PROMATCH_E2E_BYPASS_NAME =
  backendEnv.PROMATCH_E2E_BYPASS_NAME ?? "E2E Admin";

process.env.PROMATCH_E2E_BACKEND_URL = BACKEND_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 60000,
  retries: process.env.CI ? 2 : 0,
  maxFailures: 1,
  globalTeardown: "./e2e/globalTeardown.ts",
  reporters: [
    ["list"],
    ["./e2e/reporters/fail-fast-log-reporter.ts"],
    ["./e2e/reporters/warn-error-file-reporter.ts"],
  ],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: "on-first-retry",
    video: { mode: "retain-on-failure" },
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `${BACKEND_PYTHON} ../ProMatchAnalytics-Backend/scripts/run_e2e_server.py --host ${HOST} --port ${BACKEND_PORT}`,
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: backendEnv,
    },
    {
      command: `npm run dev -- --host ${HOST} --port ${PORT}`,
      url: `http://${HOST}:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_FIREBASE_API_KEY: "test-api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "test-auth-domain",
        VITE_FIREBASE_PROJECT_ID: "test-project",
        VITE_FIREBASE_STORAGE_BUCKET: "test-bucket",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "test-sender",
        VITE_FIREBASE_APP_ID: "test-app",
        VITE_WS_URL: `ws://${HOST}:${BACKEND_PORT}`,
        VITE_API_URL: BACKEND_URL,
        VITE_E2E_TEST_MODE: "true",
        VITE_E2E_BYPASS_TOKEN: "e2e-playwright",
      },
    },
  ],
});
