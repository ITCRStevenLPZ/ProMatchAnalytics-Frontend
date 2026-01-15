import { request } from "@playwright/test";

const BACKEND_BASE_URL =
  process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000";
const CLEANUP_ENDPOINT = `${BACKEND_BASE_URL.replace(/\/+$/, "")}/e2e/cleanup`;

export default async function globalTeardown() {
  const context = await request.newContext({
    extraHTTPHeaders: {
      Authorization: "Bearer e2e-playwright",
      "Content-Type": "application/json",
    },
  });

  try {
    const response = await context.post(CLEANUP_ENDPOINT);
    if (!response.ok()) {
      const body = await response.text();
      console.warn(`E2E cleanup failed: ${response.status()} ${body}`);
    }
  } catch (err) {
    console.warn("E2E cleanup request threw", err);
  } finally {
    await context.dispose();
  }
}
