import { useState } from "react";
import { useModelConfigs, useUpdateModelConfig } from "../hooks/useIngestion";
import { ModelConfig } from "../lib/ingestion";

interface ConfigRowProps {
  config: ModelConfig;
  onUpdate: (modelKey: string, update: Partial<ModelConfig>) => void;
  updating: boolean;
}

function ConfigRow({ config, onUpdate, updating }: ConfigRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [threshold, setThreshold] = useState(config.threshold_similarity);
  const [enabled, setEnabled] = useState(config.enabled);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set(config.hashing_fields),
  );

  const handleSave = () => {
    onUpdate(config.model_key, {
      enabled,
      threshold_similarity: threshold,
      hashing_fields: Array.from(selectedFields),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setThreshold(config.threshold_similarity);
    setEnabled(config.enabled);
    setSelectedFields(new Set(config.hashing_fields));
    setIsEditing(false);
  };

  const toggleField = (field: string) => {
    const newFields = new Set(selectedFields);
    if (newFields.has(field)) {
      newFields.delete(field);
    } else {
      newFields.add(field);
    }
    setSelectedFields(newFields);
  };

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-4 py-3 font-medium">{config.display_name}</td>
      <td className="px-4 py-3">
        {isEditing ? (
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="ml-2">{enabled ? "Enabled" : "Disabled"}</span>
          </label>
        ) : (
          <span
            className={`px-2 py-1 rounded text-sm ${
              config.enabled
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {config.enabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="flex items-center space-x-3">
            <input
              type="range"
              min="50"
              max="99"
              value={threshold * 100}
              onChange={(e) => setThreshold(parseInt(e.target.value) / 100)}
              className="flex-1"
            />
            <span className="text-sm font-medium w-12">
              {(threshold * 100).toFixed(0)}%
            </span>
          </div>
        ) : (
          <span>{(config.threshold_similarity * 100).toFixed(0)}%</span>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="space-y-1">
            {/* Show all available fields from normalization_rules */}
            {Object.keys(config.normalization_rules).map((field) => (
              <label key={field} className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedFields.has(field)}
                  onChange={() => toggleField(field)}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span className="ml-2 text-sm">{field}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {config.hashing_fields.map((field) => (
              <span
                key={field}
                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
              >
                {field}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {config.readonly_fields.map((field) => (
            <span
              key={field}
              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
            >
              {field}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              disabled={updating}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              disabled={updating}
              className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

export default function AdminModelConfig() {
  const { data: configs, isLoading, error } = useModelConfigs();
  const updateMutation = useUpdateModelConfig();

  const handleUpdate = (modelKey: string, update: Partial<ModelConfig>) => {
    updateMutation.mutate({
      modelKey,
      update: {
        enabled: update.enabled,
        threshold_similarity: update.threshold_similarity,
        hashing_fields: update.hashing_fields,
        normalization_rules: update.normalization_rules,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading configurations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">
          Error loading configurations:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  const configArray = configs ? Object.values(configs) : [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Ingestion Model Configuration
        </h1>
        <p className="text-gray-600 mt-2">
          Configure duplicate detection settings for each model type. Changes
          are applied in-memory.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Model
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Similarity Threshold
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hashing Fields
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Readonly Fields
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {configArray.map((config) => (
              <ConfigRow
                key={config.model_key}
                config={config}
                onUpdate={handleUpdate}
                updating={updateMutation.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>

      {updateMutation.isError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">
            Error updating configuration:{" "}
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : "Unknown error"}
          </p>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
        <h2 className="text-sm font-semibold text-blue-900 mb-2">
          Configuration Notes
        </h2>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Similarity Threshold:</strong> Records with similarity
            scores above this threshold are flagged as conflicts (50-99%)
          </li>
          <li>
            <strong>Hashing Fields:</strong> Fields used to compute content hash
            for exact duplicate detection
          </li>
          <li>
            <strong>Readonly Fields:</strong> Fields that cannot be edited
            during conflict resolution
          </li>
          <li>
            <strong>In-Memory Updates:</strong> Changes persist only for the
            current server session. For permanent changes, edit{" "}
            <code>app/config/ingestion_config.py</code>
          </li>
        </ul>
      </div>
    </div>
  );
}
