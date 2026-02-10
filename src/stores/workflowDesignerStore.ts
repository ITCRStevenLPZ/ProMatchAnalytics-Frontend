import { create } from "zustand";
import type {
  ActionDefinition,
  WorkflowDefinition,
  WorkflowVersion,
} from "../types/workflows";
import type { FlowEdge, FlowNode } from "../lib/workflow/graphMappers";

interface WorkflowDesignerState {
  workflow: WorkflowDefinition | null;
  versions: WorkflowVersion[];
  actionDefinitions: ActionDefinition[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;
  setWorkflow: (workflow: WorkflowDefinition | null) => void;
  setVersions: (versions: WorkflowVersion[]) => void;
  setActionDefinitions: (defs: ActionDefinition[]) => void;
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  markDirty: (dirty: boolean) => void;
  setLastSavedAt: (value: string | null) => void;
}

export const useWorkflowDesignerStore = create<WorkflowDesignerState>(
  (set) => ({
    workflow: null,
    versions: [],
    actionDefinitions: [],
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    isDirty: false,
    lastSavedAt: null,
    setWorkflow: (workflow) => set({ workflow }),
    setVersions: (versions) => set({ versions }),
    setActionDefinitions: (defs) => set({ actionDefinitions: defs }),
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    selectNode: (nodeId) =>
      set({ selectedNodeId: nodeId, selectedEdgeId: null }),
    selectEdge: (edgeId) =>
      set({ selectedEdgeId: edgeId, selectedNodeId: null }),
    markDirty: (dirty) => set({ isDirty: dirty }),
    setLastSavedAt: (value) => set({ lastSavedAt: value }),
  }),
);
