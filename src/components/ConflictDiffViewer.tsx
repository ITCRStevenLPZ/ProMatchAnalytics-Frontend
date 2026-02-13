import { ConflictRecord } from "../lib/ingestion";

interface ConflictDiffViewerProps {
  conflict: ConflictRecord;
}

export default function ConflictDiffViewer({
  conflict,
}: ConflictDiffViewerProps) {
  const fields = conflict.fields_diff;
  const fieldPaths = Object.keys(fields);

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Field Comparison
          </h3>
          <p className="text-sm text-gray-600">
            Similarity Score:{" "}
            <span className="font-medium text-blue-600">
              {(conflict.similarity_score * 100).toFixed(1)}%
            </span>
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {fieldPaths.filter((fp) => fields[fp].is_significant).length}{" "}
          significant differences
        </div>
      </div>

      <div className="space-y-3">
        {fieldPaths.map((fieldPath) => {
          const diff = fields[fieldPath];
          const isSignificant = diff.is_significant;

          return (
            <div
              key={fieldPath}
              className={`border rounded-md p-3 ${
                isSignificant
                  ? "border-yellow-300 bg-yellow-50"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center mb-2">
                <span className="font-medium text-gray-700">
                  {diff.field_path}
                </span>
                {isSignificant && (
                  <span className="ml-2 px-2 py-0.5 bg-yellow-200 text-yellow-800 text-xs rounded">
                    Significant
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Existing Value */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Existing (DB)
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded p-2">
                    <code className="text-sm text-red-900">
                      {formatValue(diff.existing_value)}
                    </code>
                  </div>
                </div>

                {/* Incoming Value */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Incoming (CSV)
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded p-2">
                    <code className="text-sm text-green-900">
                      {formatValue(diff.incoming_value)}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "<empty>";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}
