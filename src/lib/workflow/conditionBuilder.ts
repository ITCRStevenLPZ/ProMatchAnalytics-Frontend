import type { WorkflowCondition } from "../../types/workflows";

export const serializeConditions = (
  conditions: WorkflowCondition[],
): WorkflowCondition[] => conditions;

export const parseConditions = (
  conditions: WorkflowCondition[],
): WorkflowCondition[] => conditions;
