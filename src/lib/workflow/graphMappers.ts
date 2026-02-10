import type { Edge, Node } from "@xyflow/react";
import type {
  UiWorkflowNodeType,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowSideEffect,
} from "../../types/workflows";

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: UiWorkflowNodeType;
  label: string;
  actionDefinitionId?: string | null;
  required?: boolean;
  sideEffects?: WorkflowSideEffect[];
  uiType?: "start" | "end" | null;
}

export interface WorkflowEdgeData extends Record<string, unknown> {
  conditions: WorkflowEdge["conditions"];
  priority: number;
  required: boolean;
}

export type FlowNode = Node<WorkflowNodeData>;
export type FlowEdge = Edge<WorkflowEdgeData>;

const resolveUiType = (node: WorkflowNode): UiWorkflowNodeType => {
  const uiType = (node.ui_meta?.ui_type as string | undefined) ?? null;
  if (node.node_type === "decision" && uiType === "start") return "start";
  if (node.node_type === "decision" && uiType === "end") return "end";
  return node.node_type;
};

const mapUiToApiNodeType = (
  nodeType: UiWorkflowNodeType,
): WorkflowNode["node_type"] => {
  if (nodeType === "start" || nodeType === "end") return "decision";
  return nodeType;
};

export const mapDefinitionToFlow = (definition: WorkflowDefinition) => {
  const nodes: FlowNode[] = definition.nodes.map((node, index) => {
    const position =
      (node.ui_meta?.position as { x?: number; y?: number } | undefined) ?? {};
    return {
      id: node.node_id,
      type: "workflowNode",
      position: {
        x: typeof position.x === "number" ? position.x : 160 + index * 40,
        y: typeof position.y === "number" ? position.y : 120 + index * 60,
      },
      data: {
        nodeType: resolveUiType(node),
        label: node.label,
        actionDefinitionId: node.action_definition_id ?? null,
        required: node.required ?? false,
        sideEffects: node.side_effects ?? [],
        uiType: (node.ui_meta?.ui_type as "start" | "end" | null) ?? null,
      },
    };
  });

  const edges: FlowEdge[] = definition.edges.map((edge) => ({
    id: edge.edge_id,
    source: edge.source,
    target: edge.target,
    data: {
      conditions: edge.conditions ?? [],
      priority: edge.priority ?? 0,
      required: edge.required ?? false,
    },
  }));

  return { nodes, edges };
};

export const mapFlowToDefinition = (
  base: WorkflowDefinition,
  nodes: FlowNode[],
  edges: FlowEdge[],
): WorkflowDefinition => {
  const mappedNodes: WorkflowNode[] = nodes.map((node) => ({
    node_id: node.id,
    node_type: mapUiToApiNodeType(node.data.nodeType),
    label: node.data.label,
    action_definition_id: node.data.actionDefinitionId ?? null,
    side_effects: node.data.sideEffects ?? [],
    max_visits: null,
    required: node.data.required ?? false,
    ui_meta: {
      ui_type:
        node.data.nodeType === "start" || node.data.nodeType === "end"
          ? node.data.nodeType
          : null,
      position: node.position,
    },
  }));

  const mappedEdges: WorkflowEdge[] = edges.map((edge) => ({
    edge_id: edge.id,
    source: edge.source,
    target: edge.target,
    conditions: edge.data?.conditions ?? [],
    priority: edge.data?.priority ?? 0,
    required: edge.data?.required ?? false,
  }));

  return {
    ...base,
    nodes: mappedNodes,
    edges: mappedEdges,
  };
};
