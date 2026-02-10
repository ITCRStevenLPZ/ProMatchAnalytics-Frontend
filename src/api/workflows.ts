import { apiClient } from "../lib/api";
import type {
  PublishWorkflowResponse,
  WorkflowDefinition,
  WorkflowRuntimeRequest,
  WorkflowRuntimeResponse,
  WorkflowVersion,
} from "../types/workflows";

export const listWorkflows = async (): Promise<WorkflowDefinition[]> => {
  return apiClient.get<WorkflowDefinition[]>("/workflows/");
};

export const getWorkflow = async (
  workflowId: string,
): Promise<WorkflowDefinition> => {
  return apiClient.get<WorkflowDefinition>(`/workflows/${workflowId}`);
};

export const createWorkflow = async (
  payload: WorkflowDefinition,
): Promise<WorkflowDefinition> => {
  return apiClient.post<WorkflowDefinition>("/workflows/", payload);
};

export const updateWorkflow = async (
  workflowId: string,
  payload: Partial<WorkflowDefinition>,
): Promise<WorkflowDefinition> => {
  return apiClient.put<WorkflowDefinition>(`/workflows/${workflowId}`, payload);
};

export const publishWorkflow = async (
  workflowId: string,
): Promise<PublishWorkflowResponse> => {
  return apiClient.post<PublishWorkflowResponse>(
    `/workflows/${workflowId}/publish`,
    {},
  );
};

export const listWorkflowVersions = async (
  workflowId: string,
): Promise<WorkflowVersion[]> => {
  return apiClient.get<WorkflowVersion[]>(`/workflows/${workflowId}/versions`);
};

export const evaluateWorkflowRuntime = async (
  payload: WorkflowRuntimeRequest,
): Promise<WorkflowRuntimeResponse> => {
  return apiClient.post<WorkflowRuntimeResponse>("/workflows/runtime", payload);
};
