import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createWorkflow, listWorkflows } from "../../../api/workflows";
import type {
  WorkflowContextMatcher,
  WorkflowDefinition,
} from "../../../types/workflows";
import { mapFlowToDefinition } from "../../../lib/workflow/graphMappers";
import type { FlowEdge, FlowNode } from "../../../lib/workflow/graphMappers";

const buildContextMatcher = (actionId: string): WorkflowContextMatcher => ({
  action_id: actionId,
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
});

const buildInitialGraph = (actionId: string) => {
  const startId = "start";
  const actionNodeId = "action";
  const endId = "end";

  const nodes: FlowNode[] = [
    {
      id: startId,
      type: "workflowNode",
      position: { x: 120, y: 80 },
      data: { nodeType: "start", label: "Start" },
    },
    {
      id: actionNodeId,
      type: "workflowNode",
      position: { x: 380, y: 80 },
      data: {
        nodeType: "action",
        label: actionId,
        actionDefinitionId: actionId,
        required: false,
        sideEffects: [],
      },
    },
    {
      id: endId,
      type: "workflowNode",
      position: { x: 640, y: 80 },
      data: { nodeType: "end", label: "End" },
    },
  ];

  const edges: FlowEdge[] = [
    {
      id: "edge-start-action",
      source: startId,
      target: actionNodeId,
      data: { conditions: [], priority: 0, required: false },
    },
    {
      id: "edge-action-self",
      source: actionNodeId,
      target: actionNodeId,
      data: { conditions: [], priority: 0, required: false },
    },
    {
      id: "edge-action-end",
      source: actionNodeId,
      target: endId,
      data: { conditions: [], priority: 1, required: false },
    },
  ];

  return { nodes, edges };
};

export default function WorkflowListPage() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [actionId, setActionId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWorkflows();
      setWorkflows(data);
    } catch (err) {
      console.error("Failed to load workflows", err);
      setError("Unable to load workflows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkflows();
  }, []);

  const canCreate = useMemo(
    () => name.trim().length > 0 && actionId.trim().length > 0,
    [name, actionId],
  );

  const handleCreate = async () => {
    if (!canCreate) {
      setError("Workflow name and action id are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { nodes, edges } = buildInitialGraph(actionId.trim());
      const draft: WorkflowDefinition = {
        workflow_id: "",
        name: name.trim(),
        description: `Workflow for ${actionId.trim()}`,
        is_active: isActive,
        default_cycle_limit: 10,
        context_matcher: buildContextMatcher(actionId.trim()),
        nodes: [],
        edges: [],
      };

      const payload = mapFlowToDefinition(draft, nodes, edges);
      const created = await createWorkflow(payload);
      setName("");
      setActionId("");
      setIsActive(true);
      await loadWorkflows();
      navigate(`/admin/workflows/${created.workflow_id}`);
    } catch (err) {
      console.error("Failed to create workflow", err);
      setError("Unable to create workflow.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              Workflow Designer
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Create and manage workflow definitions.
            </p>
          </div>
          <button
            onClick={() => navigate("/admin")}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Back to Admin
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Create Workflow
          </h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs uppercase text-slate-500">Name</label>
              <input
                data-testid="workflow-create-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Pass flow"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">
                Action ID
              </label>
              <input
                data-testid="workflow-create-action-id"
                value={actionId}
                onChange={(event) => setActionId(event.target.value)}
                placeholder="Pass"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                data-testid="workflow-create-active"
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <span className="text-sm text-slate-600">Active</span>
            </div>
            <div className="flex items-end">
              <button
                data-testid="workflow-create-submit"
                onClick={handleCreate}
                disabled={saving}
                className="w-full rounded bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Workflow"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Existing Workflows
          </h2>
          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {!loading && workflows.length === 0 && (
            <p className="text-sm text-slate-500">No workflows yet.</p>
          )}
          <div className="grid grid-cols-1 gap-3">
            {workflows.map((workflow) => (
              <button
                key={workflow.workflow_id}
                data-testid={`workflow-card-${workflow.workflow_id}`}
                onClick={() =>
                  navigate(`/admin/workflows/${workflow.workflow_id}`)
                }
                className="border border-slate-200 rounded-lg p-4 text-left hover:border-slate-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">
                      {workflow.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {workflow.workflow_id} · Active version{" "}
                      {workflow.active_version ?? "-"}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                    {workflow.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
