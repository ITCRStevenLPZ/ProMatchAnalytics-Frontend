import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Plus, Edit, Trash2, Search, X, Filter } from 'lucide-react';
import { apiClient } from '../lib/api';
import { normalizePlayers, type PlayerApiResponse } from '../lib/players';
import type { PlayerData, PlayerPosition, PaginatedResponse } from '../types';
import { getCountriesSorted } from '../lib/countries';
import { useDuplicateCheck } from '../hooks/useDuplicateCheck';
import { useChangeDetection } from '../hooks/useChangeDetection';
import { useLoading } from '../hooks/useLoading';
import DuplicateWarning from '../components/DuplicateWarning';
import ChangeConfirmation from '../components/ChangeConfirmation';
import SimilarRecordsViewer from '../components/SimilarRecordsViewer';
import { useAuthStore } from '../store/authStore';
import Pagination from '../components/Pagination';
import LoadingSpinner from '../components/LoadingSpinner';
import AutocompleteSearch from '../components/AutocompleteSearch';
import { useFormValidation } from '../hooks/useFormValidation';
import { playerSchema } from '../lib/validationSchemas';

export default function PlayersManager() {
  const { t, i18n } = useTranslation('admin');
  const user = useAuthStore((state) => state.user);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const { loading, withLoading } = useLoading(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState<PlayerPosition | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PlayerData | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [showSimilarRecords, setShowSimilarRecords] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<Partial<PlayerData> | null>(null);
  const currentLang = i18n.language as 'en' | 'es';
  const { checkDuplicates, duplicates, clearDuplicates } = useDuplicateCheck();
  const { detectChanges, changeResult, duplicateResult, clearChangeResult } = useChangeDetection();
  
  // Form validation
  const {
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    getFieldError,
  } = useFormValidation<Partial<PlayerData>>(playerSchema, t);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [formData, setFormData] = useState<Partial<PlayerData>>({
    name: '',
    birth_date: '',
    nationality: '',
    position: 'CM',
    height: undefined,
    weight: undefined,
  });

  useEffect(() => {
    fetchPlayers();
  }, [currentPage, pageSize, positionFilter, searchTerm]);

  const fetchPlayers = async () => {
    await withLoading(async () => {
      try {
        setError(null);
        const params: any = {
          page: currentPage,
          page_size: pageSize,
        };
        
        if (positionFilter) {
          params.position = positionFilter;
        }
        
        if (searchTerm) {
          params.search = searchTerm;
        }
        
        const response = await apiClient.get<PaginatedResponse<PlayerApiResponse>>('/players/', { params });
        setPlayers(normalizePlayers(response.items));
        setTotalItems(response.total);
        setTotalPages(response.total_pages);
      } catch (err: any) {
        setError(err.response?.data?.detail || t('errorFetchingData'));
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateForm(formData)) {
      setError(t('validation.fixErrors'));
      return;
    }
    
    // EDIT MODE: Always show changes for confirmation
    if (editingItem && editingItem.player_id) {
      // If we haven't shown the change warning yet, detect changes with duplicate check
      if (!showChangeWarning) {
        // Always clear previous result and detect fresh with combined duplicate check
        clearChangeResult();
        clearDuplicates();
        
        // Detect changes AND check duplicates in single API call
        const result = await detectChanges('players', editingItem.player_id, formData, true);
        
        // Always show change confirmation, even for small changes
        if (result && result.changes.length > 0) {
          setShowChangeWarning(true);
          return;
        } else if (result && result.changes.length === 0) {
          // No changes detected, just save
          setError(t('validation.noChangesDetected'));
          return;
        }
      }
      
      // After change confirmation, check if duplicates were already detected
      if (showChangeWarning && changeResult) {
        // Duplicates were already checked in combined call, just show them if found
        if (duplicateResult && duplicateResult.has_duplicates && !showSimilarRecords) {
          setShowChangeWarning(false);
          setShowSimilarRecords(true);
          return;
        }
      }
    }
    
    // CREATE MODE: Check for duplicates
    if (!editingItem) {
      const result = await checkDuplicates('players', {
        name: formData.name,
        birth_date: formData.birth_date,
        nationality: formData.nationality
      });

      // Check for 100% duplicates (should be rejected automatically)
      const exactDuplicate = result.duplicates?.find(d => 
        d.similarity_score === 1.0 || d.match_score === 100
      );
      
      if (exactDuplicate) {
        setError(t('validation.exactDuplicateExists'));
        return;
      }

      // Check for similar duplicates (80%+)
      if (result.has_duplicates && !showDuplicateWarning) {
        setShowDuplicateWarning(true);
        return;
      }
    }

    await savePlayer();
  };

  const savePlayer = async () => {
    try {
      if (editingItem) {
        await apiClient.put(`/players/${editingItem.player_id}`, formData);
      } else {
        await apiClient.post('/players/', formData);
      }
      await fetchPlayers();
      handleCloseForm();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Handle Pydantic validation errors
        const errorMessages = detail.map((e: any) => e.msg).join(', ');
        setError(errorMessages);
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError(t('errorSavingData'));
      }
    }
  };

  const handleContinueWithDuplicates = async () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
    await savePlayer();
  };

  const handleCancelDuplicates = () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
  };

  const handleConfirmChanges = async () => {
    // User confirmed the changes, proceed to next step (duplicate check)
    setShowChangeWarning(false);
    // Don't clear changeResult here, we need it for the duplicate check
    
    // Continue with the duplicate check and save flow
    await handleSubmit(new Event('submit') as any);
  };

  const handleCancelChanges = () => {
    // User canceled, reset everything
    setShowChangeWarning(false);
    clearChangeResult();
    setError(null);
    
    // Revert to original data
    if (originalFormData) {
      setFormData(originalFormData);
    }
  };

  const handleCloseSimilarRecords = () => {
    setShowSimilarRecords(false);
  };

  const handleOpenSimilarRecord = (record: any) => {
    // Open the record in a new modal or navigate to edit it
    // For now, we'll just populate the form with the similar record for comparison
    window.open(`/admin/players/${record.player_id}`, '_blank');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await apiClient.delete(`/players/${id}`);
      await fetchPlayers();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorDeletingData'));
    }
  };

  const handleEdit = (item: PlayerData) => {
    setEditingItem(item);
    setFormData(item);
    setOriginalFormData(item); // Store original data for comparison
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
      name: '',
      birth_date: '',
      nationality: '',
      position: 'CM',
      height: undefined,
      weight: undefined,
    });
  };

  // Fetch player suggestions for autocomplete
  const fetchPlayerSuggestions = async (query: string): Promise<PlayerApiResponse[]> => {
    try {
      const response = await apiClient.get<PlayerApiResponse[]>('/players/search/suggestions', {
        params: { q: query }
      });
      return response;
    } catch (error) {
      console.error('Error fetching player suggestions:', error);
      return [];
    }
  };

  // Handle selecting an existing player from autocomplete
  const handleSelectExistingPlayer = (playerData: PlayerApiResponse) => {
    const normalizedPlayer = normalizePlayers([playerData])[0];
    setEditingItem(normalizedPlayer);
    setFormData(normalizedPlayer);
  };

  const filteredPlayers = players.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nationality.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPosition = !positionFilter || item.position === positionFilter;
    return matchesSearch && matchesPosition;
  });

  const getPositionColor = (position: string) => {
    // Goalkeeper
    if (position === 'GK') return 'bg-purple-100 text-purple-800';
    // Defenders
    if (['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].includes(position)) {
      return 'bg-blue-100 text-blue-800';
    }
    // Midfielders
    if (['CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW'].includes(position)) {
      return 'bg-green-100 text-green-800';
    }
    // Forwards
    if (['CF', 'ST', 'LF', 'RF', 'SS'].includes(position)) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <User className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t('players')}</h1>
        </div>
        {user?.role === 'admin' && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>{t('createPlayer')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="card grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value as PlayerPosition | '')}
            className="input pl-10 w-full"
          >
            <option value="">{t('allPositions')}</option>
            <optgroup label={t('positionGroups.goalkeeper')}>
              <option value="GK">{t('positions.GK')}</option>
            </optgroup>
            <optgroup label={t('positionGroups.defenders')}>
              <option value="CB">{t('positions.CB')}</option>
              <option value="LB">{t('positions.LB')}</option>
              <option value="RB">{t('positions.RB')}</option>
              <option value="LWB">{t('positions.LWB')}</option>
              <option value="RWB">{t('positions.RWB')}</option>
              <option value="SW">{t('positions.SW')}</option>
            </optgroup>
            <optgroup label={t('positionGroups.midfielders')}>
              <option value="CDM">{t('positions.CDM')}</option>
              <option value="CM">{t('positions.CM')}</option>
              <option value="CAM">{t('positions.CAM')}</option>
              <option value="LM">{t('positions.LM')}</option>
              <option value="RM">{t('positions.RM')}</option>
              <option value="LW">{t('positions.LW')}</option>
              <option value="RW">{t('positions.RW')}</option>
            </optgroup>
            <optgroup label={t('positionGroups.forwards')}>
              <option value="CF">{t('positions.CF')}</option>
              <option value="ST">{t('positions.ST')}</option>
              <option value="LF">{t('positions.LF')}</option>
              <option value="RF">{t('positions.RF')}</option>
              <option value="SS">{t('positions.SS')}</option>
            </optgroup>
          </select>
        </div>
      </div>

      <div className="card">
        {filteredPlayers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm || positionFilter ? t('noData') : t('noPlayers')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('position')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('nationality')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('birthDate')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('age')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('height')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('weight')}</th>
                    {user?.role === 'admin' && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPlayers.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionColor(item.position)}`}>
                          {t(`positions.${item.position}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.nationality}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.birth_date}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.age || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.height ? `${item.height} cm` : '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.weight ? `${item.weight} kg` : '-'}</td>
                      {user?.role === 'admin' && (
                        <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                          <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900" title={t('edit')}>
                            <Edit className="h-5 w-5 inline" />
                          </button>
                          <button onClick={() => handleDelete(item.player_id)} className="text-red-600 hover:text-red-900" title={t('delete')}>
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
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10 rounded-t-lg">
              <h2 className="text-2xl font-bold">{editingItem ? t('edit') : t('createPlayer')}</h2>
              <button onClick={handleCloseForm} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form id="player-form" onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              {showDuplicateWarning && duplicates && duplicates.has_duplicates && (
                <DuplicateWarning
                  duplicates={duplicates.duplicates}
                  onContinue={handleContinueWithDuplicates}
                  onCancel={handleCancelDuplicates}
                  entityType="player"
                />
              )}
              {showChangeWarning && changeResult && changeResult.changes.length > 0 && (
                <ChangeConfirmation
                  changePercentage={changeResult.change_percentage}
                  changes={changeResult.changes}
                  onConfirm={handleConfirmChanges}
                  onCancel={handleCancelChanges}
                />
              )}
              <div>
                <AutocompleteSearch<PlayerApiResponse>
                  name="name"
                  value={formData.name || ''}
                  onChange={(value) => {
                    setFormData({ ...formData, name: value });
                    validateAndSetFieldError('name', value);
                  }}
                  onSelectSuggestion={handleSelectExistingPlayer}
                  fetchSuggestions={fetchPlayerSuggestions}
                  getDisplayText={(player) => player.name}
                  getSecondaryText={(player) => `${player.nationality} • ${player.position} • ${player.birth_date}`}
                  placeholder={t('playerNamePlaceholder')}
                  label={t('name')}
                  required
                  minChars={3}
                />
                {getFieldError('name') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('name')}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('birthDate')} *</label>
                  <input
                    type="date"
                    required
                    value={formData.birth_date}
                    onChange={(e) => {
                      setFormData({ ...formData, birth_date: e.target.value });
                      validateAndSetFieldError('birth_date', e.target.value);
                    }}
                    onBlur={(e) => validateAndSetFieldError('birth_date', e.target.value)}
                    className={`input w-full ${getFieldError('birth_date') ? 'border-red-500' : ''}`}
                  />
                  {getFieldError('birth_date') && (
                    <p className="mt-1 text-sm text-red-600">{getFieldError('birth_date')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('nationality')} *</label>
                  <select
                    required
                    value={formData.nationality}
                    onChange={(e) => {
                      setFormData({ ...formData, nationality: e.target.value });
                      validateAndSetFieldError('nationality', e.target.value);
                    }}
                    onBlur={(e) => validateAndSetFieldError('nationality', e.target.value)}
                    className={`input w-full ${getFieldError('nationality') ? 'border-red-500' : ''}`}
                  >
                    <option value="">{t('selectCountry')}</option>
                    {getCountriesSorted(currentLang).map((country) => (
                      <option key={country.en} value={country.en}>
                        {country[currentLang]}
                      </option>
                    ))}
                  </select>
                  {getFieldError('nationality') && (
                    <p className="mt-1 text-sm text-red-600">{getFieldError('nationality')}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('position')} *</label>
                  <select
                    required
                    value={formData.position}
                    onChange={(e) => {
                      const value = e.target.value as PlayerPosition;
                      setFormData({ ...formData, position: value });
                      validateAndSetFieldError('position', value);
                    }}
                    onBlur={(e) => validateAndSetFieldError('position', e.target.value)}
                    className={`input w-full ${getFieldError('position') ? 'border-red-500' : ''}`}
                  >
                    <optgroup label={t('positionGroups.goalkeeper')}>
                      <option value="GK">{t('positions.GK')}</option>
                    </optgroup>
                    <optgroup label={t('positionGroups.defenders')}>
                      <option value="CB">{t('positions.CB')}</option>
                      <option value="LB">{t('positions.LB')}</option>
                      <option value="RB">{t('positions.RB')}</option>
                      <option value="LWB">{t('positions.LWB')}</option>
                      <option value="RWB">{t('positions.RWB')}</option>
                      <option value="SW">{t('positions.SW')}</option>
                    </optgroup>
                    <optgroup label={t('positionGroups.midfielders')}>
                      <option value="CDM">{t('positions.CDM')}</option>
                      <option value="CM">{t('positions.CM')}</option>
                      <option value="CAM">{t('positions.CAM')}</option>
                      <option value="LM">{t('positions.LM')}</option>
                      <option value="RM">{t('positions.RM')}</option>
                      <option value="LW">{t('positions.LW')}</option>
                      <option value="RW">{t('positions.RW')}</option>
                    </optgroup>
                    <optgroup label={t('positionGroups.forwards')}>
                      <option value="CF">{t('positions.CF')}</option>
                      <option value="ST">{t('positions.ST')}</option>
                      <option value="LF">{t('positions.LF')}</option>
                      <option value="RF">{t('positions.RF')}</option>
                      <option value="SS">{t('positions.SS')}</option>
                    </optgroup>
                  </select>
                  {getFieldError('position') && (
                    <p className="mt-1 text-sm text-red-600">{getFieldError('position')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('height')} (cm)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.height || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseFloat(e.target.value) : undefined;
                      setFormData({ ...formData, height: value });
                      validateAndSetFieldError('height', value);
                    }}
                    onBlur={(e) => validateAndSetFieldError('height', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className={`input w-full ${getFieldError('height') ? 'border-red-500' : ''}`}
                  />
                  {getFieldError('height') && (
                    <p className="mt-1 text-sm text-red-600">{getFieldError('height')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('weight')} (kg)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.weight || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseFloat(e.target.value) : undefined;
                      setFormData({ ...formData, weight: value });
                      validateAndSetFieldError('weight', value);
                    }}
                    onBlur={(e) => validateAndSetFieldError('weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className={`input w-full ${getFieldError('weight') ? 'border-red-500' : ''}`}
                  />
                  {getFieldError('weight') && (
                    <p className="mt-1 text-sm text-red-600">{getFieldError('weight')}</p>
                  )}
                </div>
              </div>
            </form>
            <div className="flex justify-end space-x-3 p-6 border-t sticky bottom-0 bg-white z-10 rounded-b-lg">
              <button type="button" onClick={handleCloseForm} className="btn btn-secondary">{t('cancel')}</button>
              <button 
                type="submit" 
                form="player-form" 
                disabled={showChangeWarning || showSimilarRecords}
                className={`btn btn-primary ${(showChangeWarning || showSimilarRecords) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Similar Records Viewer Modal */}
      {showSimilarRecords && duplicateResult && duplicateResult.has_duplicates && (
        <SimilarRecordsViewer
          records={duplicateResult.duplicates}
          currentData={formData}
          entityType="player"
          onClose={handleCloseSimilarRecords}
          onOpenRecord={handleOpenSimilarRecord}
        />
      )}
    </div>
  );
}
