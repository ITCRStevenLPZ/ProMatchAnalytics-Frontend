import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listActionDefinitions } from "../../../api/actionDefinitions";
import {
  evaluateWorkflowRuntime,
  getWorkflow,
  listWorkflowVersions,
  publishWorkflow,
  updateWorkflow,
} from "../../../api/workflows";
import {
  mapDefinitionToFlow,
  mapFlowToDefinition,
} from "../../../lib/workflow/graphMappers";
import { validateWorkflowGraph } from "../../../lib/workflow/graphValidators";
import { useWorkflowDesignerStore } from "../../../stores/workflowDesignerStore";
import type {
  WorkflowDefinition,
  WorkflowRuntimeRequest,
  WorkflowRuntimeResponse,
} from "../../../types/workflows";
import WorkflowTopBar from "./components/WorkflowTopBar";
import WorkflowPalette from "./components/WorkflowPalette";
import WorkflowCanvas from "./components/WorkflowCanvas";
import NodeInspector from "./components/NodeInspector";
import EdgeInspector from "./components/EdgeInspector";
import ValidationPanel from "./components/ValidationPanel";
import RuntimePreviewDrawer from "./components/RuntimePreviewDrawer";

export default function WorkflowDesignerPage() {
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const {
    workflow,
    versions,
    actionDefinitions,
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    isDirty,
    lastSavedAt,
    setWorkflow,
    setVersions,
    setActionDefinitions,
    setNodes,
    setEdges,
    selectNode,
    selectEdge,
    markDirty,
    setLastSavedAt,
  } = useWorkflowDesignerStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>("draft");

  const loadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const [workflowResponse, versionsResponse, actionDefs] =
        await Promise.all([
          getWorkflow(workflowId),
          listWorkflowVersions(workflowId),
          listActionDefinitions(),
        ]);
      setWorkflow(workflowResponse);
      setVersions(versionsResponse);
      setActionDefinitions(actionDefs);
      const { nodes: flowNodes, edges: flowEdges } =
        mapDefinitionToFlow(workflowResponse);
      setNodes(flowNodes);
      setEdges(flowEdges);
      setSelectedVersion("draft");
    } catch (err) {
      console.error("Failed to load workflow", err);
      setError("Unable to load workflow designer.");
    } finally {
      setLoading(false);
    }
  }, [
    workflowId,
    setWorkflow,
    setVersions,
    setActionDefinitions,
    setNodes,
    setEdges,
  ]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  const activeStatus = workflow?.active_version ? "Published" : "Draft";

  const selectVersion = (value: string) => {
    setSelectedVersion(value);
    if (!workflow) return;
    if (value === "draft") {
      const { nodes: flowNodes, edges: flowEdges } =
        mapDefinitionToFlow(workflow);
      setNodes(flowNodes);
      setEdges(flowEdges);
      return;
    }
    const version = versions.find((item) => String(item.version) === value);
    if (!version) return;
    const snapshot = version.definition_snapshot as WorkflowDefinition;
    const { nodes: flowNodes, edges: flowEdges } =
      mapDefinitionToFlow(snapshot);
    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  const handleValidate = () => {
    const issues = validateWorkflowGraph(nodes, edges);
    setServerErrors(issues.map((issue) => issue.message));
    return issues.length === 0;
  };

  const handleSave = async () => {
    if (!workflow) return;
    const payload = mapFlowToDefinition(workflow, nodes, edges);
    try {
      const updated = await updateWorkflow(workflow.workflow_id || "", payload);
      setWorkflow(updated);
      markDirty(false);
      setLastSavedAt(new Date().toISOString());
      setServerErrors([]);
    } catch (err) {
      console.error("Failed to save workflow", err);
      setServerErrors(["Unable to save workflow."]);
    }
  };

  const handlePublish = async () => {
    if (!workflow) return;
    try {
      await publishWorkflow(workflow.workflow_id || "");
      const updatedVersions = await listWorkflowVersions(
        workflow.workflow_id || "",
      );
      setVersions(updatedVersions);
      setServerErrors([]);
    } catch (err) {
      console.error("Failed to publish workflow", err);
      setServerErrors(["Unable to publish workflow."]);
    }
  };

  const handlePreview = async (
    payload: WorkflowRuntimeRequest,
  ): Promise<WorkflowRuntimeResponse | null> => {
    try {
      const response = await evaluateWorkflowRuntime(payload);
      return response;
    } catch (err) {
      console.error("Failed to preview runtime", err);
      setServerErrors(["Unable to run runtime preview."]);
      return null;
    }
  };

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">Loading workflow...</div>
    );
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <button
          onClick={() => navigate("/admin/workflows")}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Back to list
        </button>
        {serverErrors.length > 0 && (
          <div className="text-xs text-red-600">{serverErrors[0]}</div>
        )}
      </div>

      <WorkflowTopBar
        name={workflow?.name ?? "Workflow"}
        statusLabel={activeStatus}
        versions={versions}
        selectedVersion={selectedVersion}
        onSelectVersion={selectVersion}
        onSave={handleSave}
        onValidate={handleValidate}
        onPublish={handlePublish}
        onPreview={() => setShowPreview(true)}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
      />

      <div className="grid grid-cols-[280px_1fr_320px] gap-4 px-6 py-6">
        <WorkflowPalette actionDefinitions={actionDefinitions} />
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={(next) => {
            setNodes(next);
            markDirty(true);
          }}
          onEdgesChange={(next) => {
            setEdges(next);
            markDirty(true);
          }}
          onSelectNode={selectNode}
          onSelectEdge={selectEdge}
        />
        <div className="space-y-4">
          <NodeInspector
            node={selectedNode}
            nodes={nodes}
            actionDefinitions={actionDefinitions}
            onChange={(next) => {
              setNodes(next);
              markDirty(true);
            }}
          />
          <EdgeInspector
            edge={selectedEdge}
            edges={edges}
            onChange={(next) => {
              setEdges(next);
              markDirty(true);
            }}
          />
          <ValidationPanel issues={validateWorkflowGraph(nodes, edges)} />
        </div>
      </div>

      <RuntimePreviewDrawer
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onPreview={handlePreview}
        workflowId={workflow?.workflow_id ?? null}
        workflowVersion={
          selectedVersion === "draft" ? null : Number(selectedVersion)
        }
      />
    </div>
  );
}
