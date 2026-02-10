import { apiClient } from "../lib/api";
import type { ActionDefinition } from "../types/workflows";

export const listActionDefinitions = async (): Promise<ActionDefinition[]> => {
  return apiClient.get<ActionDefinition[]>("/action-definitions/");
};

export const getActionDefinition = async (
  actionId: string,
): Promise<ActionDefinition> => {
  return apiClient.get<ActionDefinition>(`/action-definitions/${actionId}`);
};

export const createActionDefinition = async (
  payload: ActionDefinition,
): Promise<ActionDefinition> => {
  return apiClient.post<ActionDefinition>("/action-definitions/", payload);
};

export const updateActionDefinition = async (
  actionId: string,
  payload: Partial<ActionDefinition>,
): Promise<ActionDefinition> => {
  return apiClient.put<ActionDefinition>(
    `/action-definitions/${actionId}`,
    payload,
  );
};

export const deleteActionDefinition = async (
  actionId: string,
): Promise<void> => {
  await apiClient.delete(`/action-definitions/${actionId}`);
};
