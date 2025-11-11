import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createBatch,
  getBatchStatus,
  getBatchItems,
  acceptItem,
  rejectItem,
  retryFailedItems,
  listConflicts,
  getBatchConflicts,
  getModelConfigs,
  updateModelConfig,
  ItemStatus,
} from '../lib/ingestion';

/**
 * Hook to fetch a batch by ID
 */
export function useBatchStatus(batchId: string, enabled = true) {
  return useQuery({
    queryKey: ['ingestion', 'batch', batchId],
    queryFn: () => getBatchStatus(batchId),
    enabled,
    refetchInterval: (query) => {
      // Poll every 3 seconds if batch is still processing
      const data = query.state.data;
      if (data && (data.status === 'in_progress' || data.status === 'queued')) {
        return 3000;
      }
      return false;
    },
  });
}

/**
 * Hook to fetch items for a batch with pagination
 */
export function useBatchItems(
  batchId: string,
  params?: {
    status_filter?: ItemStatus;
    page?: number;
    page_size?: number;
  },
  enabled = true
) {
  return useQuery({
    queryKey: ['ingestion', 'batch', batchId, 'items', params],
    queryFn: () => getBatchItems(batchId, params),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to fetch all conflicts across batches
 */
export function useConflicts(
  params?: {
    target_model?: string;
    status?: string;
    page?: number;
    page_size?: number;
  },
  enabled = true
) {
  return useQuery({
    queryKey: ['ingestion', 'conflicts', params],
    queryFn: () => listConflicts(params),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to fetch conflicts for a specific batch
 */
export function useBatchConflicts(batchId: string, enabled = true) {
  return useQuery({
    queryKey: ['ingestion', 'batch', batchId, 'conflicts'],
    queryFn: () => getBatchConflicts(batchId),
    enabled,
  });
}

/**
 * Hook to fetch all model ingestion configs
 */
export function useModelConfigs(enabled = true) {
  return useQuery({
    queryKey: ['ingestion', 'configs'],
    queryFn: getModelConfigs,
    enabled,
  });
}

/**
 * Hook to accept an ingestion item (resolve conflict or confirm insertion)
 */
export function useAcceptItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ingestionId,
      itemId,
      edits,
      notes,
    }: {
      ingestionId: string;
      itemId: string;
      edits?: Record<string, any>;
      notes?: string;
    }) => acceptItem(ingestionId, itemId, { edits, notes }),
    onSuccess: (_data, variables) => {
      // Invalidate batch queries to refresh counters and status
      queryClient.invalidateQueries({ queryKey: ['ingestion', 'batch', variables.ingestionId] });
      queryClient.invalidateQueries({ queryKey: ['ingestion', 'conflicts'] });
    },
  });
}

/**
 * Hook to reject/discard an ingestion item
 */
export function useRejectItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ingestionId,
      itemId,
      reason,
      notes,
    }: {
      ingestionId: string;
      itemId: string;
      reason: string;
      notes?: string;
    }) => rejectItem(ingestionId, itemId, { reason, notes }),
    onSuccess: (_data, variables) => {
      // Invalidate batch queries to refresh counters
      queryClient.invalidateQueries({ queryKey: ['ingestion', 'batch', variables.ingestionId] });
      queryClient.invalidateQueries({ queryKey: ['ingestion', 'conflicts'] });
    },
  });
}

/**
 * Hook to retry failed items in a batch
 */
export function useRetryFailedItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ingestionId: string) => retryFailedItems(ingestionId),
    onSuccess: (_data, variables) => {
      // Invalidate batch to show updated status
      queryClient.invalidateQueries({ queryKey: ['ingestion', 'batch', variables] });
    },
  });
}

/**
 * Hook to create a new ingestion batch
 */
export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      target_model: string;
      data: any[];
      batch_name?: string;
      description?: string;
      metadata?: Record<string, any>;
    }) => createBatch(params),
    onSuccess: () => {
      // Invalidate queries to show new batch
      queryClient.invalidateQueries({ queryKey: ['ingestion'] });
    },
  });
}

/**
 * Hook to update a model's ingestion config
 */
export function useUpdateModelConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      modelKey,
      update,
    }: {
      modelKey: string;
      update: {
        enabled?: boolean;
        threshold_similarity?: number;
        hashing_fields?: string[];
        normalization_rules?: Record<string, any>;
      };
    }) => updateModelConfig(modelKey, update),
    onSuccess: () => {
      // Refresh config list
      queryClient.invalidateQueries({ queryKey: ['ingestion', 'configs'] });
    },
  });
}
