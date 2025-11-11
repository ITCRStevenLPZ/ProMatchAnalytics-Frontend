import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { apiClient } from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { ConflictReviewDialog } from '../components/ingestion/ConflictReviewDialog';
import Pagination from '../components/Pagination';

interface IngestionBatch {
  ingestion_id: string;
  target_model: string;
  status: string;
  batch_name: string;
  total_rows: number;
  inserted_count: number;
  duplicates_discarded_count: number;
  conflicts_open_count: number;
  conflicts_accepted_count: number;
  conflicts_rejected_count: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  expires_at?: string;
  error_log: Array<{ row_index?: number; error: string }>;
}

interface IngestionItem {
  item_id: string;
  ingestion_id: string;
  target_model: string;
  raw_payload: Record<string, any>;
  normalized_payload: Record<string, any>;
  content_hash: string;
  match_kind: 'unique' | 'exact_duplicate' | 'near_conflict';
  similarity_score?: number;
  matched_record_id?: string;
  status: string;
}

export default function IngestionPage() {
  const { t } = useTranslation('admin');
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<IngestionItem | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  // Fetch batch status
  const { data: batch, isLoading: batchLoading, error: batchError } = useQuery<IngestionBatch>({
    queryKey: ['ingestion-batch', batchId],
    queryFn: async () => {
      return await apiClient.get<IngestionBatch>(`/api/v1/ingestions/${batchId}`);
    },
    refetchInterval: (query) => {
      // Poll every 2 seconds if still processing
      const batchData = query.state.data;
      if (batchData && (batchData.status === 'in_progress' || batchData.status === 'queued')) {
        return 2000;
      }
      return false;
    },
  });

  // Fetch batch items
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['ingestion-items', batchId, page, statusFilter],
    queryFn: async () => {
      return await apiClient.get<{ items: IngestionItem[]; total: number; page: number; page_size: number }>(
        `/api/v1/ingestions/${batchId}/items`,
        {
          params: {
            page,
            page_size: 20,
            status_filter: statusFilter || undefined,
          },
        }
      );
    },
    enabled: !!batchId,
  });

  // Retry failed items mutation
  const retryMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.post(`/api/v1/ingestions/${batchId}/retry-failed`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingestion-batch', batchId] });
      queryClient.invalidateQueries({ queryKey: ['ingestion-items', batchId] });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'accepted':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
      case 'queued':
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'conflict_open':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case 'success':
      case 'accepted':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'failed':
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'in_progress':
      case 'queued':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'conflict_open':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const handleReviewConflict = (item: IngestionItem) => {
    setSelectedItem(item);
    setShowConflictDialog(true);
  };

  const handleConflictResolved = () => {
    setShowConflictDialog(false);
    setSelectedItem(null);
    queryClient.invalidateQueries({ queryKey: ['ingestion-batch', batchId] });
    queryClient.invalidateQueries({ queryKey: ['ingestion-items', batchId] });
  };

  if (batchLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (batchError || !batch) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            {t('ingestion.batchNotFound')}
          </p>
          <button
            onClick={() => navigate('/admin/ingestion')}
            className="mt-4 text-red-600 hover:text-red-800 underline"
          >
            {t('common.goBack')}
          </button>
        </div>
      </div>
    );
  }

  const progressPercentage = batch.total_rows > 0
    ? Math.round(((batch.inserted_count + batch.duplicates_discarded_count + batch.conflicts_open_count + batch.conflicts_accepted_count + batch.conflicts_rejected_count) / batch.total_rows) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/ingestion')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{batch.batch_name || t('ingestion.batchDetails')}</h1>
            <p className="text-sm text-gray-600">
              {t('ingestion.batchId')}: {batch.ingestion_id}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getStatusIcon(batch.status)}
          <span className={getStatusBadge(batch.status)}>
            {batch.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Progress Summary */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('ingestion.progress')}</h2>
          {(batch.status === 'failed' || batch.error_log.length > 0) && (
            <button
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
              <span>{t('ingestion.retryFailed')}</span>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t('ingestion.processed')}</span>
            <span>{progressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{batch.total_rows}</div>
            <div className="text-sm text-gray-600">{t('ingestion.total')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{batch.inserted_count}</div>
            <div className="text-sm text-gray-600">{t('ingestion.inserted')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{batch.duplicates_discarded_count}</div>
            <div className="text-sm text-gray-600">{t('ingestion.duplicatesSkipped')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{batch.conflicts_open_count}</div>
            <div className="text-sm text-gray-600">{t('ingestion.conflicts')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{batch.conflicts_accepted_count}</div>
            <div className="text-sm text-gray-600">{t('ingestion.accepted')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{batch.conflicts_rejected_count}</div>
            <div className="text-sm text-gray-600">{t('ingestion.rejected')}</div>
          </div>
        </div>
      </div>

      {/* Error Log */}
      {batch.error_log.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-800 mb-2">{t('ingestion.errors')}</h3>
          <div className="space-y-2">
            {batch.error_log.map((error, index) => (
              <div key={index} className="text-sm text-red-700">
                {error.row_index !== undefined && `Row ${error.row_index}: `}{error.error}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('ingestion.items')}</h2>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t('ingestion.allItems')}</option>
              <option value="pending">{t('ingestion.pending')}</option>
              <option value="conflict_open">{t('ingestion.conflicts')}</option>
              <option value="accepted">{t('ingestion.accepted')}</option>
              <option value="rejected">{t('ingestion.rejected')}</option>
              <option value="duplicate_discarded">{t('ingestion.duplicatesSkipped')}</option>
            </select>
          </div>
        </div>

        {itemsLoading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner />
          </div>
        ) : itemsData?.items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {t('ingestion.noItems')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.itemId')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.matchKind')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.similarity')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {itemsData?.items.map((item: IngestionItem) => (
                    <tr key={item.item_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.item_id.split('-').pop()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(item.status)}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.match_kind}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.similarity_score ? `${Math.round(item.similarity_score * 100)}%` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {item.status === 'conflict_open' && (
                          <button
                            onClick={() => handleReviewConflict(item)}
                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-800"
                          >
                            <Eye className="h-4 w-4" />
                            <span>{t('ingestion.review')}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {itemsData && itemsData.total > 20 && (
              <div className="p-4 border-t border-gray-200">
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(itemsData.total / 20)}
                  totalItems={itemsData.total}
                  pageSize={20}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Conflict Review Dialog */}
      {showConflictDialog && selectedItem && (
        <ConflictReviewDialog
          item={selectedItem}
          batchId={batchId!}
          onClose={() => setShowConflictDialog(false)}
          onResolved={handleConflictResolved}
        />
      )}
    </div>
  );
}
