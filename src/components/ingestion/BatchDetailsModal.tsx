import { X, Info, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IngestionBatchSummary } from "../../lib/ingestion";

interface BatchDetailsModalProps {
  batch: IngestionBatchSummary | null;
  onClose: () => void;
  onOpenBatch: (ingestionId: string) => void;
}

export function BatchDetailsModal({
  batch,
  onClose,
  onOpenBatch,
}: BatchDetailsModalProps) {
  const { t } = useTranslation("admin");

  if (!batch) {
    return null;
  }

  const stats = [
    { label: t("ingestion.totalRows", "Total Rows"), value: batch.total },
    { label: t("ingestion.inserted", "Inserted"), value: batch.inserted },
    {
      label: t("ingestion.duplicatesSkipped", "Duplicates"),
      value: batch.duplicates_discarded,
    },
    { label: t("ingestion.conflicts"), value: batch.conflicts_open },
    { label: t("ingestion.accepted"), value: batch.accepted },
    { label: t("ingestion.rejected"), value: batch.rejected },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">
              {t("ingestion.batchDetails", "Batch details")}
            </p>
            <h2 className="text-xl font-bold text-gray-900">
              {batch.batch_name}
            </h2>
            <p className="text-sm text-gray-500 font-mono">
              {batch.ingestion_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
            aria-label={t("common.close", "Close")}
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center gap-3">
            <Info className="text-blue-600" size={24} />
            <div>
              <p className="text-sm font-semibold text-blue-900">
                {t("ingestion.targetModel")} ·{" "}
                <span className="capitalize">{batch.target_model}</span>
              </p>
              <p className="text-xs text-blue-800">
                {t("ingestion.createdBy", "Created by")} {batch.created_by} ·{" "}
                {new Date(batch.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-lg font-semibold text-gray-900">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-gray-900 mb-1">
                {t("ingestion.status")}
              </p>
              <p className="capitalize">{batch.status.replace("_", " ")}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">
                {t("ingestion.expiresAt")}
              </p>
              {batch.expires_at ? (
                <p>
                  {new Date(batch.expires_at).toLocaleString()} ·{" "}
                  {t("ingestion.daysRemaining", {
                    count: Math.max(
                      0,
                      Math.ceil(
                        (new Date(batch.expires_at).getTime() - Date.now()) /
                          (1000 * 60 * 60 * 24),
                      ),
                    ),
                  })}
                </p>
              ) : (
                <p className="text-gray-400">
                  {t("ingestion.noExpiration", "No expiration")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            {t("common.close", "Close")}
          </button>
          <button
            onClick={() => {
              onOpenBatch(batch.ingestion_id);
            }}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t("ingestion.viewDetails")}
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
