import { useBatchStatus } from '../hooks/useIngestion';

interface BatchProgressProps {
  batchId: string;
}

export default function BatchProgress({ batchId }: BatchProgressProps) {
  const { data: batch, isLoading, error } = useBatchStatus(batchId);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-red-600">
          Error loading batch: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  if (!batch) {
    return null;
  }

  const total = batch.total;
  const processed = batch.inserted + batch.duplicates_discarded + batch.accepted + batch.rejected;
  const progress = total > 0 ? (processed / total) * 100 : 0;

  const isProcessing = ['processing', 'pending'].includes(batch.status);

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {batch.batch_name || `Batch ${batch.ingestion_id.slice(0, 8)}`}
            </h2>
            {batch.description && (
              <p className="text-sm text-gray-600 mt-1">{batch.description}</p>
            )}
          </div>
          <div>
            <StatusBadge status={batch.status} />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium text-gray-900">{progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isProcessing ? 'bg-blue-600' : 'bg-green-600'
            }`}
            style={{ width: `${progress}%` }}
          >
            {isProcessing && (
              <div className="h-full w-full animate-pulse bg-blue-400 opacity-50"></div>
            )}
          </div>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {processed} of {total} rows processed
        </div>
      </div>

      {/* Counters Grid */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        <CounterCard
          label="Inserted"
          value={batch.inserted}
          color="green"
          icon="✓"
        />
        <CounterCard
          label="Duplicates Discarded"
          value={batch.duplicates_discarded}
          color="gray"
          icon="="
        />
        <CounterCard
          label="Conflicts Open"
          value={batch.conflicts_open}
          color="yellow"
          icon="⚠"
        />
        <CounterCard
          label="Accepted"
          value={batch.accepted}
          color="blue"
          icon="✔"
        />
        <CounterCard
          label="Rejected"
          value={batch.rejected}
          color="red"
          icon="✗"
        />
        <CounterCard
          label="Failed"
          value={batch.error_log.length}
          color="red"
          icon="!"
        />
      </div>

      {/* Metadata */}
      <div className="px-6 py-4 border-t bg-gray-50 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-600">Model:</span>{' '}
            <span className="font-medium text-gray-900">{batch.target_model}</span>
          </div>
          <div>
            <span className="text-gray-600">Batch ID:</span>{' '}
            <span className="font-mono text-xs text-gray-700">{batch.ingestion_id}</span>
          </div>
          <div>
            <span className="text-gray-600">Created:</span>{' '}
            <span className="text-gray-900">{new Date(batch.created_at).toLocaleString()}</span>
          </div>
          {batch.finished_at && (
            <div>
              <span className="text-gray-600">Finished:</span>{' '}
              <span className="text-gray-900">{new Date(batch.finished_at).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Log */}
      {batch.error_log && batch.error_log.length > 0 && (
        <div className="px-6 py-4 border-t">
          <h3 className="text-sm font-semibold text-red-900 mb-2">Errors</h3>
          <div className="bg-red-50 border border-red-200 rounded-md p-3 max-h-48 overflow-y-auto">
            <ul className="space-y-2 text-sm text-red-800">
              {batch.error_log.slice(0, 10).map((error, idx) => (
                <li key={idx} className="flex items-start">
                  <span className="text-red-600 mr-2">•</span>
                  <div>
                    <div>{error.message}</div>
                    {error.row_ref && (
                      <div className="text-xs text-red-600">Row: {error.row_ref}</div>
                    )}
                  </div>
                </li>
              ))}
              {batch.error_log.length > 10 && (
                <li className="text-red-600 italic">
                  ... and {batch.error_log.length - 10} more errors
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || colors.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface CounterCardProps {
  label: string;
  value: number;
  color: 'green' | 'gray' | 'yellow' | 'blue' | 'red';
  icon: string;
}

function CounterCard({ label, value, color, icon }: CounterCardProps) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-900',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  };

  return (
    <div className={`border rounded-lg p-3 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
