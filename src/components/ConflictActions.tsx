import { useState } from "react";
import { ConflictRecord, ModelConfig } from "../lib/ingestion";
import { useAcceptItem, useRejectItem } from "../hooks/useIngestion";

interface ConflictActionsProps {
  conflict: ConflictRecord;
  ingestionId: string;
  modelConfig?: ModelConfig;
  onSuccess?: () => void;
}

export default function ConflictActions({
  conflict,
  ingestionId,
  modelConfig,
  onSuccess,
}: ConflictActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [discardReason, setDiscardReason] = useState("");

  const acceptMutation = useAcceptItem();
  const rejectMutation = useRejectItem();

  const readonlyFields = new Set(modelConfig?.readonly_fields || []);

  const handleAccept = () => {
    acceptMutation.mutate(
      {
        ingestionId,
        itemId: conflict.ingestion_item_id,
        edits: isEditing && Object.keys(edits).length > 0 ? edits : undefined,
        notes: isEditing ? "Accepted with edits" : "Accepted incoming data",
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setEdits({});
          onSuccess?.();
        },
      },
    );
  };

  const handleDiscard = () => {
    if (!discardReason.trim()) {
      alert("Please provide a reason for discarding this item");
      return;
    }

    rejectMutation.mutate(
      {
        ingestionId,
        itemId: conflict.ingestion_item_id,
        reason: discardReason,
        notes: "Discarded via conflict resolution UI",
      },
      {
        onSuccess: () => {
          setShowDiscardConfirm(false);
          setDiscardReason("");
          onSuccess?.();
        },
      },
    );
  };

  const handleEditField = (fieldPath: string, value: any) => {
    setEdits({ ...edits, [fieldPath]: value });
  };

  const isLoading = acceptMutation.isPending || rejectMutation.isPending;

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>

      {/* Accept Button */}
      <div className="space-y-3 mb-4">
        <button
          onClick={handleAccept}
          disabled={isLoading || isEditing}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {acceptMutation.isPending ? "Accepting..." : "Accept Incoming Data"}
        </button>

        {/* Edit + Accept Toggle */}
        <button
          onClick={() => setIsEditing(!isEditing)}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isEditing ? "Cancel Edit" : "Edit + Accept"}
        </button>

        {/* Discard Button */}
        {!showDiscardConfirm ? (
          <button
            onClick={() => setShowDiscardConfirm(true)}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            Discard
          </button>
        ) : (
          <div className="border border-red-300 rounded-md p-3 bg-red-50">
            <p className="text-sm font-medium text-red-900 mb-2">
              Confirm Discard
            </p>
            <textarea
              value={discardReason}
              onChange={(e) => setDiscardReason(e.target.value)}
              placeholder="Reason for discarding..."
              className="w-full px-3 py-2 border rounded-md mb-2"
              rows={2}
            />
            <div className="flex space-x-2">
              <button
                onClick={handleDiscard}
                disabled={isLoading || !discardReason.trim()}
                className="flex-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? "Discarding..." : "Confirm"}
              </button>
              <button
                onClick={() => {
                  setShowDiscardConfirm(false);
                  setDiscardReason("");
                }}
                disabled={isLoading}
                className="flex-1 px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Form */}
      {isEditing && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Edit Fields
          </h4>
          <div className="space-y-3">
            {Object.entries(conflict.fields_diff).map(([fieldPath, diff]) => {
              const isReadonly = readonlyFields.has(diff.field_path);
              const currentValue = edits[fieldPath] ?? diff.incoming_value;

              return (
                <div key={fieldPath}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {diff.field_path}
                    {isReadonly && (
                      <span className="ml-2 text-xs text-gray-500">
                        (read-only)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={formatEditValue(currentValue)}
                    onChange={(e) => handleEditField(fieldPath, e.target.value)}
                    disabled={isReadonly}
                    className={`w-full px-3 py-2 border rounded-md ${
                      isReadonly
                        ? "bg-gray-100 cursor-not-allowed"
                        : "bg-white focus:ring-2 focus:ring-blue-500"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {acceptMutation.isPending ? "Accepting..." : "Accept with Edits"}
          </button>
        </div>
      )}

      {/* Error Messages */}
      {acceptMutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          Error accepting:{" "}
          {acceptMutation.error instanceof Error
            ? acceptMutation.error.message
            : "Unknown error"}
        </div>
      )}
      {rejectMutation.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          Error discarding:{" "}
          {rejectMutation.error instanceof Error
            ? rejectMutation.error.message
            : "Unknown error"}
        </div>
      )}
    </div>
  );
}

function formatEditValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
