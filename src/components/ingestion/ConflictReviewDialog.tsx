import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, Check, XCircle, Edit } from 'lucide-react';
import { apiClient } from '../../lib/api';
import LoadingSpinner from '../LoadingSpinner';

interface ConflictReviewDialogProps {
  item: {
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
  };
  batchId: string;
  onClose: () => void;
  onResolved: () => void;
}

export function ConflictReviewDialog({
  item,
  batchId,
  onClose,
  onResolved,
}: ConflictReviewDialogProps) {
  const { t } = useTranslation('admin');
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, any>>(item.normalized_payload);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: async (payload?: Record<string, any>) => {
      return await apiClient.post(
        `/api/v1/ingestions/${batchId}/items/${item.item_id}/accept`,
        { edited_data: payload }
      );
    },
    onSuccess: () => {
      onResolved();
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      return await apiClient.post(
        `/api/v1/ingestions/${batchId}/items/${item.item_id}/reject`,
        { reason }
      );
    },
    onSuccess: () => {
      onResolved();
    },
  });

  const handleAccept = () => {
    if (isEditing) {
      acceptMutation.mutate(editedData);
    } else {
      acceptMutation.mutate(undefined);
    }
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      return;
    }
    rejectMutation.mutate(rejectReason);
  };

  const handleEditField = (key: string, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const isPending = acceptMutation.isPending || rejectMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t('ingestion.reviewConflict')}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('ingestion.itemId')}: {item.item_id}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Match Info */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-yellow-800">{t('ingestion.conflictDetected')}</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  {t('ingestion.matchKind')}: <span className="font-medium">{item.match_kind}</span>
                </p>
                {item.similarity_score && (
                  <p className="text-sm text-yellow-700">
                    {t('ingestion.similarity')}: <span className="font-medium">{Math.round(item.similarity_score * 100)}%</span>
                  </p>
                )}
              </div>
              {item.matched_record_id && (
                <div className="text-right">
                  <p className="text-xs text-yellow-600">{t('ingestion.matchedRecord')}</p>
                  <p className="text-sm font-mono text-yellow-800">{item.matched_record_id}</p>
                </div>
              )}
            </div>
          </div>

          {/* Edit Toggle */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('ingestion.dataComparison')}</h3>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                isEditing
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Edit className="h-4 w-4" />
              <span>{isEditing ? t('ingestion.editing') : t('ingestion.enableEdit')}</span>
            </button>
          </div>

          {/* Data View/Edit */}
          {isEditing ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  {t('ingestion.editInstructions')}
                </p>
              </div>
              <div className="space-y-3">
                {Object.entries(editedData).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">
                      {key}
                    </label>
                    <input
                      type="text"
                      value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          handleEditField(key, parsed);
                        } catch {
                          handleEditField(key, e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Field Comparison</h3>
              <div className="space-y-3">
                {Object.entries(item.normalized_payload).map(([key, value]) => (
                  <div key={key} className="border rounded-md p-3 border-gray-200">
                    <div className="font-medium text-gray-700 mb-2">{key}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Incoming Value</div>
                        <div className="text-sm text-gray-900 bg-blue-50 p-2 rounded">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Existing Value</div>
                        <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                          {typeof item.raw_payload[key] === 'object' 
                            ? JSON.stringify(item.raw_payload[key], null, 2) 
                            : String(item.raw_payload[key] || '-')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reject Reason Input */}
          {showRejectInput && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('ingestion.rejectReason')}
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('ingestion.rejectReasonPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            
            {!showRejectInput ? (
              <>
                <button
                  onClick={() => setShowRejectInput(true)}
                  disabled={isPending}
                  className="flex items-center space-x-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  <span>{t('ingestion.reject')}</span>
                </button>
                
                <button
                  onClick={handleAccept}
                  disabled={isPending}
                  className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>{isEditing ? t('ingestion.acceptWithEdits') : t('ingestion.accept')}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setShowRejectInput(false);
                    setRejectReason('');
                  }}
                  disabled={isPending}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {t('common.back')}
                </button>
                
                <button
                  onClick={handleReject}
                  disabled={isPending || !rejectReason.trim()}
                  className="flex items-center space-x-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>{t('ingestion.confirmReject')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
