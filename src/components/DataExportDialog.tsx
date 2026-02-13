import { useState } from "react";
import { X, Download, CheckCircle, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  exportCompetitions,
  exportVenues,
  exportReferees,
  exportPlayers,
  exportTeams,
  exportMatches,
} from "../lib/export";

interface DataExportDialogProps {
  modelType:
    | "competitions"
    | "venues"
    | "referees"
    | "players"
    | "teams"
    | "matches";
  isOpen: boolean;
  onClose: () => void;
}

interface ExportResult {
  success: boolean;
  count: number;
  filename: string;
  error?: string;
}

export function DataExportDialog({
  modelType,
  isOpen,
  onClose,
}: DataExportDialogProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setResult(null);

    try {
      let exportResult: { count: number; filename: string };
      const exportOptions = { format };

      switch (modelType) {
        case "competitions":
          exportResult = await exportCompetitions(exportOptions);
          break;
        case "venues":
          exportResult = await exportVenues(exportOptions);
          break;
        case "referees":
          exportResult = await exportReferees(exportOptions);
          break;
        case "players":
          exportResult = await exportPlayers(exportOptions);
          break;
        case "teams":
          exportResult = await exportTeams(exportOptions);
          break;
        case "matches":
          exportResult = await exportMatches(exportOptions);
          break;
        default:
          throw new Error(`Unknown model type: ${modelType}`);
      }

      setResult({
        success: true,
        count: exportResult.count,
        filename: exportResult.filename,
      });

      // Auto-close after success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error: any) {
      setResult({
        success: false,
        count: 0,
        filename: "",
        error: error.message || "Export failed",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setFormat("csv");
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {t("ingestion.exportTitle", { model: t(`ingestion.${modelType}`) })}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isExporting}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t("ingestion.exportFormat")}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="csv"
                  checked={format === "csv"}
                  onChange={(e) => setFormat(e.target.value as "csv" | "json")}
                  disabled={isExporting}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">CSV</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="json"
                  checked={format === "json"}
                  onChange={(e) => setFormat(e.target.value as "csv" | "json")}
                  disabled={isExporting}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">JSON</span>
              </label>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              {t("ingestion.exportInfo", {
                model: t(`ingestion.${modelType}`).toLowerCase(),
                format: format.toUpperCase(),
              })}
            </p>
          </div>

          {/* Result */}
          {result && (
            <div
              className={`border rounded-lg p-4 ${
                result.success
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle
                    className="text-green-600 flex-shrink-0 mt-0.5"
                    size={20}
                  />
                ) : (
                  <AlertCircle
                    className="text-red-600 flex-shrink-0 mt-0.5"
                    size={20}
                  />
                )}
                <div className="flex-1">
                  <h3
                    className={`text-sm font-semibold mb-1 ${
                      result.success ? "text-green-900" : "text-red-900"
                    }`}
                  >
                    {result.success
                      ? t("ingestion.exportSuccess")
                      : t("ingestion.exportFailed")}
                  </h3>
                  {result.success ? (
                    <>
                      <p className="text-sm text-green-800">
                        {t("ingestion.exported", { count: result.count })}
                      </p>
                      <p className="text-xs text-green-700 mt-1 font-mono">
                        {result.filename}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-red-800">{result.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
            disabled={isExporting}
          >
            {result ? t("ingestion.close") : t("ingestion.cancel")}
          </button>
          {!result && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  {t("ingestion.exporting")}
                </>
              ) : (
                <>
                  <Download size={18} />
                  {t("ingestion.exportData")}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
