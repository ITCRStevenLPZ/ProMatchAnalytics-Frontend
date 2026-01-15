import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Plus, Edit, Trash2, Search, X } from "lucide-react";
import { apiClient } from "../lib/api";
import type { Referee, PaginatedResponse } from "../types";
import Pagination from "../components/Pagination";
import {
  normalizeReferees,
  buildRefereePayload,
  type RefereeApiResponse,
} from "../lib/referees";
import { getCountriesSorted } from "../lib/countries";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useLoading } from "../hooks/useLoading";
import DuplicateWarning from "../components/DuplicateWarning";
import ChangeConfirmation from "../components/ChangeConfirmation";
import SimilarRecordsViewer from "../components/SimilarRecordsViewer";
import { useAuthStore } from "../store/authStore";
import LoadingSpinner from "../components/LoadingSpinner";
import AutocompleteSearch from "../components/AutocompleteSearch";
import { useFormValidation } from "../hooks/useFormValidation";
import { refereeSchema } from "../lib/validationSchemas";
import {
  applyBackendValidationErrors,
  resolveKnownFieldError,
} from "../lib/backendErrorUtils";

export default function RefereesManager() {
  const { t, i18n } = useTranslation("admin");
  const user = useAuthStore((state) => state.user);
  const [referees, setReferees] = useState<Referee[]>([]);
  const { loading, withLoading } = useLoading(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Referee | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [showSimilarRecords, setShowSimilarRecords] = useState(false);
  const [similarRecords, setSimilarRecords] = useState<any[] | null>(null);
  const [originalFormData, setOriginalFormData] =
    useState<Partial<Referee> | null>(null);
  const currentLang = i18n.language as "en" | "es";
  const { checkDuplicates, duplicates, clearDuplicates } = useDuplicateCheck();
  const { detectChanges, changeResult, duplicateResult, clearChangeResult } =
    useChangeDetection();

  // Form validation
  const {
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    getFieldError,
    setFieldError,
  } = useFormValidation<Partial<Referee>>(refereeSchema, t);

  const [formData, setFormData] = useState<Partial<Referee>>({
    referee_id: "",
    name: "",
    country_name: "",
    years_of_experience: undefined,
  });

  const formatDeleteGuardError = (detail: unknown): string | null => {
    if (typeof detail !== "string") return null;
    const match = detail.match(
      /Cannot delete referee with (\d+) linked match(?:es)?/i,
    );
    if (!match) return null;
    const count = Number(match[1]);
    return t("deleteGuards.refereeMatches", { count });
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchReferees();
  }, [currentPage, pageSize, searchTerm]);

  const fetchReferees = async () => {
    await withLoading(async () => {
      try {
        setError(null);
        const params: any = {
          page: currentPage,
          page_size: pageSize,
        };

        if (searchTerm) {
          params.search = searchTerm;
        }

        const response = await apiClient.get<
          PaginatedResponse<RefereeApiResponse>
        >("/referees/", { params });
        setReferees(normalizeReferees(response.items));
        setTotalItems(response.total);
        setTotalPages(response.total_pages);
      } catch (err: any) {
        setError(err.response?.data?.detail || t("errorFetchingData"));
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form before submission
    if (!validateForm(formData)) {
      setError(t("validation.fixErrors"));
      return;
    }

    const backendPayload = buildRefereePayload(formData);

    // EDIT MODE: Always show changes for confirmation
    if (editingItem && editingItem.referee_id) {
      // If we haven't shown the change warning yet, detect changes with duplicate check
      if (!showChangeWarning) {
        clearChangeResult();
        clearDuplicates();

        const result = await detectChanges(
          "referees",
          editingItem.referee_id,
          backendPayload,
          true,
        );

        if (result && result.changes.length > 0) {
          setShowChangeWarning(true);
          return;
        } else if (result && result.changes.length === 0) {
          setError(t("validation.noChangesDetected"));
          return;
        }
      }

      // After change confirmation, check if duplicates were already detected
      if (showChangeWarning && changeResult) {
        if (
          duplicateResult &&
          duplicateResult.has_duplicates &&
          !showSimilarRecords
        ) {
          setShowChangeWarning(false);
          setSimilarRecords(duplicateResult.duplicates ?? []);
          setShowSimilarRecords(true);
          return;
        }
      }
    }

    // CREATE MODE: Check for duplicates
    if (!editingItem) {
      const result = await checkDuplicates("referees", backendPayload);

      const exactDuplicate = result.duplicates?.find(
        (d) => d.similarity_score === 1.0 || d.match_score === 100,
      );

      if (exactDuplicate) {
        setError(t("validation.exactDuplicateExists"));
        return;
      }

      if (result.has_duplicates && !showDuplicateWarning) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    await saveReferee(backendPayload);
  };

  const saveReferee = async (payloadOverrides?: Record<string, unknown>) => {
    try {
      const payload = payloadOverrides ?? buildRefereePayload(formData);

      if (editingItem) {
        await apiClient.put(`/referees/${editingItem.referee_id}`, payload);
      } else {
        await apiClient.post("/referees/", payload);
      }
      await fetchReferees();
      handleCloseForm();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const handled = applyBackendValidationErrors(detail, {
        setFieldError,
        clearErrors,
        translate: t,
      });
      if (handled) {
        setError(t("validation.fixErrors"));
        return;
      }
      const knownFieldError = resolveKnownFieldError(detail);
      if (knownFieldError) {
        setFieldError(knownFieldError.field, t(knownFieldError.translationKey));
        setError(t("validation.fixErrors"));
        return;
      }
      if (typeof detail === "string") {
        setError(detail);
      } else {
        setError(t("errorSavingData"));
      }
    }
  };

  const handleContinueWithDuplicates = async () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
    await saveReferee();
  };

  const handleCancelDuplicates = () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
  };

  const handleConfirmChanges = async () => {
    setShowChangeWarning(false);
    await handleSubmit(new Event("submit") as any);
  };

  const handleCancelChanges = () => {
    setShowChangeWarning(false);
    clearChangeResult();
    setError(null);
    if (originalFormData) {
      setFormData(originalFormData);
    }
  };

  const handleCloseSimilarRecords = () => {
    setShowSimilarRecords(false);
    setSimilarRecords(null);
    clearChangeResult();
  };

  const handleOpenSimilarRecord = (record: any) => {
    setShowSimilarRecords(false);
    setSimilarRecords(null);
    clearChangeResult();
    handleEdit(record);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await apiClient.delete(`/referees/${id}`);
      await fetchReferees();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const guardMessage = formatDeleteGuardError(detail);
      if (guardMessage) {
        setError(guardMessage);
        return;
      }
      setError(typeof detail === "string" ? detail : t("errorDeletingData"));
    }
  };

  const handleEdit = (item: Referee) => {
    setEditingItem(item);
    setFormData(item);
    setOriginalFormData(item);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setShowDuplicateWarning(false);
    setShowChangeWarning(false);
    setShowSimilarRecords(false);
    setOriginalFormData(null);
    clearDuplicates();
    clearChangeResult();
    clearErrors();
    setError(null);
    setFormData({
      referee_id: "",
      name: "",
      country_name: "",
      years_of_experience: undefined,
    });
  };

  // Fetch referee suggestions for autocomplete
  const fetchRefereeSuggestions = async (
    query: string,
  ): Promise<RefereeApiResponse[]> => {
    try {
      const response = await apiClient.get<RefereeApiResponse[]>(
        "/referees/search/suggestions",
        {
          params: { q: query },
        },
      );
      return response;
    } catch (error) {
      console.error("Error fetching referee suggestions:", error);
      return [];
    }
  };

  // Handle selecting an existing referee from autocomplete
  const handleSelectExistingReferee = (refereeData: RefereeApiResponse) => {
    const normalizedReferee = normalizeReferees([refereeData])[0];
    setEditingItem(normalizedReferee);
    setFormData(normalizedReferee);
  };

  // Backend handles filtering via search param

  if (loading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Flag className="h-8 w-8 text-yellow-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t("referees")}</h1>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>{t("createReferee")}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      <div className="card">
        {referees.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm ? t("noData") : t("noReferees")}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("name")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("country")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("yearsOfExperience")}
                    </th>
                    {user?.role === "admin" && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        {t("actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {referees.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.country_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.years_of_experience || "-"}
                      </td>
                      {user?.role === "admin" && (
                        <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t("edit")}
                          >
                            <Edit className="h-5 w-5 inline" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.referee_id)}
                            className="text-red-600 hover:text-red-900"
                            title={t("delete")}
                          >
                            <Trash2 className="h-5 w-5 inline" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newPageSize) => {
                setPageSize(newPageSize);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">
                {editingItem ? t("edit") : t("createReferee")}
              </h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <form
              id="referee-form"
              onSubmit={handleSubmit}
              className="p-6 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto"
            >
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              {showChangeWarning &&
                changeResult &&
                changeResult.changes.length > 0 && (
                  <ChangeConfirmation
                    changePercentage={changeResult.change_percentage}
                    changes={changeResult.changes}
                    onConfirm={handleConfirmChanges}
                    onCancel={handleCancelChanges}
                  />
                )}
              {showDuplicateWarning &&
                duplicates &&
                duplicates.has_duplicates && (
                  <DuplicateWarning
                    duplicates={duplicates.duplicates}
                    onContinue={handleContinueWithDuplicates}
                    onCancel={handleCancelDuplicates}
                    entityType="referee"
                    onViewSimilarRecords={
                      duplicates.duplicates.length > 0
                        ? () => {
                            setSimilarRecords(duplicates.duplicates);
                            setShowSimilarRecords(true);
                          }
                        : undefined
                    }
                  />
                )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("refereeId")}
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.referee_id || ""}
                  className={`input w-full bg-gray-100 cursor-not-allowed ${
                    getFieldError("referee_id") ? "border-red-500" : ""
                  }`}
                  placeholder={t("refereeIdHelper")}
                  title={t("refereeIdHelper")}
                />
                <p className="mt-1 text-sm text-gray-500">
                  {t("refereeIdHelper")}
                </p>
                {getFieldError("referee_id") && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError("referee_id")}
                  </p>
                )}
              </div>
              <div>
                <AutocompleteSearch<RefereeApiResponse>
                  name="name"
                  value={formData.name || ""}
                  onChange={(value) => {
                    setFormData({ ...formData, name: value });
                    validateAndSetFieldError("name", value);
                  }}
                  onSelectSuggestion={handleSelectExistingReferee}
                  fetchSuggestions={fetchRefereeSuggestions}
                  getDisplayText={(referee) => referee.name}
                  getSecondaryText={(referee) =>
                    `${referee.country_name || "N/A"} • ${
                      referee.years_of_experience || 0
                    } years exp.`
                  }
                  placeholder={t("refereeNamePlaceholder")}
                  label={t("name")}
                  required
                  minChars={3}
                />
                {getFieldError("name") && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError("name")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("country")} *
                </label>
                <select
                  required
                  value={formData.country_name || ""}
                  onChange={(e) => {
                    setFormData({ ...formData, country_name: e.target.value });
                    validateAndSetFieldError("country_name", e.target.value);
                  }}
                  onBlur={(e) =>
                    validateAndSetFieldError("country_name", e.target.value)
                  }
                  className={`input w-full ${
                    getFieldError("country_name") ? "border-red-500" : ""
                  }`}
                >
                  <option value="">{t("selectCountry")}</option>
                  {getCountriesSorted(currentLang).map((country) => (
                    <option key={country.en} value={country.en}>
                      {country[currentLang]}
                    </option>
                  ))}
                </select>
                {getFieldError("country_name") && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError("country_name")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("yearsOfExperience")}
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.years_of_experience || ""}
                  onChange={(e) => {
                    const value = e.target.value
                      ? parseInt(e.target.value)
                      : undefined;
                    setFormData({ ...formData, years_of_experience: value });
                    validateAndSetFieldError("years_of_experience", value);
                  }}
                  onBlur={(e) =>
                    validateAndSetFieldError(
                      "years_of_experience",
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  className={`input w-full ${
                    getFieldError("years_of_experience") ? "border-red-500" : ""
                  }`}
                />
                {getFieldError("years_of_experience") && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError("years_of_experience")}
                  </p>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-4 sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="btn btn-secondary"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={showChangeWarning || showSimilarRecords}
                >
                  {t("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Similar Records Viewer Modal */}
      {showSimilarRecords && similarRecords && similarRecords.length > 0 && (
        <SimilarRecordsViewer
          records={similarRecords}
          currentData={formData}
          entityType="referee"
          onClose={handleCloseSimilarRecords}
          onOpenRecord={handleOpenSimilarRecord}
        />
      )}
    </div>
  );
}
