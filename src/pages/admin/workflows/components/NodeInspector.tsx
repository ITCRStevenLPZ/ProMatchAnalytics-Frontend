import type { ActionDefinition } from "../../../../types/workflows";
import type { FlowNode } from "../../../../lib/workflow/graphMappers";

interface NodeInspectorProps {
  node: FlowNode | null;
  nodes: FlowNode[];
  actionDefinitions: ActionDefinition[];
  onChange: (nodes: FlowNode[]) => void;
}

export default function NodeInspector({
  node,
  nodes,
  actionDefinitions,
  onChange,
}: NodeInspectorProps) {
  if (!node) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
        Select a node to edit.
      </div>
    );
  }

  const handleLabelChange = (value: string) => {
    const next = {
      ...node,
      data: { ...node.data, label: value },
    };
    const updated = nodes.map((item) => (item.id === node.id ? next : item));
    onChange(updated);
  };

  const handleActionDefinitionChange = (value: string) => {
    const next = {
      ...node,
      data: { ...node.data, actionDefinitionId: value },
    };
    const updated = nodes.map((item) => (item.id === node.id ? next : item));
    onChange(updated);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Node Inspector</h3>
      <div>
        <label className="text-xs uppercase text-slate-500">Label</label>
        <input
          data-testid="workflow-node-label"
          value={node.data.label}
          onChange={(event) => handleLabelChange(event.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {node.data.nodeType === "action" && (
        <div>
          <label className="text-xs uppercase text-slate-500">
            Action Definition
          </label>
          <select
            data-testid="workflow-node-action-definition"
            value={node.data.actionDefinitionId ?? ""}
            onChange={(event) =>
              handleActionDefinitionChange(event.target.value)
            }
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select action</option>
            {actionDefinitions.map((action) => (
              <option key={action.action_id} value={action.action_id ?? ""}>
                {action.name} ({action.action_id})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
