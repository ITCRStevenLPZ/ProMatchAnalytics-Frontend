export type ActionCategory =
  | "OnBall"
  | "OffBall"
  | "Referee"
  | "Clock"
  | "Banner"
  | "System";

export interface ActionFieldCondition {
  field: string;
  operator:
    | "eq"
    | "neq"
    | "in"
    | "not_in"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "exists";
  value?: unknown | null;
}

export interface ActionField {
  key: string;
  label: string;
  data_type: "string" | "number" | "boolean" | "enum" | "object" | "array";
  required?: boolean;
  enum_values?: string[];
  min_value?: number | null;
  max_value?: number | null;
  conditions?: ActionFieldCondition[];
}

export interface ActionDefinition {
  action_id?: string | null;
  name: string;
  category: ActionCategory;
  requires_source?: boolean;
  requires_destination?: boolean;
  fields?: ActionField[];
  validation_rules?: Record<string, unknown>;
  logging_shape?: Record<string, unknown>;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  _id?: string;
}

export interface WorkflowCondition {
  source: "action" | "context" | "state";
  field: string;
  operator:
    | "eq"
    | "neq"
    | "in"
    | "not_in"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "exists";
  value?: unknown | null;
}

export interface WorkflowSideEffect {
  effect_type:
    | "clock_start"
    | "clock_stop"
    | "possession"
    | "score"
    | "banner"
    | "custom";
  payload: Record<string, unknown>;
}

export type WorkflowNodeType = "action" | "system" | "decision";
export type UiWorkflowNodeType = "start" | WorkflowNodeType | "end";

export interface WorkflowNode {
  node_id: string;
  node_type: WorkflowNodeType;
  label: string;
  action_definition_id?: string | null;
  side_effects?: WorkflowSideEffect[];
  max_visits?: number | null;
  required?: boolean;
  ui_meta?: Record<string, unknown>;
}

export interface WorkflowEdge {
  edge_id: string;
  source: string;
  target: string;
  conditions?: WorkflowCondition[];
  priority?: number;
  required?: boolean;
}

export interface WorkflowContextMatcher {
  action_id: string;
  outcomes?: string[];
  team_scope?: "home" | "away" | "neutral" | "any";
  roles?: string[];
  positions?: string[];
  zones?: Array<{ zone_type: string; payload: Record<string, unknown> }>;
  phases?: {
    allow_all: boolean;
    match_statuses: string[];
    periods: number[];
    clock_modes: string[];
  };
}

export interface WorkflowDefinition {
  workflow_id?: string | null;
  name: string;
  description?: string | null;
  is_active?: boolean;
  default_cycle_limit?: number;
  context_matcher: WorkflowContextMatcher;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  active_version?: number | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  _id?: string;
}

export interface WorkflowVersion {
  _id?: string;
  workflow_id: string;
  version: number;
  published_at: string;
  definition_snapshot: Record<string, unknown>;
  checksum: string;
  created_by?: string | null;
}

export interface PublishWorkflowResponse {
  workflow_id: string;
  version: number;
  published_at: string;
}

export interface WorkflowRuntimeContext {
  team_scope?: string | null;
  role?: string | null;
  player_position?: string | null;
  zone?: Record<string, unknown> | null;
  match_status?: string | null;
  period?: number | null;
  clock_mode?: string | null;
}

export interface WorkflowActionContext {
  action_id: string;
  outcome?: string | null;
  source?: Record<string, unknown> | null;
  destination?: Record<string, unknown> | null;
}

export interface WorkflowRuntimeRequest {
  match_id: string;
  context: WorkflowRuntimeContext;
  last_action?: WorkflowActionContext | null;
  workflow_id?: string | null;
  workflow_version?: number | null;
}

export interface WorkflowAllowedAction {
  action_id: string;
  required_fields: ActionField[];
  recommended: boolean;
  required: boolean;
}

export interface WorkflowRuntimeResult {
  workflow_id: string;
  workflow_version: number;
  allowed_actions: WorkflowAllowedAction[];
  required_actions: string[];
  side_effects: WorkflowSideEffect[];
  blocked: boolean;
  reasons: string[];
}

export interface WorkflowRuntimeResponse {
  match_id: string;
  results: WorkflowRuntimeResult[];
  blocked: boolean;
  reasons: string[];
}
