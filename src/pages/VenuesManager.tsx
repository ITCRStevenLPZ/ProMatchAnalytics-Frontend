import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Plus, Edit, Trash2, Search, X } from "lucide-react";
import { apiClient } from "../lib/api";
import type { Venue, PaginatedResponse } from "../types";
import Pagination from "../components/Pagination";
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
import { venueSchema } from "../lib/validationSchemas";
import {
  buildVenuePayload,
  normalizeVenues,
  VENUE_SURFACES,
  type VenueApiResponse,
} from "../lib/venues";
import {
  applyBackendValidationErrors,
  resolveKnownFieldError,
} from "../lib/backendErrorUtils";

const ADMIN_LOCALES = ["en", "es"] as const;
type AdminLocale = (typeof ADMIN_LOCALES)[number];

const withVenueFormDefaults = (data?: Partial<Venue>): Partial<Venue> => {
  const merged = { ...(data ?? {}) };
  const localizedNames: Record<string, string> = {
    ...(merged.i18n_names ?? {}),
  };

  ADMIN_LOCALES.forEach((locale) => {
    localizedNames[locale] = localizedNames[locale] ?? "";
  });

  return {
    ...merged,
    venue_id: merged.venue_id ?? "",
    name: merged.name ?? "",
    city: merged.city ?? "",
    country_name: merged.country_name ?? "",
    capacity: merged.capacity ?? undefined,
    surface: merged.surface ?? undefined,
    i18n_names: localizedNames,
  };
};

export default function VenuesManager() {
  const { t, i18n } = useTranslation("admin");
  const user = useAuthStore((state) => state.user);
  const [venues, setVenues] = useState<Venue[]>([]);
  const { loading, withLoading } = useLoading(true);
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Venue | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [showSimilarRecords, setShowSimilarRecords] = useState(false);
  const [similarRecords, setSimilarRecords] = useState<any[] | null>(null);
  const [originalFormData, setOriginalFormData] =
    useState<Partial<Venue> | null>(null);
  const currentLang = i18n.language as "en" | "es";
  const { checkDuplicates, duplicates, clearDuplicates } = useDuplicateCheck();
  const { detectChanges, changeResult, duplicateResult, clearChangeResult } =
    useChangeDetection();
  const {
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    getFieldError,
    setFieldError,
  } = useFormValidation<Partial<Venue>>(venueSchema, t);

  const formatDeleteGuardError = (detail: unknown): string | null => {
    if (typeof detail !== "string") return null;
    const match = detail.match(/Cannot delete venue with (\d+) match(?:es)?/i);
    if (!match) return null;
    const count = Number(match[1]);
    return t("deleteGuards.venueMatches", { count });
  };

  const [formData, setFormData] = useState<Partial<Venue>>(() =>
    withVenueFormDefaults(),
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchVenues();
  }, [currentPage, pageSize, searchTerm]);

  const fetchVenues = async () => {
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
          PaginatedResponse<VenueApiResponse>
        >("/venues/", { params });
        setVenues(normalizeVenues(response.items));
        setTotalItems(response.total);
        setTotalPages(response.total_pages);
      } catch (err: any) {
        setError(err.response?.data?.detail || t("errorFetchingData"));
      } finally {
        setHasInitialLoadCompleted(true);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm(formData)) {
      setError(t("validation.fixErrors"));
      return;
    }

    const backendPayload = buildVenuePayload(formData);

    // EDIT MODE: Always show changes for confirmation
    if (editingItem && editingItem.venue_id) {
      if (!showChangeWarning) {
        clearChangeResult();
        clearDuplicates();

        const result = await detectChanges(
          "venues",
          editingItem.venue_id,
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
      const result = await checkDuplicates("venues", backendPayload);

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

    await saveVenue(backendPayload);
  };

  const saveVenue = async (payload: Record<string, unknown>) => {
    try {
      if (editingItem) {
        await apiClient.put(`/venues/${editingItem.venue_id}`, payload);
      } else {
        await apiClient.post("/venues/", payload);
      }
      await fetchVenues();
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
    await saveVenue(buildVenuePayload(formData));
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

  const handleLocalizedNameChange = (locale: AdminLocale, value: string) => {
    setFormData((prev) => ({
      ...prev,
      i18n_names: {
        ...(prev.i18n_names ?? {}),
        [locale]: value,
      },
    }));
    validateAndSetFieldError(`i18n_names.${locale}`, value);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await apiClient.delete(`/venues/${id}`);
      await fetchVenues();
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

  const handleEdit = (item: Venue) => {
    const formValue = withVenueFormDefaults(item);
    setEditingItem(item);
    setFormData(formValue);
    setOriginalFormData(formValue);
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
    setFormData(withVenueFormDefaults());
  };

  // Fetch venue suggestions for autocomplete
  const fetchVenueSuggestions = async (query: string): Promise<Venue[]> => {
    try {
      const response = await apiClient.get<VenueApiResponse[]>(
        "/venues/search/suggestions",
        {
          params: { q: query },
        },
      );
      return normalizeVenues(response);
    } catch (error) {
      console.error("Error fetching venue suggestions:", error);
      return [];
    }
  };

  // Handle selecting an existing venue from autocomplete
  const handleSelectExistingVenue = (venueData: Venue) => {
    const formValue = withVenueFormDefaults(venueData);
    setEditingItem(venueData);
    setFormData(formValue);
    setOriginalFormData(formValue);
  };

  // Backend handles filtering via search param

  if (loading && !hasInitialLoadCompleted) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <MapPin className="h-8 w-8 text-green-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t("venues")}</h1>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>{t("createVenue")}</span>
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
        {venues.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm ? t("noData") : t("noVenues")}
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
                      {t("localizedNames")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("city")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("country")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("capacity")}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {t("surface")}
                    </th>
                    {user?.role === "admin" && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        {t("actions")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {venues.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="space-y-1">
                          {ADMIN_LOCALES.map((locale) => (
                            <div
                              key={locale}
                              className="flex items-center text-xs"
                            >
                              <span className="font-semibold uppercase text-gray-500 mr-2">
                                {locale}
                              </span>
                              <span>{item.i18n_names?.[locale] || "-"}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.city}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.country_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.capacity?.toLocaleString() || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {item.surface || "-"}
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
                            onClick={() => handleDelete(item.venue_id)}
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
                {editingItem ? t("edit") : t("createVenue")}
              </h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <form
              id="venue-form"
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
                    entityType="venue"
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
                  {t("venueId")}
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={formData.venue_id || ""}
                  onChange={(e) => {
                    setFormData({ ...formData, venue_id: e.target.value });
                    validateAndSetFieldError("venue_id", e.target.value);
                  }}
                  onBlur={(e) =>
                    validateAndSetFieldError("venue_id", e.target.value)
                  }
                  className={`input w-full ${
                    getFieldError("venue_id") ? "border-red-500" : ""
                  }`}
                  placeholder="venue_nyc_001"
                />
                <p className="mt-1 text-sm text-gray-500">
                  {t("venueIdHelper")}
                </p>
                {getFieldError("venue_id") && (
                  <p className="mt-1 text-sm text-red-600">
                    {getFieldError("venue_id")}
                  </p>
                )}
              </div>
              <div>
                <AutocompleteSearch<Venue>
                  name="name"
                  value={formData.name || ""}
                  onChange={(value) => {
                    setFormData({ ...formData, name: value });
                    validateAndSetFieldError("name", value);
                  }}
                  onSelectSuggestion={handleSelectExistingVenue}
                  fetchSuggestions={fetchVenueSuggestions}
                  getDisplayText={(venue) => venue.name}
                  getSecondaryText={(venue) => {
                    const capacityLabel = t("capacity", {
                      defaultValue: "Capacity",
                    });
                    const capacityValue = venue.capacity
                      ? venue.capacity.toLocaleString()
                      : "N/A";
                    return `${venue.city}, ${venue.country_name} • ${capacityLabel}: ${capacityValue}`;
                  }}
                  placeholder={t("venueNamePlaceholder")}
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
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {t("localizedNames")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("localizedNamesDescription")}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ADMIN_LOCALES.map((locale) => {
                    const fieldKey = `i18n_names.${locale}`;
                    return (
                      <div key={locale}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {locale === "en"
                            ? t("localizedNameEn")
                            : t("localizedNameEs")}
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={formData.i18n_names?.[locale] ?? ""}
                          onChange={(e) =>
                            handleLocalizedNameChange(locale, e.target.value)
                          }
                          onBlur={(e) =>
                            validateAndSetFieldError(fieldKey, e.target.value)
                          }
                          className={`input w-full ${
                            getFieldError(fieldKey) ? "border-red-500" : ""
                          }`}
                        />
                        {getFieldError(fieldKey) && (
                          <p className="mt-1 text-sm text-red-600">
                            {getFieldError(fieldKey)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("city")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => {
                      setFormData({ ...formData, city: e.target.value });
                      validateAndSetFieldError("city", e.target.value);
                    }}
                    onBlur={(e) =>
                      validateAndSetFieldError("city", e.target.value)
                    }
                    className={`input w-full ${
                      getFieldError("city") ? "border-red-500" : ""
                    }`}
                  />
                  {getFieldError("city") && (
                    <p className="mt-1 text-sm text-red-600">
                      {getFieldError("city")}
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
                      setFormData({
                        ...formData,
                        country_name: e.target.value,
                      });
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("capacity")}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.capacity || ""}
                    onChange={(e) => {
                      const value = e.target.value
                        ? parseInt(e.target.value)
                        : undefined;
                      setFormData({ ...formData, capacity: value });
                      validateAndSetFieldError("capacity", value);
                    }}
                    onBlur={(e) =>
                      validateAndSetFieldError(
                        "capacity",
                        e.target.value ? parseInt(e.target.value) : undefined,
                      )
                    }
                    className={`input w-full ${
                      getFieldError("capacity") ? "border-red-500" : ""
                    }`}
                  />
                  {getFieldError("capacity") && (
                    <p className="mt-1 text-sm text-red-600">
                      {getFieldError("capacity")}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("surface")}
                  </label>
                  <select
                    value={formData.surface || ""}
                    onChange={(e) => {
                      const value = e.target.value || undefined;
                      setFormData({
                        ...formData,
                        surface: value as Venue["surface"],
                      });
                      validateAndSetFieldError("surface", value);
                    }}
                    onBlur={(e) =>
                      validateAndSetFieldError(
                        "surface",
                        e.target.value || undefined,
                      )
                    }
                    className={`input w-full ${
                      getFieldError("surface") ? "border-red-500" : ""
                    }`}
                  >
                    <option value="">
                      {t("selectSurface", { defaultValue: "Select surface" })}
                    </option>
                    {VENUE_SURFACES.map((surfaceOption) => (
                      <option key={surfaceOption} value={surfaceOption}>
                        {t(`surfaceOptions.${surfaceOption}`, {
                          defaultValue: surfaceOption,
                        })}
                      </option>
                    ))}
                  </select>
                  {getFieldError("surface") && (
                    <p className="mt-1 text-sm text-red-600">
                      {getFieldError("surface")}
                    </p>
                  )}
                </div>
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
          entityType="venue"
          onClose={handleCloseSimilarRecords}
          onOpenRecord={handleOpenSimilarRecord}
        />
      )}
    </div>
  );
}
