import { useMemo, useState } from "react";
import type {
  ActionDefinition,
  UiWorkflowNodeType,
} from "../../../../types/workflows";
import { useWorkflowDesignerStore } from "../../../../stores/workflowDesignerStore";

interface WorkflowPaletteProps {
  actionDefinitions: ActionDefinition[];
}

const NODE_TYPES: Array<{ label: string; type: UiWorkflowNodeType }> = [
  { label: "Start", type: "start" },
  { label: "Action", type: "action" },
  { label: "System", type: "system" },
  { label: "Decision", type: "decision" },
  { label: "End", type: "end" },
];

export default function WorkflowPalette({
  actionDefinitions,
}: WorkflowPaletteProps) {
  const [query, setQuery] = useState("");
  const { nodes, setNodes, markDirty } = useWorkflowDesignerStore();

  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return actionDefinitions;
    return actionDefinitions.filter((action) =>
      `${action.name} ${action.action_id}`.toLowerCase().includes(normalized),
    );
  }, [actionDefinitions, query]);

  const addNode = (type: UiWorkflowNodeType, actionDefinitionId?: string) => {
    const id = `${type}-${Date.now()}`;
    const nextNode = {
      id,
      type: "workflowNode",
      position: { x: 100 + nodes.length * 40, y: 120 + nodes.length * 60 },
      data: {
        nodeType: type,
        label: type === "action" ? actionDefinitionId || "Action" : type,
        actionDefinitionId: actionDefinitionId ?? null,
        required: false,
        sideEffects: [],
      },
    };
    setNodes([...nodes, nextNode]);
    markDirty(true);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 h-fit">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Palette</h2>

      <div className="space-y-2 mb-4">
        {NODE_TYPES.map((item) => (
          <button
            key={item.type}
            data-testid={`workflow-palette-node-${item.type}`}
            onClick={() => addNode(item.type)}
            className="w-full text-left px-3 py-2 rounded border border-slate-200 text-sm hover:bg-slate-50"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-3">
        <h3 className="text-xs uppercase text-slate-500 mb-2">Actions</h3>
        <input
          data-testid="workflow-palette-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search actions"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm mb-3"
        />
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredActions.map((action) => (
            <button
              key={action.action_id ?? action.name}
              data-testid={`workflow-palette-action-${action.action_id}`}
              onClick={() => addNode("action", action.action_id ?? undefined)}
              className="w-full text-left px-3 py-2 rounded border border-slate-200 text-sm hover:bg-slate-50"
            >
              <div className="font-medium text-slate-800">{action.name}</div>
              <div className="text-xs text-slate-500">{action.action_id}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
