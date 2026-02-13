import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  X,
  Check,
  XCircle,
  Edit3,
  AlertTriangle,
  RefreshCw,
  FileText,
} from "lucide-react";
import type { ConflictRecord } from "../../lib/ingestion";
import { apiClient } from "../../lib/api";
import LoadingSpinner from "../LoadingSpinner";
import SimilarRecordsViewer from "../SimilarRecordsViewer";

interface ConflictReviewDialogProps {
  item: {
    item_id: string;
    ingestion_id: string;
    target_model: string;
    raw_payload: Record<string, any>;
    normalized_payload: Record<string, any>;
    content_hash: string;
    match_kind: "unique" | "exact_duplicate" | "near_conflict";
    similarity_score?: number;
    matched_record_id?: string;
    status: string;
    resolved_at?: string;
    resolved_by?: string;
    has_conflict?: boolean;
    conflict_id?: string | null;
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
  const { t } = useTranslation("admin");
  const [isEditing, setIsEditing] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, any>>({});
  const [decisionNotes, setDecisionNotes] = useState("");
  const [rejectReason, setRejectReason] = useState<
    "duplicate" | "bad_source" | "outdated" | "other"
  >("duplicate");
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectPanel, setShowRejectPanel] = useState(false);
  const [showExistingRecord, setShowExistingRecord] = useState(false);
  const [showSimilarViewer, setShowSimilarViewer] = useState(false);

  const {
    data: conflict,
    isLoading: conflictLoading,
    isError: conflictError,
    error: conflictErrorDetails,
    refetch: refetchConflict,
  } = useQuery<ConflictRecord>({
    queryKey: ["conflict-details", item.item_id],
    queryFn: () => apiClient.get(`ingestions/conflicts/${item.item_id}`),
    enabled: Boolean(item.item_id),
    retry: 1,
  });

  const acceptMutation = useMutation({
    mutationFn: async (payload: {
      edits?: Record<string, any>;
      notes?: string;
    }) => {
      return await apiClient.post(
        `ingestions/${batchId}/items/${item.item_id}/accept`,
        payload,
      );
    },
    onSuccess: () => {
      onResolved();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (payload: { reason: string; notes?: string }) => {
      return await apiClient.post(
        `ingestions/${batchId}/items/${item.item_id}/reject`,
        payload,
      );
    },
    onSuccess: () => {
      onResolved();
    },
  });

  const diffEntries = useMemo(() => {
    if (!conflict?.fields_diff) {
      return [];
    }
    return Object.values(conflict.fields_diff);
  }, [conflict]);

  const similarRecords = useMemo(() => {
    if (!conflict?.existing_record_snapshot) {
      return [];
    }
    return [
      {
        ...conflict.existing_record_snapshot,
        name:
          conflict.existing_record_snapshot.name || conflict.existing_record_id,
        similarity_score: conflict.similarity_score,
        match_score: conflict.similarity_score,
        match_details: [],
      },
    ];
  }, [conflict]);

  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    if (typeof value === "number") {
      return Number.isInteger(value) ? value.toString() : value.toFixed(2);
    }
    return String(value);
  };

  const stringifyEditableValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const coerceEditedValue = (raw: string): any => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed === "true" || trimmed === "false") {
      return trimmed === "true";
    }
    if (
      !Number.isNaN(Number(trimmed)) &&
      Number(trimmed).toString() === trimmed
    ) {
      return Number(trimmed);
    }
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const handleFieldChange = (field: string, rawValue: string) => {
    setEditedFields((prev) => ({
      ...prev,
      [field]: coerceEditedValue(rawValue),
    }));
  };

  const editedPayload = useMemo(() => {
    if (!isEditing || !Object.keys(editedFields).length) {
      return undefined;
    }
    return editedFields;
  }, [editedFields, isEditing]);

  const isConflictResolved = conflict?.resolved;
  const isConflictMissing =
    conflictError && (conflictErrorDetails as any)?.response?.status === 404;
  const decisionDisabled =
    conflictLoading || isConflictMissing || isConflictResolved;
  const isRejectFormValid =
    rejectReason !== "other" || rejectNotes.trim().length >= 15;

  const handleAccept = () => {
    if (decisionDisabled) {
      return;
    }
    acceptMutation.mutate({
      ...(editedPayload ? { edits: editedPayload } : {}),
      ...(decisionNotes.trim() ? { notes: decisionNotes.trim() } : {}),
    });
  };

  const handleReject = () => {
    if (!isRejectFormValid || decisionDisabled) {
      return;
    }
    rejectMutation.mutate({
      reason: rejectReason,
      ...(rejectNotes.trim() ? { notes: rejectNotes.trim() } : {}),
    });
  };

  const isPending = acceptMutation.isPending || rejectMutation.isPending;

  const renderContent = () => {
    if (conflictLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-600">
          <LoadingSpinner />
          <p className="mt-4 text-sm">{t("ingestion.conflict.loading")}</p>
        </div>
      );
    }

    if (isConflictMissing) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 mt-0.5" />
          <div>
            <p className="font-semibold">
              {t("ingestion.conflict.resolvedElsewhere")}
            </p>
            <p className="text-sm text-yellow-700">
              {t("ingestion.conflict.decisionDisabled")}
            </p>
          </div>
        </div>
      );
    }

    if (conflictError) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 mt-0.5" />
          <div>
            <p className="font-semibold">{t("ingestion.conflict.loadError")}</p>
            <button
              onClick={() => refetchConflict()}
              className="mt-2 inline-flex items-center text-sm font-medium text-red-700 hover:text-red-900"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {t("ingestion.conflict.retry")}
            </button>
          </div>
        </div>
      );
    }

    if (!conflict) {
      return null;
    }

    return (
      <div className="space-y-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-yellow-900">
                {t("ingestion.conflict.summaryTitle")}
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                {t("ingestion.conflict.matchConfidence")}:{" "}
                <span className="font-medium">
                  {Math.round((conflict.similarity_score || 0) * 100)}%
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-yellow-700">
                {t("ingestion.conflict.matchedRecordId")}
              </p>
              <p className="font-mono text-sm text-yellow-900">
                {conflict.existing_record_id}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">
              {t("ingestion.conflict.fieldDifferences")}
            </h4>
            <button
              onClick={() => setIsEditing((prev) => !prev)}
              data-testid="conflict-edit-toggle"
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                isEditing
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Edit3 className="h-4 w-4" />
              <span>
                {isEditing ? t("ingestion.editing") : t("ingestion.enableEdit")}
              </span>
            </button>
          </div>
          {isEditing && (
            <p className="text-xs text-gray-600 mt-2">
              {t("ingestion.conflict.editInstructions")}
            </p>
          )}

          {diffEntries.length === 0 && (
            <p className="mt-4 text-sm text-gray-600">
              {t("ingestion.conflict.noDifferences")}
            </p>
          )}

          <div className="mt-4 space-y-4">
            {diffEntries.map((diff) => {
              const currentIncoming = diff.incoming_value;
              const editedValue = editedFields[diff.field_path];
              const displayIncoming = editedValue ?? currentIncoming;
              return (
                <div
                  key={diff.field_path}
                  className="border border-gray-200 rounded-lg p-4"
                  data-testid="conflict-diff-entry"
                  data-field-path={diff.field_path}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {diff.field_path}
                      </p>
                      {diff.is_significant && (
                        <p className="text-xs text-red-600 uppercase tracking-wide">
                          {t("ingestion.conflict.fieldMarkedSignificant")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">
                        {t("ingestion.conflict.incomingValue")}
                      </p>
                      <div className="p-3 rounded bg-blue-50 text-gray-900 whitespace-pre-wrap break-words">
                        {formatValue(displayIncoming)}
                      </div>
                      {isEditing && (
                        <textarea
                          className="mt-2 w-full rounded border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
                          rows={3}
                          value={stringifyEditableValue(displayIncoming)}
                          onChange={(event) =>
                            handleFieldChange(
                              diff.field_path,
                              event.target.value,
                            )
                          }
                          data-testid="conflict-edit-field-input"
                          data-field-path={diff.field_path}
                        />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">
                        {t("ingestion.conflict.existingValue")}
                      </p>
                      <div className="p-3 rounded bg-gray-50 text-gray-900 whitespace-pre-wrap break-words">
                        {formatValue(diff.existing_value)}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">
                        {t("ingestion.conflict.editedValue")}
                      </p>
                      <div className="p-3 rounded bg-white border border-dashed border-gray-300 text-gray-900 whitespace-pre-wrap break-words">
                        {isEditing
                          ? formatValue(editedValue ?? "")
                          : formatValue(displayIncoming)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {conflict.existing_record_snapshot && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <button
              onClick={() => setShowExistingRecord((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              data-testid="conflict-existing-record-toggle"
            >
              <span className="font-semibold text-gray-800 flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>{t("ingestion.conflict.viewExistingRecord")}</span>
              </span>
              <span className="text-sm text-blue-600">
                {showExistingRecord
                  ? t("ingestion.conflict.closeExistingRecord")
                  : t("ingestion.conflict.viewExistingRecord")}
              </span>
            </button>
            {showExistingRecord && (
              <pre
                className="p-4 overflow-x-auto bg-gray-50 text-xs text-gray-800"
                data-testid="conflict-existing-record"
              >
                {formatValue(conflict.existing_record_snapshot)}
              </pre>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("ingestion.conflict.notesLabel")}
          </label>
          <textarea
            className="w-full rounded border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-blue-500"
            rows={3}
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            placeholder={t("ingestion.conflict.notesPlaceholder")}
            data-testid="conflict-notes-input"
          />
        </div>

        {showRejectPanel && (
          <div
            className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3"
            data-testid="conflict-reject-panel"
          >
            <div>
              <label className="block text-sm font-semibold text-red-800">
                {t("ingestion.conflict.rejectTitle")}
              </label>
              <p className="text-xs text-red-700">
                {t("ingestion.conflict.rejectHelper")}
              </p>
            </div>
            <select
              value={rejectReason}
              onChange={(event) =>
                setRejectReason(event.target.value as typeof rejectReason)
              }
              className="w-full rounded border border-red-300 bg-white p-2 text-sm focus:ring-2 focus:ring-red-500"
              data-testid="conflict-reject-reason"
            >
              <option value="duplicate">
                {t("ingestion.conflict.rejectReasons.duplicate")}
              </option>
              <option value="bad_source">
                {t("ingestion.conflict.rejectReasons.bad_source")}
              </option>
              <option value="outdated">
                {t("ingestion.conflict.rejectReasons.outdated")}
              </option>
              <option value="other">
                {t("ingestion.conflict.rejectReasons.other")}
              </option>
            </select>
            <textarea
              className="w-full rounded border border-red-300 p-2 text-sm focus:ring-2 focus:ring-red-500"
              rows={4}
              value={rejectNotes}
              onChange={(event) => setRejectNotes(event.target.value)}
              placeholder={t("ingestion.conflict.rejectNotesHelper")}
              data-testid="conflict-reject-notes"
            />
            {!isRejectFormValid && (
              <p className="text-xs text-red-700">
                {t("ingestion.conflict.rejectNotesHelper")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        data-testid="conflict-review-dialog"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {t("ingestion.reviewConflict")}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {t("ingestion.itemId")}: {item.item_id}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {item.resolved_by || item.resolved_at
                ? `${t("ingestion.resolvedBy", "Resolved by")} ${
                    item.resolved_by ??
                    t("ingestion.unknownOperator", "Unknown operator")
                  }${
                    item.resolved_at
                      ? ` • ${new Date(item.resolved_at).toLocaleString()}`
                      : ""
                  }`
                : t("ingestion.notResolvedYet", "Not resolved yet")}
            </p>
          </div>
          {similarRecords.length > 0 && (
            <button
              onClick={() => setShowSimilarViewer(true)}
              className="mr-2 inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              data-testid="conflict-similar-records-button"
            >
              {t("ingestion.conflict.showSimilar")}
            </button>
          )}
          <button
            onClick={onClose}
            disabled={isPending}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">{renderContent()}</div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isPending}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              data-testid="conflict-cancel-button"
            >
              {t("common.cancel")}
            </button>

            {!showRejectPanel ? (
              <>
                <button
                  onClick={() => setShowRejectPanel(true)}
                  disabled={isPending}
                  className="flex items-center space-x-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  data-testid="conflict-reject-button"
                >
                  <XCircle className="h-4 w-4" />
                  <span>{t("ingestion.reject")}</span>
                </button>

                <button
                  onClick={handleAccept}
                  disabled={isPending || decisionDisabled}
                  className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  data-testid="conflict-accept-button"
                >
                  {isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>
                    {editedPayload
                      ? t("ingestion.acceptWithEdits")
                      : t("ingestion.accept")}
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setShowRejectPanel(false);
                    setRejectNotes("");
                  }}
                  disabled={isPending}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  data-testid="conflict-back-button"
                >
                  {t("common.back")}
                </button>

                <button
                  onClick={handleReject}
                  disabled={isPending || !isRejectFormValid || decisionDisabled}
                  className="flex items-center space-x-2 px-6 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50"
                  data-testid="conflict-confirm-reject-button"
                >
                  {isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span>{t("ingestion.confirmReject")}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showSimilarViewer && similarRecords.length > 0 && (
        <SimilarRecordsViewer
          records={similarRecords}
          currentData={item.normalized_payload}
          entityType={item.target_model.replace(/s$/, "")}
          onClose={() => setShowSimilarViewer(false)}
          onOpenRecord={() => setShowSimilarViewer(false)}
        />
      )}
    </div>
  );
}
