/**
 * Data Ingestion - Frontend Client (Phase 3 & 4)
 * Duplicate-aware batch ingestion with conflict resolution
 */
import { apiClient } from './api';

// ===== Legacy Types (Deprecated) =====
export interface ValidationError {
  row?: number;
  field?: string;
  message: string;
}

export interface IngestionResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: ValidationError[];
}

// ===== Phase 3 Types =====

export type BatchStatus = 'queued' | 'in_progress' | 'conflicts' | 'failed' | 'success';
export type ItemStatus = 'pending' | 'duplicate_discarded' | 'conflict_open' | 'accepted' | 'rejected';
export type MatchKind = 'exact_duplicate' | 'near_conflict' | 'unique';

export interface IngestionBatch {
  ingestion_id: string;
  target_model: string;
  status: BatchStatus;
  batch_name?: string;
  description?: string;
  source: string;
  created_by: string;
  total: number;
  inserted: number;
  duplicates_discarded: number;
  conflicts_open: number;
  accepted: number;
  rejected: number;
  error_log: Array<{
    message: string;
    row_ref?: string;
    error_code?: string;
    timestamp: string;
  }>;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  expires_at?: string;
  metadata?: Record<string, any>;
}

export interface IngestionItem {
  item_id: string;
  ingestion_id: string;
  target_model: string;
  raw_payload: Record<string, any>;
  normalized_payload: Record<string, any>;
  content_hash: string;
  match_kind: MatchKind;
  similarity_score?: number;
  matched_record_id?: string;
  status: ItemStatus;
  resolved_at?: string;
  resolved_by?: string;
  error_message?: string;
  created_at: string;
}

export interface ConflictRecord {
  conflict_id: string;
  ingestion_item_id: string;
  existing_record_id: string;
  target_model: string;
  similarity_score: number;
  fields_diff: Record<string, {
    field_path: string;
    existing_value: any;
    incoming_value: any;
    is_significant: boolean;
  }>;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  resolution_action?: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ModelConfig {
  model_key: string;
  display_name: string;
  enabled: boolean;
  threshold_similarity: number;
  hashing_fields: string[];
  normalization_rules: Record<string, any>;
  readonly_fields: string[];
}

// ===== Phase 3 API Functions =====

/**
 * List all ingestion batches with pagination
 */
export async function listBatches(params?: {
  target_model?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<{
  batches: Array<{
    ingestion_id: string;
    target_model: string;
    status: string;
    batch_name: string;
    total: number;
    inserted: number;
    duplicates_discarded: number;
    conflicts_open: number;
    accepted: number;
    rejected: number;
    created_at: string;
    finished_at?: string;
    expires_at?: string;
    created_by: string;
  }>;
  total: number;
  page: number;
  page_size: number;
}> {
  const queryParams = new URLSearchParams();
  if (params?.target_model) queryParams.append('target_model', params.target_model);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
  
  const query = queryParams.toString();
  return apiClient.get(`/ingestions${query ? `?${query}` : ''}`);
}

/**
 * Create a new ingestion batch
 */
export async function createBatch(params: {
  target_model: string;
  data: any[];
  batch_name?: string;
  description?: string;
  metadata?: Record<string, any>;
}): Promise<{
  ingestion_id: string;
  target_model: string;
  status: string;
  total_rows: number;
  message: string;
}> {
  return apiClient.post('/ingestions', params);
}

/**
 * Get batch status and counters
 */
export async function getBatchStatus(ingestionId: string): Promise<IngestionBatch> {
  return apiClient.get(`/ingestions/${ingestionId}`);
}

/**
 * Get batch items (paginated)
 */
export async function getBatchItems(
  ingestionId: string,
  params?: {
    status_filter?: ItemStatus;
    page?: number;
    page_size?: number;
  }
): Promise<{
  items: IngestionItem[];
  total: number;
  page: number;
  page_size: number;
}> {
  const queryParams = new URLSearchParams();
  if (params?.status_filter) queryParams.append('status_filter', params.status_filter);
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
  
  const query = queryParams.toString();
  return apiClient.get(`/ingestions/${ingestionId}/items${query ? `?${query}` : ''}`);
}

/**
 * Accept an ingestion item
 */
export async function acceptItem(
  ingestionId: string,
  itemId: string,
  params?: {
    edits?: Record<string, any>;
    notes?: string;
  }
): Promise<{
  item_id: string;
  status: string;
  message: string;
}> {
  return apiClient.post(`/ingestions/${ingestionId}/items/${itemId}/accept`, params || {});
}

/**
 * Reject an ingestion item
 */
export async function rejectItem(
  ingestionId: string,
  itemId: string,
  params: {
    reason: string;
    notes?: string;
  }
): Promise<{
  item_id: string;
  status: string;
  message: string;
}> {
  return apiClient.post(`/ingestions/${ingestionId}/items/${itemId}/reject`, params);
}

/**
 * Retry failed items in a batch
 */
export async function retryFailedItems(ingestionId: string): Promise<{
  ingestion_id: string;
  retried: number;
  total_failed: number;
  message: string;
}> {
  return apiClient.post(`/ingestions/${ingestionId}/retry-failed`);
}

/**
 * List conflicts (global or filtered)
 */
export async function listConflicts(params?: {
  target_model?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<{
  conflicts: ConflictRecord[];
  total: number;
  page: number;
  page_size: number;
}> {
  const queryParams = new URLSearchParams();
  if (params?.target_model) queryParams.append('target_model', params.target_model);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
  
  const query = queryParams.toString();
  return apiClient.get(`/ingestions/conflicts/list${query ? `?${query}` : ''}`);
}

/**
 * Get conflicts for a specific batch
 */
export async function getBatchConflicts(
  ingestionId: string,
  params?: {
    page?: number;
    page_size?: number;
  }
): Promise<{
  conflicts: ConflictRecord[];
  total: number;
  page: number;
  page_size: number;
}> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
  
  const query = queryParams.toString();
  return apiClient.get(`/ingestions/${ingestionId}/conflicts${query ? `?${query}` : ''}`);
}

// ===== Phase 4 API Functions (Admin Config) =====

/**
 * Get all model ingestion configs
 */
export async function getModelConfigs(): Promise<Record<string, ModelConfig>> {
  return apiClient.get('/admin/ingestion/configs');
}

/**
 * Update model ingestion config
 */
export async function updateModelConfig(
  modelKey: string,
  config: Partial<ModelConfig>
): Promise<ModelConfig> {
  return apiClient.put(`/admin/ingestion/configs/${modelKey}`, config);
}

// ===== Legacy Functions (Deprecated - kept for backward compatibility) =====

/**
 * Ingest competitions data via backend API
 */
export async function ingestCompetitions(data: any[]): Promise<IngestionResult> {
  try {
    const response: any = await apiClient.post('/ingestion/competitions', { data });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ message: error.response?.data?.detail || error.message }]
    };
  }
}

/**
 * Ingest venues data via backend API
 */
export async function ingestVenues(data: any[]): Promise<IngestionResult> {
  try {
    const response: any = await apiClient.post('/ingestion/venues', { data });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ message: error.response?.data?.detail || error.message }]
    };
  }
}

/**
 * Ingest referees data via backend API
 */
export async function ingestReferees(data: any[]): Promise<IngestionResult> {
  try {
    const response: any = await apiClient.post('/ingestion/referees', { data });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ message: error.response?.data?.detail || error.message }]
    };
  }
}

/**
 * Ingest players data via backend API
 */
export async function ingestPlayers(data: any[]): Promise<IngestionResult> {
  try {
    const response: any = await apiClient.post('/ingestion/players', { data });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ message: error.response?.data?.detail || error.message }]
    };
  }
}

/**
 * Ingest teams data via backend API
 */
export async function ingestTeams(data: any[]): Promise<IngestionResult> {
  try {
    const response: any = await apiClient.post('/ingestion/teams', { data });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ message: error.response?.data?.detail || error.message }]
    };
  }
}

/**
 * Ingest matches data via backend API
 */
export async function ingestMatches(data: any[]): Promise<IngestionResult> {
  try {
    const response: any = await apiClient.post('/ingestion/matches', { data });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ message: error.response?.data?.detail || error.message }]
    };
  }
}

// ===== New Batch Ingestion API (Phase 5) =====

export interface CreateBatchResponse {
  ingestion_id: string;
  target_model: string;
  status: string;
  total_rows: number;
  message: string;
}

/**
 * Create a new batch ingestion (Phase 5)
 * This replaces the individual model ingestion functions above
 */
export async function createBatchIngestion(
  targetModel: string,
  data: any[],
  batchName?: string,
  description?: string
): Promise<CreateBatchResponse> {
  const response = await apiClient.post<CreateBatchResponse>('/api/v1/ingestions', {
    target_model: targetModel,
    data,
    batch_name: batchName,
    description,
  });
  return response;
}

// ===== Bulk Ingestion API Functions =====

export interface CreateBulkResponse {
  bulk_id: string;
  batch_ids: Record<string, string>;
  total_rows: number;
  sections: Record<string, number>;
  message: string;
}

export interface BulkStatusResponse {
  bulk_id: string;
  status: string;
  created_by: string;
  created_at: string;
  total_rows: number;
  sections: Record<string, number>;
  batch_statuses: Record<string, {
    batch_id: string;
    status: string;
    total_rows: number;
    inserted: number;
    duplicates: number;
    conflicts_open: number;
    conflicts_accepted: number;
    conflicts_rejected: number;
  }>;
  metadata: Record<string, any>;
}

/**
 * Create bulk ingestion for all models at once
 */
export async function createBulkIngestion(
  format: 'csv' | 'json',
  content?: string,
  data?: Record<string, any>,
  metadata?: Record<string, any>
): Promise<CreateBulkResponse> {
  const response = await apiClient.post<CreateBulkResponse>('/api/v1/ingestions/bulk', {
    format,
    content,
    data,
    metadata,
  });
  return response;
}

/**
 * Get bulk ingestion status with all batch statuses
 */
export async function getBulkStatus(bulkId: string): Promise<BulkStatusResponse> {
  return apiClient.get(`/api/v1/ingestions/bulk/${bulkId}`);
}
