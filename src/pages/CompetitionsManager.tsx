import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Plus, Edit, Trash2, Search, X } from 'lucide-react';
import { apiClient } from '../lib/api';
import type { Competition, PaginatedResponse } from '../types';
import Pagination from '../components/Pagination';
import { getCountriesSorted } from '../lib/countries';
import { useDuplicateCheck } from '../hooks/useDuplicateCheck';
import { useChangeDetection } from '../hooks/useChangeDetection';
import { useLoading } from '../hooks/useLoading';
import DuplicateWarning from '../components/DuplicateWarning';
import ChangeConfirmation from '../components/ChangeConfirmation';
import SimilarRecordsViewer from '../components/SimilarRecordsViewer';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/LoadingSpinner';
import AutocompleteSearch from '../components/AutocompleteSearch';
import { useFormValidation } from '../hooks/useFormValidation';
import { competitionSchema } from '../lib/validationSchemas';
import {
  buildCompetitionPayload,
  normalizeCompetitions,
  type CompetitionApiResponse,
} from '../lib/competitions';
import { applyBackendValidationErrors, resolveKnownFieldError } from '../lib/backendErrorUtils';

const ADMIN_LOCALES = ['en', 'es'] as const;
type AdminLocale = (typeof ADMIN_LOCALES)[number];

const withCompetitionFormDefaults = (data?: Partial<Competition>): Partial<Competition> => {
  const merged = { ...(data ?? {}) };
  const localizedNames: Record<string, string> = {
    ...(merged.i18n_names ?? {}),
  };

  ADMIN_LOCALES.forEach((locale) => {
    localizedNames[locale] = localizedNames[locale] ?? '';
  });

  return {
    ...merged,
    competition_id: merged.competition_id ?? '',
    name: merged.name ?? '',
    short_name: merged.short_name ?? '',
    gender: merged.gender ?? 'male',
    country_name: merged.country_name ?? '',
    i18n_names: localizedNames,
  };
};

export default function CompetitionsManager() {
  const { t, i18n } = useTranslation('admin');
  const user = useAuthStore((state) => state.user);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const { loading, withLoading } = useLoading(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Competition | null>(null);
  const [genderFilter, setGenderFilter] = useState<string>('');
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [showSimilarRecords, setShowSimilarRecords] = useState(false);
  const [similarRecords, setSimilarRecords] = useState<any[] | null>(null);
  const [originalFormData, setOriginalFormData] = useState<Partial<Competition> | null>(null);
  const currentLang = i18n.language as 'en' | 'es';
  const { checkDuplicates, duplicates, clearDuplicates } = useDuplicateCheck();
  const { detectChanges, changeResult, duplicateResult, clearChangeResult } = useChangeDetection();
  const {
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    getFieldError,
    setFieldError,
  } = useFormValidation<Partial<Competition>>(competitionSchema, t);

  const formatDeleteGuardError = (detail: unknown): string | null => {
    if (typeof detail !== 'string') return null;
    const match = detail.match(/Cannot delete competition with (\d+) associated match(?:es)?/i);
    if (!match) return null;
    const count = Number(match[1]);
    return t('deleteGuards.competitionMatches', { count });
  };

  // Form state
  const [formData, setFormData] = useState<Partial<Competition>>(() => withCompetitionFormDefaults());

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    fetchCompetitions();
  }, [currentPage, pageSize, genderFilter, searchTerm]);

  const fetchCompetitions = async () => {
    await withLoading(async () => {
      try {
        setError(null);
        const params: any = {
          page: currentPage,
          page_size: pageSize,
        };
        
        if (genderFilter) {
          params.gender = genderFilter;
        }
        
        if (searchTerm) {
          params.search = searchTerm;
        }
        
        const response = await apiClient.get<PaginatedResponse<CompetitionApiResponse>>('/competitions/', { params });
        setCompetitions(normalizeCompetitions(response.items));
        setTotalItems(response.total);
        setTotalPages(response.total_pages);
      } catch (err: any) {
        setError(err.response?.data?.detail || t('errorFetchingData'));
        console.error('Error fetching competitions:', err);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm(formData)) {
      setError(t('validation.fixErrors'));
      return;
    }

    const backendPayload = buildCompetitionPayload(formData);
    
    // EDIT MODE: Always show changes for confirmation
    if (editingItem && editingItem.competition_id) {
      if (!showChangeWarning) {
        clearChangeResult();
        clearDuplicates();
        
        const result = await detectChanges(
          'competitions',
          editingItem.competition_id,
          backendPayload,
          true,
        );
        
        if (result && result.changes.length > 0) {
          setShowChangeWarning(true);
          return;
        } else if (result && result.changes.length === 0) {
          setError(t('validation.noChangesDetected'));
          return;
        }
      }
      
      if (showChangeWarning && changeResult) {
        if (duplicateResult && duplicateResult.has_duplicates && !showSimilarRecords) {
          setShowChangeWarning(false);
          setSimilarRecords(duplicateResult.duplicates ?? []);
          setShowSimilarRecords(true);
          return;
        }
      }
    }
    
    // CREATE MODE: Check for duplicates
    if (!editingItem) {
      const result = await checkDuplicates('competitions', backendPayload);

      const exactDuplicate = result.duplicates?.find(d => 
        d.similarity_score === 1.0 || d.match_score === 100
      );
      
      if (exactDuplicate) {
        setError(t('validation.exactDuplicateExists'));
        return;
      }

      if (result.has_duplicates && !showDuplicateWarning) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    await saveCompetition(backendPayload);
  };

  const saveCompetition = async (payloadOverride?: Record<string, unknown>) => {
    try {
      const payload = payloadOverride ?? buildCompetitionPayload(formData);
      if (editingItem) {
        await apiClient.put(
          `/competitions/${editingItem.competition_id}`,
          payload,
        );
      } else {
        await apiClient.post('/competitions/', payload);
      }
      await fetchCompetitions();
      handleCloseForm();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const handled = applyBackendValidationErrors(detail, {
        setFieldError,
        clearErrors,
        translate: t,
      });
      if (handled) {
        setError(t('validation.fixErrors'));
        return;
      }
      const knownFieldError = resolveKnownFieldError(detail);
      if (knownFieldError) {
        setFieldError(knownFieldError.field, t(knownFieldError.translationKey));
        setError(t('validation.fixErrors'));
        return;
      }
      if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError(t('errorSavingData'));
      }
      console.error('Error saving competition:', err);
    }
  };

  const handleContinueWithDuplicates = async () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
    await saveCompetition(buildCompetitionPayload(formData));
  };

  const handleCancelDuplicates = () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
  };

  const handleConfirmChanges = async () => {
    setShowChangeWarning(false);
    await handleSubmit(new Event('submit') as any);
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
    if (!window.confirm(t('confirmDelete'))) return;
    
    try {
      await apiClient.delete(`/competitions/${id}`);
      await fetchCompetitions();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const guardMessage = formatDeleteGuardError(detail);
      if (guardMessage) {
        setError(guardMessage);
        return;
      }
      setError(typeof detail === 'string' ? detail : t('errorDeletingData'));
      console.error('Error deleting competition:', err);
    }
  };

  const handleEdit = (item: Competition) => {
    const formValue = withCompetitionFormDefaults(item);
    setEditingItem(item);
    setFormData(formValue);
    setOriginalFormData(formValue);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingItem(null);
    clearErrors();
    setError(null);
    setShowDuplicateWarning(false);
    setShowChangeWarning(false);
    setShowSimilarRecords(false);
    setOriginalFormData(null);
    clearDuplicates();
    clearChangeResult();
    setFormData(withCompetitionFormDefaults());
  };

  // Fetch competition suggestions for autocomplete
  const fetchCompetitionSuggestions = async (
    query: string,
  ): Promise<Competition[]> => {
    try {
      const response = await apiClient.get<CompetitionApiResponse[]>(
        '/competitions/search/suggestions',
        {
          params: { q: query },
        },
      );
      return normalizeCompetitions(response);
    } catch (error) {
      console.error('Error fetching competition suggestions:', error);
      return [];
    }
  };

  // Handle selecting an existing competition from autocomplete
  const handleSelectExistingCompetition = (competitionData: Competition) => {
    const formValue = withCompetitionFormDefaults(competitionData);
    setEditingItem(competitionData);
    setFormData(formValue);
    setOriginalFormData(formValue);
  };

  // Backend handles filtering via search and gender params

  if (loading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Trophy className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">
            {t('competitions')}
          </h1>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>{t('createCompetition')}</span>
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Search and Filter */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('gender')}: {t('filter')}</option>
              <option value="male">{t('male')}</option>
              <option value="female">{t('female')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Competitions List */}
            {/* Competitions List */}
      <div className="card">
        {competitions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm || genderFilter
              ? t('noData')
              : t('noCompetitions')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('id')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('name')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('localizedNames')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('shortName')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('gender')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('country')}
                    </th>
                    {user?.role === 'admin' && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {competitions.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.competition_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="space-y-1">
                          {ADMIN_LOCALES.map((locale) => (
                            <div key={locale} className="flex items-center text-xs">
                              <span className="font-semibold uppercase text-gray-500 mr-2">{locale}</span>
                              <span>{item.i18n_names?.[locale] || '-'}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.short_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.gender === 'male' 
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-pink-100 text-pink-800'
                        }`}>
                          {t(item.gender)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.country_name}
                      </td>
                      {user?.role === 'admin' && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                            title={t('edit')}
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.competition_id)}
                            className="text-red-600 hover:text-red-900"
                            title={t('delete')}
                          >
                            <Trash2 className="h-5 w-5" />
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingItem ? t('edit') : t('createCompetition')}
              </h2>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form id="competition-form" onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              {showChangeWarning && changeResult && changeResult.changes.length > 0 && (
                <ChangeConfirmation
                  changePercentage={changeResult.change_percentage}
                  changes={changeResult.changes}
                  onConfirm={handleConfirmChanges}
                  onCancel={handleCancelChanges}
                />
              )}
              {showDuplicateWarning && duplicates && duplicates.has_duplicates && (
                <DuplicateWarning
                  duplicates={duplicates.duplicates}
                  onContinue={handleContinueWithDuplicates}
                  onCancel={handleCancelDuplicates}
                  entityType="competition"
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
                  {t('competitionId')}
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={formData.competition_id || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, competition_id: e.target.value });
                    validateAndSetFieldError('competition_id', e.target.value);
                  }}
                  onBlur={(e) => validateAndSetFieldError('competition_id', e.target.value)}
                  className={`input w-full ${getFieldError('competition_id') ? 'border-red-500' : ''}`}
                  placeholder="competition_2025"
                />
                <p className="mt-1 text-sm text-gray-500">{t('competitionIdHelper')}</p>
                {getFieldError('competition_id') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('competition_id')}</p>
                )}
              </div>

              <div>
                <AutocompleteSearch<Competition>
                  name="name"
                  value={formData.name || ''}
                  onChange={(value) => {
                    setFormData({ ...formData, name: value });
                    validateAndSetFieldError('name', value);
                  }}
                  onSelectSuggestion={handleSelectExistingCompetition}
                  fetchSuggestions={fetchCompetitionSuggestions}
                  getDisplayText={(competition) => competition.name}
                  getSecondaryText={(competition) => `${competition.short_name || ''} • ${competition.country_name} • ${competition.gender}`}
                  placeholder={t('competitionNamePlaceholder')}
                  label={t('name')}
                  required
                  minChars={3}
                />
                {getFieldError('name') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('name')}</p>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-gray-700">{t('localizedNames')}</p>
                  <p className="text-xs text-gray-500">{t('localizedNamesDescription')}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ADMIN_LOCALES.map((locale) => {
                    const fieldKey = `i18n_names.${locale}`;
                    return (
                      <div key={locale}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {locale === 'en' ? t('localizedNameEn') : t('localizedNameEs')}
                        </label>
                        <input
                          type="text"
                          maxLength={100}
                          value={formData.i18n_names?.[locale] ?? ''}
                          onChange={(e) => handleLocalizedNameChange(locale, e.target.value)}
                          onBlur={(e) => validateAndSetFieldError(fieldKey, e.target.value)}
                          className={`input w-full ${getFieldError(fieldKey) ? 'border-red-500' : ''}`}
                        />
                        {getFieldError(fieldKey) && (
                          <p className="mt-1 text-sm text-red-600">{getFieldError(fieldKey)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('shortName')}
                </label>
                  <input
                    type="text"
                    value={formData.short_name || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, short_name: e.target.value });
                    validateAndSetFieldError('short_name', e.target.value);
                  }}
                  onBlur={(e) => validateAndSetFieldError('short_name', e.target.value)}
                  className={`input w-full ${getFieldError('short_name') ? 'border-red-500' : ''}`}
                />
                {getFieldError('short_name') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('short_name')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('gender')} *
                </label>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => {
                    const value = e.target.value as 'male' | 'female';
                    setFormData({ ...formData, gender: value });
                    validateAndSetFieldError('gender', value);
                  }}
                  onBlur={(e) => validateAndSetFieldError('gender', e.target.value)}
                  className={`input w-full ${getFieldError('gender') ? 'border-red-500' : ''}`}
                >
                  <option value="male">{t('male')}</option>
                  <option value="female">{t('female')}</option>
                </select>
                {getFieldError('gender') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('gender')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('country')} *
                </label>
                <select
                  required
                  value={formData.country_name}
                  onChange={(e) => {
                    setFormData({ ...formData, country_name: e.target.value });
                    validateAndSetFieldError('country_name', e.target.value);
                  }}
                  onBlur={(e) => validateAndSetFieldError('country_name', e.target.value)}
                  className={`input w-full ${getFieldError('country_name') ? 'border-red-500' : ''}`}
                >
                  <option value="">{t('selectCountry')}</option>
                  {getCountriesSorted(currentLang).map((country) => (
                    <option key={country.en} value={country.en}>
                      {country[currentLang]}
                    </option>
                  ))}
                </select>
                {getFieldError('country_name') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('country_name')}</p>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="btn btn-secondary"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={showChangeWarning || showSimilarRecords}
                >
                  {t('save')}
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
          entityType="competition"
          onClose={handleCloseSimilarRecords}
          onOpenRecord={handleOpenSimilarRecord}
        />
      )}
    </div>
  );
}
