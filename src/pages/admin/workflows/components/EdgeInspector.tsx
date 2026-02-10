import type { FlowEdge } from "../../../../lib/workflow/graphMappers";
import type { WorkflowCondition } from "../../../../types/workflows";

interface EdgeInspectorProps {
  edge: FlowEdge | null;
  edges: FlowEdge[];
  onChange: (edges: FlowEdge[]) => void;
}

const CONDITION_OPERATORS: WorkflowCondition["operator"][] = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
];

export default function EdgeInspector({
  edge,
  edges,
  onChange,
}: EdgeInspectorProps) {
  if (!edge) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
        Select an edge to edit.
      </div>
    );
  }

  const updateEdges = (next: FlowEdge) => {
    const updated = edges.map((item) => (item.id === next.id ? next : item));
    onChange(updated);
  };

  const updateEdgeData = (updates: Partial<FlowEdge["data"]>) => {
    const next = {
      ...edge,
      data: { ...edge.data, ...updates },
    } as FlowEdge;
    updateEdges(next);
  };

  const conditions = edge.data?.conditions ?? [];

  const updateCondition = (
    index: number,
    updates: Partial<WorkflowCondition>,
  ) => {
    const nextConditions = conditions.map((condition, idx) =>
      idx === index ? { ...condition, ...updates } : condition,
    );
    updateEdgeData({ conditions: nextConditions });
  };

  const addCondition = () => {
    updateEdgeData({
      conditions: [
        ...conditions,
        { source: "action", field: "outcome", operator: "eq", value: "" },
      ],
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Edge Inspector</h3>
      <div>
        <label className="text-xs uppercase text-slate-500">Priority</label>
        <input
          data-testid="workflow-edge-priority"
          type="number"
          value={edge.data?.priority ?? 0}
          onChange={(event) =>
            updateEdgeData({ priority: Number(event.target.value) })
          }
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-xs uppercase text-slate-500">Required</label>
        <input
          data-testid="workflow-edge-required"
          type="checkbox"
          checked={edge.data?.required ?? false}
          onChange={(event) =>
            updateEdgeData({ required: event.target.checked })
          }
          className="ml-2"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase text-slate-500">Conditions</label>
          <button
            data-testid="workflow-edge-add-condition"
            onClick={addCondition}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            Add
          </button>
        </div>
        <div className="space-y-2 mt-2">
          {conditions.map((condition, index) => (
            <div
              key={`${edge.id}-cond-${index}`}
              className="grid grid-cols-4 gap-2"
            >
              <select
                data-testid="workflow-edge-conditions"
                value={condition.source}
                onChange={(event) =>
                  updateCondition(index, {
                    source: event.target.value as WorkflowCondition["source"],
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="action">action</option>
                <option value="context">context</option>
                <option value="state">state</option>
              </select>
              <input
                value={condition.field}
                onChange={(event) =>
                  updateCondition(index, { field: event.target.value })
                }
                placeholder="field"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <select
                value={condition.operator}
                onChange={(event) =>
                  updateCondition(index, {
                    operator: event.target
                      .value as WorkflowCondition["operator"],
                  })
                }
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {CONDITION_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                value={String(condition.value ?? "")}
                onChange={(event) =>
                  updateCondition(index, { value: event.target.value })
                }
                placeholder="value"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
