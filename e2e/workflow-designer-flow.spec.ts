import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  apiJson,
  createAdminApiContext,
  BACKEND_BASE_URL,
  uniqueId,
} from "./utils/admin";
import {
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
} from "./utils/logger";

const adminUser = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  photoURL: "",
  role: "admin" as const,
};

const primeAdminStorage = async (page: any) => {
  await page.addInitScript((user) => {
    try {
      window.localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    } catch (err) {
      console.warn("failed to prime admin storage", err);
    }
  }, adminUser);
};

const promoteToAdmin = async (page: any) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    store?.setState({ user, loading: false });
    store?.getState().setUser?.(user);
    try {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    } catch (err) {
      console.warn("failed to persist admin role", err);
    }
  }, adminUser);
};

const ensureAdminRole = async (page: any) => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await promoteToAdmin(page);
    const role = await page.evaluate(
      () => (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role,
    );
    if (role === "admin") return;
    await page.waitForTimeout(200);
  }
  throw new Error("Failed to assert admin role in auth store");
};

test.describe("Workflow designer end-to-end", () => {
  let api: APIRequestContext;
  let matchId: string;

  test.beforeAll(async () => {
    api = await createAdminApiContext();

    matchId = uniqueId("WF-MATCH");
    await api.post(`${BACKEND_BASE_URL}/e2e/reset`, {
      data: { match_id: matchId },
    });

    const ensureActionDefinition = async (actionId: string, name: string) => {
      const response = await api.post("action-definitions/", {
        data: {
          action_id: actionId,
          name,
          category: "OnBall",
          requires_source: true,
          requires_destination: false,
          fields: [],
          validation_rules: {},
          logging_shape: {},
          is_active: true,
        },
      });
      if (response.ok()) return;
      if (response.status() === 400) return;
      throw new Error(
        `Action seed failed: ${response.status()} ${await response.text()}`,
      );
    };

    await ensureActionDefinition("Pass", "Pass");
    await ensureActionDefinition("Shot", "Shot");

    const workflowPayload = {
      workflow_id: uniqueId("WF-GATE"),
      name: "Workflow Gate Pass to Shot",
      description: "Gate next action to Shot after Pass",
      is_active: true,
      default_cycle_limit: 10,
      context_matcher: {
        action_id: "Pass",
        outcomes: [],
        team_scope: "any",
        roles: [],
        positions: [],
        zones: [{ zone_type: "all", payload: {} }],
        phases: {
          allow_all: true,
          match_statuses: [],
          periods: [],
          clock_modes: [],
        },
      },
      nodes: [
        {
          node_id: "start",
          node_type: "decision",
          label: "Start",
          ui_meta: { ui_type: "start", position: { x: 80, y: 60 } },
        },
        {
          node_id: "pass",
          node_type: "action",
          label: "Pass",
          action_definition_id: "Pass",
          required: true,
          ui_meta: { position: { x: 300, y: 60 } },
        },
        {
          node_id: "shot",
          node_type: "action",
          label: "Shot",
          action_definition_id: "Shot",
          required: true,
          ui_meta: { position: { x: 520, y: 60 } },
        },
        {
          node_id: "end",
          node_type: "decision",
          label: "End",
          ui_meta: { ui_type: "end", position: { x: 740, y: 60 } },
        },
      ],
      edges: [
        {
          edge_id: "e-start",
          source: "start",
          target: "pass",
          priority: 0,
          required: true,
        },
        {
          edge_id: "e-pass-shot",
          source: "pass",
          target: "shot",
          priority: 0,
          required: true,
        },
        {
          edge_id: "e-shot-end",
          source: "shot",
          target: "end",
          priority: 0,
          required: false,
        },
      ],
    };

    const workflowResponse = await apiJson(
      await api.post("workflows/", { data: workflowPayload }),
    );
    await api.post(`workflows/${workflowResponse.workflow_id}/publish`, {
      data: {},
    });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("creates workflows via UI and validates cockpit surfaces", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await primeAdminStorage(page);

    await page.goto("/admin/actions");
    await ensureAdminRole(page);
    await expect(
      page.getByRole("heading", { name: /Action Library/i }),
    ).toBeVisible({ timeout: 15000 });

    const uiActionId = uniqueId("UI-ACT");
    await page.getByTestId("action-def-id").fill(uiActionId);
    await page.getByTestId("action-def-name").fill(`UI ${uiActionId}`);
    await page.getByTestId("action-def-category").selectOption("OnBall");
    await page.getByTestId("action-def-submit").click();
    await expect(page.getByText(`UI ${uiActionId}`)).toBeVisible({
      timeout: 15000,
    });

    await page.goto("/admin/workflows");
    await ensureAdminRole(page);
    await expect(
      page.getByRole("heading", { name: /Workflow Designer/i }),
    ).toBeVisible({ timeout: 15000 });
    await page
      .getByTestId("workflow-create-name")
      .fill(`Workflow ${uiActionId}`);
    await page.getByTestId("workflow-create-action-id").fill(uiActionId);
    await page.getByTestId("workflow-create-submit").click();

    await expect(page.getByTestId("workflow-canvas")).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId("workflow-publish").click();
    await page.getByTestId("workflow-preview").click();
    await page.getByTestId("runtime-action-id").fill(uiActionId);
    await page.getByTestId("runtime-outcome").fill("Complete");
    await page.getByTestId("runtime-run").click();
    await expect(page.getByTestId("runtime-result")).toContainText(uiActionId);

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page, "home");

    await page.getByTestId("operator-clock-input").fill("BAD");
    await page.getByTestId("operator-clock-input").blur();
    await expect(page.getByTestId("logger-toast")).toBeVisible({
      timeout: 8000,
    });

    const startClockButton = page.getByTestId("btn-start-clock");
    if (await startClockButton.isEnabled().catch(() => false)) {
      await startClockButton.click();
    }

    await page.getByTestId("btn-ineffective-event").click();
    await expect(page.getByTestId("ineffective-note-modal")).toBeVisible();
    await page.getByTestId("ineffective-note-input").fill("Ball out of play");
    await page.getByTestId("ineffective-note-save").click();

    await submitStandardPass(page, "home");

    await page.waitForTimeout(300);
    await page.getByTestId("field-player-HOME-1").click();
    await page.getByTestId("quick-action-more").click();
    await page.getByTestId("action-btn-Duel").click();
    await expect(page.getByTestId("logger-toast")).toContainText(
      "Workflow requires",
    );
    await expect(page.getByTestId("action-selection")).toBeVisible();
    await page.getByTestId("action-btn-Shot").click();
    await expect(page.getByTestId("outcome-btn-OnTarget")).toBeVisible();

    await page.getByTestId("event-note-edit").first().click();
    await page.getByTestId("event-note-textarea").fill("Reviewed in workflow");
    await page.getByTestId("event-note-save").click();
  });
});
