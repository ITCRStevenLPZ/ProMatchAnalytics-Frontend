import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Edit, Trash2, Search, X, Users, Filter } from 'lucide-react';
import { apiClient } from '../lib/api';
import { normalizePlayers, type PlayerApiResponse } from '../lib/players';
import { normalizeTeams, type TeamApiResponse } from '../lib/teams';
import type { Team, TeamPlayer, PlayerData, PlayerPosition, PaginatedResponse, TechnicalStaffMember } from '../types';
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
import { teamSchema } from '../lib/validationSchemas';

// Technical staff roles (stored in English in DB, translated in UI)
// Note: Manager and Technical Director are not included as they are leadership positions
const TECHNICAL_STAFF_ROLES = [
  'Assistant Coach',
  'Goalkeeper Coach',
  'Fitness Coach',
  'Team Doctor',
  'Physiotherapist',
  'Nutritionist',
  'Sports Psychologist',
  'Video Analyst',
  'Scout',
  'Equipment Manager',
  'Other'
] as const;

export default function TeamsManager() {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const user = useAuthStore((state) => state.user);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const { loading, withLoading } = useLoading(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<'male' | 'female' | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Team | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamRoster, setTeamRoster] = useState<TeamPlayer[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerData[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [showSimilarRecords, setShowSimilarRecords] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<Partial<Team> | null>(null);
  const currentLang = i18n.language as 'en' | 'es';
  const { checkDuplicates, duplicates, clearDuplicates } = useDuplicateCheck();
  const { detectChanges, changeResult, duplicateResult, clearChangeResult } = useChangeDetection();
  
  // Form validation
  const {
    validateForm,
    validateAndSetFieldError,
    clearErrors,
    getFieldError,
  } = useFormValidation<Partial<Team>>(teamSchema, t);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Roster pagination
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(10);
  const [rosterTotalItems, setRosterTotalItems] = useState(0);
  const [rosterTotalPages, setRosterTotalPages] = useState(0);

  const [formData, setFormData] = useState<Partial<Team>>({
    name: '',
    short_name: '',
    country_name: '',
    gender: 'male',
    manager: {
      name: '',
      nationality: '',
      years_of_experience: 0,
      start_date: null,
    },
    technical_staff: [],
  });

  const [rosterFormData, setRosterFormData] = useState({
    player_id: '',
    jersey_number: 1,
    position: 'CM' as PlayerPosition,
    is_active: true,
  });

  useEffect(() => {
    fetchTeams();
    fetchAllPlayers();
  }, [currentPage, pageSize, genderFilter, searchTerm]);

  const fetchTeams = async () => {
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
        
        const response = await apiClient.get<PaginatedResponse<TeamApiResponse>>('/teams/', { params });
        setTeams(normalizeTeams(response.items));
        setTotalItems(response.total);
        setTotalPages(response.total_pages);
      } catch (err: any) {
        setError(err.response?.data?.detail || t('errorFetchingData'));
      }
    });
  };

  const fetchAllPlayers = async () => {
    try {
      const response = await apiClient.get<PaginatedResponse<PlayerApiResponse>>('/players/', {
        params: { page: 1, page_size: 100 }
      });
      setPlayers(normalizePlayers(response.items));
    } catch (err: any) {
      console.error('Error fetching players:', err);
    }
  };

  const fetchTeamRoster = async (teamId: string) => {
    try {
      const params: any = {
        page: rosterPage,
        page_size: rosterPageSize,
      };
      
      const response = await apiClient.get<PaginatedResponse<TeamPlayer>>(`/teams/${teamId}/players`, { params });
      setTeamRoster(response.items);
      setRosterTotalItems(response.total);
      setRosterTotalPages(response.total_pages);
      
      // Filter available players (not in current roster and matching team gender)
      const rosterPlayerIds = response.items.map(tp => tp.player_id);
      const filtered = players.filter(p => 
        !rosterPlayerIds.includes(p.player_id)
      );
      setAvailablePlayers(filtered);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorFetchingData'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateForm(formData)) {
      setError(t('validation.fixErrors'));
      return;
    }

    // Clean formData: remove empty fields
    const cleanedData = { ...formData };
    
    // Clean single manager field
    if (cleanedData.manager) {
      const hasManagerData = 
        cleanedData.manager.name?.trim() ||
        cleanedData.manager.nationality?.trim() ||
        (cleanedData.manager.years_of_experience && 
         cleanedData.manager.years_of_experience > 0);
      
      if (!hasManagerData) {
        delete cleanedData.manager;
      }
    }

    // Clean technical_staff array - remove empty entries
    if (cleanedData.technical_staff && cleanedData.technical_staff.length > 0) {
      cleanedData.technical_staff = cleanedData.technical_staff.filter(s => 
        s.name?.trim() || s.role?.trim()
      );
      if (cleanedData.technical_staff.length === 0) {
        delete cleanedData.technical_staff;
      }
    }
    
    // EDIT MODE: Always show changes for confirmation
    if (editingItem && editingItem.team_id) {
      // If we haven't shown the change warning yet, detect changes with duplicate check
      if (!showChangeWarning) {
        // Always clear previous result and detect fresh with combined duplicate check
        clearChangeResult();
        clearDuplicates();
        
        // Detect changes AND check duplicates in single API call
        const result = await detectChanges('teams', editingItem.team_id, cleanedData, true);
        
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
      const result = await checkDuplicates('teams', {
        name: formData.name,
        country_name: formData.country_name,
        gender: formData.gender
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

    await saveTeam();
  };

  const saveTeam = async () => {
    try {
      // Clean formData before saving
      const cleanedData = { ...formData };
      
      // Clean single manager
      if (cleanedData.manager) {
        const hasManagerData = 
          cleanedData.manager.name?.trim() ||
          cleanedData.manager.nationality?.trim() ||
          (cleanedData.manager.years_of_experience && 
           cleanedData.manager.years_of_experience > 0);
        
        if (!hasManagerData) {
          delete cleanedData.manager;
        }
      }

      // Clean technical_staff array
      if (cleanedData.technical_staff && cleanedData.technical_staff.length > 0) {
        cleanedData.technical_staff = cleanedData.technical_staff.filter(s => 
          s.name?.trim() || s.role?.trim()
        );
        if (cleanedData.technical_staff.length === 0) {
          delete cleanedData.technical_staff;
        }
      }

      if (editingItem) {
        await apiClient.put(`/teams/${editingItem.team_id}`, cleanedData);
      } else {
        await apiClient.post('/teams/', cleanedData);
      }
      await fetchTeams();
      handleCloseForm();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorSavingData'));
    }
  };

  const handleContinueWithDuplicates = async () => {
    setShowDuplicateWarning(false);
    clearDuplicates();
    await saveTeam();
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
    clearChangeResult();
  };

  const handleOpenSimilarRecord = (record: any) => {
    setShowSimilarRecords(false);
    clearChangeResult();
    handleEdit(record);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await apiClient.delete(`/teams/${id}`);
      await fetchTeams();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorDeletingData'));
    }
  };

  const handleEdit = (item: Team) => {
    setEditingItem(item);
    const formDataToSet = {
      ...item,
      manager: item.manager || {
        name: '',
        nationality: '',
        years_of_experience: 0,
        start_date: null,
      },
      managers: item.managers || [],
      technical_staff: item.technical_staff || [],
    };
    setFormData(formDataToSet);
    setOriginalFormData(formDataToSet); // Store original data for revert
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
      short_name: '',
      country_name: '',
      gender: 'male',
      manager: {
        name: '',
        nationality: '',
        years_of_experience: 0,
        start_date: null,
      },
      technical_staff: [],
    });
  };

  // Technical staff handlers
  const handleAddStaff = () => {
    const newStaff: TechnicalStaffMember = {
      name: '',
      role: '',
      country_name: '',
      start_date: null,
    };
    setFormData({
      ...formData,
      technical_staff: [...(formData.technical_staff || []), newStaff],
    });
  };

  const handleRemoveStaff = (index: number) => {
    const updatedStaff = [...(formData.technical_staff || [])];
    updatedStaff.splice(index, 1);
    setFormData({ ...formData, technical_staff: updatedStaff });
  };

  const handleUpdateStaff = (index: number, field: keyof TechnicalStaffMember, value: any) => {
    const updatedStaff = [...(formData.technical_staff || [])];
    updatedStaff[index] = { ...updatedStaff[index], [field]: value };
    setFormData({ ...formData, technical_staff: updatedStaff });
  };

  // Fetch team suggestions for autocomplete
  const fetchTeamSuggestions = async (query: string): Promise<TeamApiResponse[]> => {
    try {
      const response = await apiClient.get<TeamApiResponse[]>('/teams/search/suggestions', {
        params: { q: query }
      });
      return response;
    } catch (error) {
      console.error('Error fetching team suggestions:', error);
      return [];
    }
  };

  // Handle selecting an existing team from autocomplete
  const handleSelectExistingTeam = (teamData: TeamApiResponse) => {
    const normalizedTeam = normalizeTeams([teamData])[0];
    setEditingItem(normalizedTeam);
    setFormData({
      ...normalizedTeam,
      manager: normalizedTeam.manager || {
        name: '',
        nationality: '',
        years_of_experience: 0,
        start_date: null,
      },
    });
  };

  const handleManageRoster = async (team: Team) => {
    setSelectedTeam(team);
    await fetchTeamRoster(team.team_id);
    setShowRosterModal(true);
  };

  const handleAddPlayerToRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;

    try {
      await apiClient.post(`/teams/${selectedTeam.team_id}/players`, rosterFormData);
      await fetchTeamRoster(selectedTeam.team_id);
      setRosterFormData({
        player_id: '',
        jersey_number: 1,
        position: 'CM',
        is_active: true,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorSavingData'));
    }
  };

  const handleRemovePlayerFromRoster = async (playerId: string) => {
    if (!selectedTeam) return;
    if (!window.confirm(t('confirmDelete'))) return;

    try {
      await apiClient.delete(`/teams/${selectedTeam.team_id}/players/${playerId}`);
      await fetchTeamRoster(selectedTeam.team_id);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorDeletingData'));
    }
  };

  const handleCloseRosterModal = () => {
    setShowRosterModal(false);
    setSelectedTeam(null);
    setTeamRoster([]);
    setAvailablePlayers([]);
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.player_id === playerId);
    return player?.name || playerId;
  };

  const getPositionBadgeColor = (position: PlayerPosition) => {
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

  const filteredTeams = teams.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.country_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGender = !genderFilter || item.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  if (loading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t('teams')}</h1>
        </div>
        {user?.role === 'admin' && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>{t('createTeam')}</span>
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
            placeholder={t('common:common.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value as 'male' | 'female' | '')}
            className="input pl-10 w-full"
          >
            <option value="">{t('common:common.gender')}: {t('common:common.filter')}</option>
            <option value="male">{t('common:common.male')}</option>
            <option value="female">{t('common:common.female')}</option>
          </select>
        </div>
      </div>

      <div className="card">
        {filteredTeams.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm || genderFilter ? t('noData') : t('noTeams')}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common:common.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('shortName')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common:common.country')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common:common.gender')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('manager')}</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common:common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTeams.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.short_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.country_name}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          item.gender === 'male' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
                        }`}>
                          {t(item.gender)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.manager?.name || '-'}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                        <button 
                          onClick={() => handleManageRoster(item)} 
                          className="text-green-600 hover:text-green-900" 
                          title={t('roster')}
                        >
                          <Users className="h-5 w-5 inline" />
                        </button>
                        {user?.role === 'admin' && (
                          <>
                            <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900" title={t('common:common.edit')}>
                              <Edit className="h-5 w-5 inline" />
                            </button>
                            <button onClick={() => handleDelete(item.team_id)} className="text-red-600 hover:text-red-900" title={t('common:common.delete')}>
                              <Trash2 className="h-5 w-5 inline" />
                            </button>
                          </>
                        )}
                      </td>
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

      {/* Team Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">{editingItem ? t('common:common.edit') : t('createTeam')}</h2>
              <button onClick={handleCloseForm} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form id="team-form" onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
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
                  entityType="team"
                />
              )}
              <div>
                <AutocompleteSearch<TeamApiResponse>
                  name="name"
                  value={formData.name || ''}
                  onChange={(value) => {
                    setFormData({ ...formData, name: value });
                    validateAndSetFieldError('name', value);
                  }}
                  onSelectSuggestion={handleSelectExistingTeam}
                  fetchSuggestions={fetchTeamSuggestions}
                  getDisplayText={(team) => team.name}
                  getSecondaryText={(team) => `${team.short_name} • ${team.country_name} • ${team.gender}`}
                  placeholder={t('teamNamePlaceholder')}
                  label={t('common:common.name')}
                  required
                  minChars={3}
                />
                {getFieldError('name') && (
                  <p className="mt-1 text-sm text-red-600">{getFieldError('name')}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('shortName')} *</label>
                  <input
                    type="text"
                    required
                    value={formData.short_name}
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common:common.country')} *</label>
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
                    <option value="">{t('common:common.selectCountry')}</option>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('common:common.gender')} *</label>
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
                    <option value="male">{t('common:common.male')}</option>
                    <option value="female">{t('common:common.female')}</option>
                  </select>
                  {getFieldError('gender') && (
                    <p className="mt-1 text-sm text-red-600">{getFieldError('gender')}</p>
                  )}
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">{t('manager')}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('managerName')} *</label>
                    <input
                      type="text"
                      required
                      value={formData.manager?.name}
                      onChange={(e) => {
                        setFormData({ 
                          ...formData, 
                          manager: { ...formData.manager!, name: e.target.value }
                        });
                        validateAndSetFieldError('manager.name', e.target.value);
                      }}
                      onBlur={(e) => validateAndSetFieldError('manager.name', e.target.value)}
                      className={`input w-full ${getFieldError('manager.name') ? 'border-red-500' : ''}`}
                    />
                    {getFieldError('manager.name') && (
                      <p className="mt-1 text-sm text-red-600">{getFieldError('manager.name')}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('managerNationality')} *</label>
                      <select
                        required
                        value={formData.manager?.nationality}
                        onChange={(e) => {
                          setFormData({ 
                            ...formData, 
                            manager: { ...formData.manager!, nationality: e.target.value }
                          });
                          validateAndSetFieldError('manager.nationality', e.target.value);
                        }}
                        onBlur={(e) => validateAndSetFieldError('manager.nationality', e.target.value)}
                        className={`input w-full ${getFieldError('manager.nationality') ? 'border-red-500' : ''}`}
                      >
                        <option value="">{t('common:common.selectCountry')}</option>
                        {getCountriesSorted(currentLang).map((country) => (
                          <option key={country.en} value={country.en}>
                            {country[currentLang]}
                          </option>
                        ))}
                      </select>
                      {getFieldError('manager.nationality') && (
                        <p className="mt-1 text-sm text-red-600">{getFieldError('manager.nationality')}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('managerYearsExp')}</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.manager?.years_of_experience}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          setFormData({ 
                            ...formData, 
                            manager: { ...formData.manager!, years_of_experience: value }
                          });
                          validateAndSetFieldError('manager.years_of_experience', value);
                        }}
                        onBlur={(e) => validateAndSetFieldError('manager.years_of_experience', parseInt(e.target.value) || 0)}
                        className={`input w-full ${getFieldError('manager.years_of_experience') ? 'border-red-500' : ''}`}
                      />
                      {getFieldError('manager.years_of_experience') && (
                        <p className="mt-1 text-sm text-red-600">{getFieldError('manager.years_of_experience')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical Staff Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">{t('technicalStaff')}</h3>
                  <button
                    type="button"
                    onClick={handleAddStaff}
                    className="btn btn-sm btn-secondary flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" /> {t('addStaff')}
                  </button>
                </div>
                {formData.technical_staff && formData.technical_staff.length > 0 && (
                  <div className="space-y-4">
                    {formData.technical_staff.map((staff, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-medium text-sm text-gray-700">
                            {t('staffMember')} #{index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveStaff(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {t('common:common.name')}
                              </label>
                              <input
                                type="text"
                                value={staff.name || ''}
                                onChange={(e) => handleUpdateStaff(index, 'name', e.target.value)}
                                className="input w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {t('role')}
                              </label>
                              <select
                                value={staff.role || ''}
                                onChange={(e) => handleUpdateStaff(index, 'role', e.target.value)}
                                className="input w-full"
                              >
                                <option value="">{t('rolePlaceholder')}</option>
                                {TECHNICAL_STAFF_ROLES.map((role) => (
                                  <option key={role} value={role}>
                                    {t(`technicalStaffRoles.${role}`)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {t('common:common.country')}
                            </label>
                            <select
                              value={staff.country_name || ''}
                              onChange={(e) => handleUpdateStaff(index, 'country_name', e.target.value)}
                              className="input w-full"
                            >
                              <option value="">{t('common:common.selectCountry')}</option>
                              {getCountriesSorted(currentLang).map((country) => (
                                <option key={country.en} value={country.en}>
                                  {country[currentLang]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-4">
                <button type="button" onClick={handleCloseForm} className="btn btn-secondary">{t('cancel')}</button>
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

      {/* Roster Management Modal */}
      {showRosterModal && selectedTeam && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-2xl font-bold">{t('admin.roster')} - {selectedTeam.name}</h2>
              <button onClick={handleCloseRosterModal} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Current Roster */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">{t('starters')} ({rosterTotalItems})</h3>
                  {teamRoster.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">{t('noPlayers')}</div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {teamRoster.map((tp) => (
                          <div key={tp.player_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <span className="font-semibold text-lg">#{tp.jersey_number}</span>
                                <span className="font-medium">{getPlayerName(tp.player_id)}</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionBadgeColor(tp.position)}`}>
                                  {t(`positions.${tp.position}`)}
                                </span>
                                {!tp.is_active && (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-gray-300 text-gray-700">
                                    {t('inactive')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemovePlayerFromRoster(tp.player_id)}
                              className="text-red-600 hover:text-red-900"
                              title={t('removeFromRoster')}
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4">
                        <Pagination
                          currentPage={rosterPage}
                          totalPages={rosterTotalPages}
                          totalItems={rosterTotalItems}
                          pageSize={rosterPageSize}
                          onPageChange={(page) => {
                            setRosterPage(page);
                            if (selectedTeam) {
                              fetchTeamRoster(selectedTeam.team_id);
                            }
                          }}
                          onPageSizeChange={(newPageSize) => {
                            setRosterPageSize(newPageSize);
                            setRosterPage(1);
                            if (selectedTeam) {
                              fetchTeamRoster(selectedTeam.team_id);
                            }
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Add Player Form */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">{t('addToRoster')}</h3>
                  <form onSubmit={handleAddPlayerToRoster} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('players')} *</label>
                      <select
                        required
                        value={rosterFormData.player_id}
                        onChange={(e) => setRosterFormData({ ...rosterFormData, player_id: e.target.value })}
                        className="input w-full"
                      >
                        <option value="">{t('selectPlayers')}</option>
                        {availablePlayers.map((player) => (
                          <option key={player.player_id} value={player.player_id}>
                            {player.name} - {t(`positions.${player.position}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('jerseyNumber')} *</label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="99"
                          value={rosterFormData.jersey_number}
                          onChange={(e) => setRosterFormData({ ...rosterFormData, jersey_number: parseInt(e.target.value) })}
                          className="input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('position')} *</label>
                        <select
                          required
                          value={rosterFormData.position}
                          onChange={(e) => setRosterFormData({ ...rosterFormData, position: e.target.value as PlayerPosition })}
                          className="input w-full"
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
                      </div>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={rosterFormData.is_active}
                        onChange={(e) => setRosterFormData({ ...rosterFormData, is_active: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                        {t('active')}
                      </label>
                    </div>
                    <button type="submit" className="btn btn-primary w-full">
                      <Plus className="h-5 w-5 inline mr-2" />
                      {t('addToRoster')}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Similar Records Viewer Modal */}
      {showSimilarRecords && duplicateResult && duplicateResult.has_duplicates && (
        <SimilarRecordsViewer
          records={duplicateResult.duplicates}
          currentData={formData}
          entityType="team"
          onClose={handleCloseSimilarRecords}
          onOpenRecord={handleOpenSimilarRecord}
        />
      )}
    </div>
  );
}
