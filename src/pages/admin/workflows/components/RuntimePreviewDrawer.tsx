import { useState } from "react";
import type {
  WorkflowRuntimeRequest,
  WorkflowRuntimeResponse,
} from "../../../../types/workflows";

interface RuntimePreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  onPreview: (
    payload: WorkflowRuntimeRequest,
  ) => Promise<WorkflowRuntimeResponse | null>;
  workflowId: string | null;
  workflowVersion: number | null;
}

export default function RuntimePreviewDrawer({
  open,
  onClose,
  onPreview,
  workflowId,
  workflowVersion,
}: RuntimePreviewDrawerProps) {
  const [actionId, setActionId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [teamScope, setTeamScope] = useState("any");
  const [result, setResult] = useState<WorkflowRuntimeResponse | null>(null);

  if (!open) return null;

  const handleRun = async () => {
    const payload: WorkflowRuntimeRequest = {
      match_id: "E2E-MATCH",
      context: {
        team_scope: teamScope,
        zone: { zone_type: "all" },
      },
      last_action: {
        action_id: actionId,
        outcome: outcome || undefined,
      },
      workflow_id: workflowId ?? undefined,
      workflow_version: workflowVersion ?? undefined,
    };
    const response = await onPreview(payload);
    setResult(response);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end justify-center z-50">
      <div className="bg-white w-full max-w-3xl p-6 rounded-t-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Runtime Preview
          </h3>
          <button onClick={onClose} className="text-sm text-slate-500">
            Close
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs uppercase text-slate-500">
              Action ID
            </label>
            <input
              data-testid="runtime-action-id"
              value={actionId}
              onChange={(event) => setActionId(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">Outcome</label>
            <input
              data-testid="runtime-outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">
              Team Scope
            </label>
            <select
              data-testid="runtime-team-scope"
              value={teamScope}
              onChange={(event) => setTeamScope(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="any">any</option>
              <option value="home">home</option>
              <option value="away">away</option>
              <option value="neutral">neutral</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            data-testid="runtime-run"
            onClick={handleRun}
            className="rounded bg-slate-900 text-white px-4 py-2 text-sm"
          >
            Run Preview
          </button>
        </div>
        <div
          className="mt-4 bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700"
          data-testid="runtime-result"
        >
          {result ? (
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          ) : (
            <span>Run a preview to see results.</span>
          )}
        </div>
      </div>
    </div>
  );
}
