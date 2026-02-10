import React, { useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "reactflow";
import type { FlowEdge, FlowNode } from "../../../../lib/workflow/graphMappers";
import "reactflow/dist/style.css";

const WorkflowNode = ({ data }: { data: FlowNode["data"] }) => {
  return (
    <div className="px-3 py-2 rounded border border-slate-300 bg-white shadow-sm min-w-[120px]">
      <div className="text-xs uppercase text-slate-400">{data.nodeType}</div>
      <div className="text-sm font-medium text-slate-800">{data.label}</div>
      {data.actionDefinitionId && (
        <div className="text-xs text-slate-500">{data.actionDefinitionId}</div>
      )}
    </div>
  );
};

const nodeTypes = { workflowNode: WorkflowNode };

interface WorkflowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodesChange: (nodes: FlowNode[]) => void;
  onEdgesChange: (edges: FlowEdge[]) => void;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
}

export default function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSelectNode,
  onSelectEdge,
}: WorkflowCanvasProps) {
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(applyNodeChanges(changes, nodes));
    },
    [nodes, onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(applyEdgeChanges(changes, edges));
    },
    [edges, onEdgesChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const updated = addEdge(
        {
          ...connection,
          data: { conditions: [], priority: 0, required: false },
        },
        edges,
      );
      onEdgesChange(updated as FlowEdge[]);
    },
    [edges, onEdgesChange],
  );

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl h-[640px]"
      data-testid="workflow-canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}
