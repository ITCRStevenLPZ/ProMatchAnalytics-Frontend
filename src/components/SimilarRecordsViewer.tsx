import { ExternalLink, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SimilarRecord {
  name: string;
  match_score: number;
  match_details: string[];
  similarity_score: number;
  [key: string]: any;
}

interface SimilarRecordsViewerProps {
  records: SimilarRecord[];
  currentData: any;
  entityType: string;
  onClose: () => void;
  onOpenRecord: (record: SimilarRecord) => void;
}

export default function SimilarRecordsViewer({
  records,
  currentData,
  entityType,
  onClose,
  onOpenRecord,
}: SimilarRecordsViewerProps) {
  const { t } = useTranslation("admin");

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "object") return JSON.stringify(value, null, 2);

    // Handle ISO date strings - show just the date part
    const valueStr = String(value);
    if (valueStr.includes("T") && valueStr.length >= 10) {
      return valueStr.substring(0, 10);
    }

    return valueStr;
  };

  const getDisplayFields = (): string[] => {
    const fieldMap: Record<string, string[]> = {
      player: [
        "name",
        "birth_date",
        "country_name",
        "position",
        "player_height",
        "player_weight",
      ],
      team: ["name", "short_name", "country_name", "gender"],
      venue: ["name", "city", "country_name", "capacity", "surface"],
      referee: ["name", "country_name", "years_of_experience"],
      competition: ["name", "short_name", "country_name", "gender"],
    };
    return fieldMap[entityType] || ["name"];
  };

  const getFieldValue = (data: any, field: string): any => {
    // Try to get the value with the field name, or try backend field name
    if (field === "country_name") {
      return data.country_name || data.country || data.nationality;
    }
    if (field === "player_height") {
      return data.player_height || data.height;
    }
    if (field === "player_weight") {
      return data.player_weight || data.weight;
    }
    return data[field];
  };

  const getFieldLabel = (field: string): string => {
    const labelMap: Record<string, string> = {
      name: t("name"),
      birth_date: t("birthDate"),
      player_height: t("height"),
      player_weight: t("weight"),
      position: t("position"),
      short_name: t("shortName"),
      country_name: t("country"),
      gender: t("gender"),
      city: t("city"),
      country: t("country"),
      capacity: t("capacity"),
      surface: t("surface"),
      years_of_experience: t("yearsOfExperience"),
    };
    return labelMap[field] || field;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold">{t("similarRecords.title")}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-gray-600 mb-4">
            {t("similarRecords.description", { count: records.length })}
          </p>

          <div className="space-y-4">
            {records.map((record, index) => (
              <div
                key={index}
                className="border border-yellow-300 rounded-lg overflow-hidden"
              >
                <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {record.name}
                      </h3>
                      <div className="text-xs text-gray-600 mt-1">
                        {record.match_details &&
                          record.match_details.join(" • ")}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {t("duplicateWarning.similarity")}
                        </div>
                        <div className="text-sm font-semibold text-yellow-700">
                          {Math.round((record.similarity_score || 0) * 100)}%
                        </div>
                      </div>
                      <button
                        onClick={() => onOpenRecord(record)}
                        className="btn btn-sm btn-secondary flex items-center"
                        title={t("similarRecords.openInNewWindow")}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        {t("similarRecords.open")}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                        {t("similarRecords.yourData")}
                      </h4>
                      <div className="space-y-2">
                        {getDisplayFields().map((field) => {
                          const currentValue = getFieldValue(
                            currentData,
                            field,
                          );
                          return (
                            <div key={field} className="text-sm">
                              <span className="text-gray-600">
                                {getFieldLabel(field)}:
                              </span>
                              <span className="ml-2 font-medium text-gray-900">
                                {formatFieldValue(currentValue)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                        {t("similarRecords.existingData")}
                      </h4>
                      <div className="space-y-2">
                        {getDisplayFields().map((field) => {
                          const currentValue = getFieldValue(
                            currentData,
                            field,
                          );
                          const recordValue = getFieldValue(record, field);
                          const isDifferent =
                            formatFieldValue(currentValue) !==
                            formatFieldValue(recordValue);
                          return (
                            <div key={field} className="text-sm">
                              <span className="text-gray-600">
                                {getFieldLabel(field)}:
                              </span>
                              <span
                                className={`ml-2 font-medium ${
                                  isDifferent
                                    ? "text-orange-600"
                                    : "text-gray-900"
                                }`}
                              >
                                {formatFieldValue(recordValue)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end space-x-2 p-6 border-t">
          <button onClick={onClose} className="btn btn-secondary">
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
