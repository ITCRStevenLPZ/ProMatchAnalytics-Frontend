import type { FlowEdge, FlowNode } from "./graphMappers";

export type ValidationIssue = {
  id: string;
  message: string;
  severity: "error" | "warning";
};

export const validateWorkflowGraph = (
  nodes: FlowNode[],
  edges: FlowEdge[],
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const startNodes = nodes.filter((node) => node.data.nodeType === "start");
  if (startNodes.length !== 1) {
    issues.push({
      id: "start-node",
      message: "Workflow must contain exactly one Start node.",
      severity: "error",
    });
  }

  const actionNodes = nodes.filter((node) => node.data.nodeType === "action");
  if (actionNodes.length === 0) {
    issues.push({
      id: "action-node",
      message: "Workflow must include at least one Action node.",
      severity: "error",
    });
  }

  const missingAction = actionNodes.filter(
    (node) => !node.data.actionDefinitionId,
  );
  if (missingAction.length) {
    issues.push({
      id: "action-definition",
      message: "Action nodes must select an Action Definition.",
      severity: "error",
    });
  }

  edges.forEach((edge) => {
    const hasSource = nodes.some((node) => node.id === edge.source);
    const hasTarget = nodes.some((node) => node.id === edge.target);
    if (!hasSource || !hasTarget) {
      issues.push({
        id: `edge-${edge.id}`,
        message: "Edge has missing source or target.",
        severity: "error",
      });
    }
  });

  if (startNodes.length === 1) {
    const visited = new Set<string>();
    const queue: string[] = [startNodes[0].id];
    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      edges
        .filter((edge) => edge.source === current)
        .forEach((edge) => {
          if (!visited.has(edge.target)) {
            queue.push(edge.target);
          }
        });
    }

    nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        issues.push({
          id: `unreachable-${node.id}`,
          message: `Node "${node.data.label}" is not reachable from Start.`,
          severity: "warning",
        });
      }
    });
  }

  return issues;
};
