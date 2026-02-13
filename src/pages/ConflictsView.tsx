import { useState } from "react";
import { useConflicts, useModelConfigs } from "../hooks/useIngestion";
import ConflictDiffViewer from "../components/ConflictDiffViewer";
import ConflictActions from "../components/ConflictActions";
import { ConflictRecord } from "../lib/ingestion";

export default function ConflictsView() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedConflict, setSelectedConflict] =
    useState<ConflictRecord | null>(null);

  const { data: configs } = useModelConfigs();
  const {
    data: conflictsData,
    isLoading,
    error,
    refetch,
  } = useConflicts({
    target_model: selectedModel || undefined,
    status: "open",
    page,
    page_size: pageSize,
  });

  const conflicts = conflictsData?.conflicts || [];
  const total = conflictsData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const modelOptions = configs
    ? Object.values(configs).map((c) => c.model_key)
    : [];

  const handleConflictSelect = (conflict: ConflictRecord) => {
    setSelectedConflict(conflict);
  };

  const handleActionSuccess = () => {
    // Refresh the list and close the detail view
    refetch();
    setSelectedConflict(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Conflict Resolution
        </h1>
        <p className="text-gray-600 mt-2">
          Review and resolve ingestion conflicts where incoming data matches
          existing records
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Models</option>
              {modelOptions.map((modelKey) => (
                <option key={modelKey} value={modelKey}>
                  {modelKey}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Showing {conflicts.length} of {total} open conflicts
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conflicts List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Conflicts</h2>
          </div>

          {isLoading && (
            <div className="p-8 text-center text-gray-600">
              Loading conflicts...
            </div>
          )}

          {error && (
            <div className="p-8 text-center text-red-600">
              Error loading conflicts:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </div>
          )}

          {!isLoading && !error && conflicts.length === 0 && (
            <div className="p-8 text-center text-gray-600">
              No open conflicts found. Great job! 🎉
            </div>
          )}

          {!isLoading && !error && conflicts.length > 0 && (
            <div className="divide-y">
              {conflicts.map((conflict) => (
                <div
                  key={conflict.conflict_id}
                  onClick={() => handleConflictSelect(conflict)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedConflict?.conflict_id === conflict.conflict_id
                      ? "bg-blue-50 border-l-4 border-blue-600"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      {conflict.target_model}
                    </span>
                    <span className="text-sm text-gray-500">
                      {(conflict.similarity_score * 100).toFixed(1)}% match
                    </span>
                  </div>

                  <div className="text-xs text-gray-500 mb-2">
                    ID: {conflict.conflict_id.slice(0, 16)}...
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">
                      {Object.keys(conflict.fields_diff).length} fields differ
                    </span>
                    <span className="text-gray-500">
                      {new Date(conflict.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t flex items-center justify-between">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Conflict Detail */}
        <div className="space-y-4">
          {selectedConflict ? (
            <>
              <ConflictDiffViewer conflict={selectedConflict} />
              <ConflictActions
                conflict={selectedConflict}
                ingestionId={selectedConflict.ingestion_item_id.split("_")[0]} // Extract batch ID from item ID
                modelConfig={
                  configs ? configs[selectedConflict.target_model] : undefined
                }
                onSuccess={handleActionSuccess}
              />
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
              Select a conflict from the list to view details and take action
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
