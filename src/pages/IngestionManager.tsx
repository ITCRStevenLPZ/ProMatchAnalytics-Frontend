import { useState } from 'react';
import { Upload, FileText, AlertCircle, Trophy, MapPin, User as UserIcon, Users, Shield, Copy, Check, History, ExternalLink, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DataIngestionDialog } from '../components/DataIngestionDialog';
import { listBatches } from '../lib/ingestion';
import {
  downloadCompetitionTemplate,
  downloadVenueTemplate,
  downloadRefereeTemplate,
  downloadPlayerTemplate,
  downloadTeamTemplate,
  downloadBulkTemplate
} from '../lib/export';

type ModelType = 'competitions' | 'venues' | 'referees' | 'players' | 'teams' | 'bulk';

interface DataModel {
  id: ModelType;
  label: string;
  description: string;
  icon: LucideIcon;
  fields: string[];
  aiPrompt: string;
  downloadTemplate: (format: 'csv' | 'json') => void;
}

export default function IngestionManager() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'upload' | 'batches'>('upload');
  const [selectedModel, setSelectedModel] = useState<ModelType | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<string>('');

  // Fetch batches list
  const { data: batchesData, isLoading: batchesLoading, refetch } = useQuery({
    queryKey: ['batches', page, statusFilter, modelFilter],
    queryFn: () => listBatches({
      page,
      page_size: 20,
      status: statusFilter || undefined,
      target_model: modelFilter || undefined,
    }),
    enabled: activeTab === 'batches',
  });

  const models: DataModel[] = [
    {
      id: 'competitions',
      label: t('ingestion.competitions'),
      description: t('ingestion.competitionsDesc'),
      icon: Trophy,
      fields: ['name', 'short_name', 'gender', 'country'],
      aiPrompt: `Transform the following competition data into CSV format with these exact columns: name, short_name, gender, country.

Requirements:
- name: Full official competition name
- short_name: Abbreviated name (3-4 characters, e.g., "EPL", "UCL")
- gender: Must be exactly "male" or "female" (lowercase)
- country: Must match one of the 60+ predefined countries (e.g., "England", "Spain", "Argentina", "Brazil", "Germany", "France", "Italy", "Netherlands", "Portugal", "Belgium", "Croatia", "Uruguay", "Colombia", "Mexico", "USA", "Japan", "South Korea", "Australia")

Output format: CSV with headers
Example:
name,short_name,gender,country
Premier League,EPL,male,England
UEFA Champions League,UCL,male,Europe
Liga F,LF,female,Spain`,
      downloadTemplate: downloadCompetitionTemplate
    },
    {
      id: 'venues',
      label: t('ingestion.venues'),
      description: t('ingestion.venuesDesc'),
      icon: MapPin,
      fields: ['name', 'city', 'country', 'capacity', 'surface'],
      aiPrompt: `Transform the following venue/stadium data into CSV format with these exact columns: name, city, country, capacity, surface.

Requirements:
- name: Full stadium/venue name
- city: City where venue is located
- country: Must match one of the 60+ predefined countries (e.g., "England", "Spain", "Argentina", "Brazil", "Germany", "France", "Italy")
- capacity: Numeric seating capacity (integer, e.g., 75000)
- surface: Must be exactly one of: "Natural Grass", "Artificial Turf", or "Hybrid"

Output format: CSV with headers
Example:
name,city,country,capacity,surface
Santiago Bernabéu,Madrid,Spain,81044,Hybrid
Camp Nou,Barcelona,Spain,99354,Natural Grass
Emirates Stadium,London,England,60704,Natural Grass`,
      downloadTemplate: downloadVenueTemplate
    },
    {
      id: 'referees',
      label: t('ingestion.referees'),
      description: t('ingestion.refereesDesc'),
      icon: UserIcon,
      fields: ['name', 'country', 'years_of_experience'],
      aiPrompt: `Transform the following referee data into CSV format with these exact columns: name, country, years_of_experience.

Requirements:
- name: Full referee name (First and Last name)
- country: Must match one of the 60+ predefined countries (e.g., "England", "Spain", "Argentina", "Brazil", "Germany", "France", "Italy")
- years_of_experience: Numeric value representing years of professional refereeing experience (integer, e.g., 15)

Output format: CSV with headers
Example:
name,country,years_of_experience
Michael Oliver,England,18
Björn Kuipers,Netherlands,20
Pierluigi Collina,Italy,28`,
      downloadTemplate: downloadRefereeTemplate
    },
    {
      id: 'players',
      label: t('ingestion.players'),
      description: t('ingestion.playersDesc'),
      icon: Users,
      fields: ['name', 'position', 'nationality', 'birth_date', 'height', 'weight', 'jersey_number'],
      aiPrompt: `Transform the following player data into CSV format with these exact columns: name, position, nationality, birth_date, height, weight, jersey_number, gender.

Requirements:
- name: Full player name (First and Last name)
- position: Must be exactly one of: "Goalkeeper", "Defender", "Midfielder", "Forward"
- nationality: Must match one of the 60+ predefined countries (e.g., "England", "Spain", "Argentina", "Brazil")
- birth_date: ISO 8601 format YYYY-MM-DD (e.g., "1995-06-24")
- height: Height in centimeters (numeric, e.g., 180)
- weight: Weight in kilograms (numeric, e.g., 75)
- jersey_number: Shirt number (integer 1-99, e.g., 10)
- gender: Must be exactly "male" or "female" (lowercase)

Output format: CSV with headers
Example:
name,position,nationality,birth_date,height,weight,jersey_number,gender
Lionel Messi,Forward,Argentina,1987-06-24,170,72,10,male
Alexia Putellas,Midfielder,Spain,1994-02-04,170,65,11,female
Kevin De Bruyne,Midfielder,Belgium,1991-06-28,181,70,17,male`,
      downloadTemplate: downloadPlayerTemplate
    },
    {
      id: 'teams',
      label: t('ingestion.teams'),
      description: t('ingestion.teamsDesc'),
      icon: Shield,
      fields: ['name', 'short_name', 'country', 'gender', 'founded_year', 'stadium', 'manager'],
      aiPrompt: `Transform the following team data into CSV format with these exact columns: name, short_name, country, gender, founded_year, stadium, manager.

Requirements:
- name: Full official team name
- short_name: Abbreviated team name (3-4 characters, e.g., "RMA", "FCB", "MCI")
- country: Must match one of the 60+ predefined countries (e.g., "England", "Spain", "Argentina", "Brazil")
- gender: Must be exactly "male" or "female" (lowercase)
- founded_year: Year team was founded (4-digit integer, e.g., 1902)
- stadium: Home stadium name (must match existing venue in database)
- manager: Current team manager/coach name

Output format: CSV with headers
Example:
name,short_name,country,gender,founded_year,stadium,manager
Real Madrid,RMA,Spain,male,1902,Santiago Bernabéu,Carlo Ancelotti
FC Barcelona,FCB,Spain,female,1970,Camp Nou,Jonatan Giráldez
Manchester City,MCI,England,male,1880,Etihad Stadium,Pep Guardiola`,
      downloadTemplate: downloadTeamTemplate
    }
  ];

  const handleImport = (modelType: ModelType) => {
    setSelectedModel(modelType);
    setShowImportDialog(true);
  };

  const handleImportSuccess = () => {
    // Refresh data or show notification
    console.log('Import successful for', selectedModel);
  };

  const handleCopyPrompt = async (modelId: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(modelId);
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const batches = batchesData?.batches || [];
  const total = batchesData?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      queued: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Queued' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
      conflicts: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Has Conflicts' },
      failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
      success: { bg: 'bg-green-100', text: 'text-green-700', label: 'Success' },
    };
    const config = statusConfig[status] || statusConfig.queued;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {t('ingestion.title')}
        </h1>
        <p className="text-gray-600">
          {t('ingestion.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('upload')}
            className={`${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            <Upload size={18} />
            Upload Data
          </button>
          <button
            onClick={() => {
              setActiveTab('batches');
              refetch();
            }}
            className={`${
              activeTab === 'batches'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            <History size={18} />
            Batches History
            {total > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs font-medium">
                {total}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Upload Tab Content */}
      {activeTab === 'upload' && (
        <div>

      {/* Important Notice */}
      <div className="mb-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-yellow-900 mb-1">
              {t('ingestion.adminOnly')}
            </h3>
            <p className="text-sm text-yellow-800">
              {t('ingestion.adminOnlyDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Import Card - Featured */}
      <div className="mb-8 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6 hover:shadow-xl transition-shadow">
        <div className="flex items-start gap-4">
          <div className="bg-purple-100 p-4 rounded-lg">
            <Upload size={32} className="text-purple-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-bold text-gray-900">{t('ingestion.bulk')}</h3>
              <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded-full font-semibold">
                NEW
              </span>
            </div>
            <p className="text-gray-700 mb-4">
              {t('ingestion.bulkDesc')}
            </p>
            
            {/* AI Prompt for Bulk */}
            <div className="bg-white/80 border border-purple-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-purple-900 uppercase flex items-center gap-1">
                  <span>🤖</span> {t('ingestion.aiPromptTitle')}
                </h4>
                <button
                  onClick={() => handleCopyPrompt('bulk', t('ingestion.bulkPrompt'))}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  {copiedPrompt === 'bulk' ? (
                    <>
                      <Check size={12} />
                      {t('ingestion.aiPromptCopied')}
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      {t('ingestion.aiPromptCopy')}
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-purple-800 leading-relaxed">
                {t('ingestion.bulkTemplateNote')}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleImport('bulk' as ModelType)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                <Upload size={18} />
                {t('ingestion.importData')}
              </button>
              <button
                onClick={() => downloadBulkTemplate('csv')}
                className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium"
              >
                <FileText size={18} />
                {t('ingestion.downloadTemplate')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {models.map((model) => (
          <div
            key={model.id}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
          >
            {/* Icon and Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <model.icon size={28} className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{model.label}</h3>
                <p className="text-sm text-gray-600">{model.description}</p>
              </div>
            </div>

            {/* Fields */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase">
                {t('ingestion.requiredFields')}
              </h4>
              <div className="flex flex-wrap gap-1">
                {model.fields.slice(0, 4).map((field) => (
                  <span
                    key={field}
                    className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                  >
                    {field}
                  </span>
                ))}
                {model.fields.length > 4 && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                    +{model.fields.length - 4} more
                  </span>
                )}
              </div>
            </div>

            {/* AI Prompt */}
            <div className="mb-4">
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-purple-900 uppercase flex items-center gap-1">
                    <span>🤖</span> {t('ingestion.aiPromptTitle')}
                  </h4>
                  <button
                    onClick={() => handleCopyPrompt(model.id, model.aiPrompt)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    title={t('ingestion.aiPromptCopyTooltip')}
                  >
                    {copiedPrompt === model.id ? (
                      <>
                        <Check size={12} />
                        {t('ingestion.aiPromptCopied')}
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        {t('ingestion.aiPromptCopy')}
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-purple-800 leading-relaxed">
                  {t('ingestion.aiPromptDescription')}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleImport(model.id)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload size={16} />
                {t('ingestion.importData')}
              </button>
              <button
                onClick={() => model.downloadTemplate('csv')}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText size={16} />
                {t('ingestion.downloadTemplate')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Validation Rules Info */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-4">
          {t('ingestion.validationRules')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">{t('ingestion.countries')}</h4>
            <p className="text-blue-800">
              {t('ingestion.countriesDesc')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">{t('ingestion.playerPositions')}</h4>
            <p className="text-blue-800">
              {t('ingestion.playerPositionsDesc')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">{t('ingestion.genders')}</h4>
            <p className="text-blue-800">
              {t('ingestion.gendersDesc')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">{t('ingestion.surfaces')}</h4>
            <p className="text-blue-800">
              {t('ingestion.surfacesDesc')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">{t('ingestion.duplicates')}</h4>
            <p className="text-blue-800">
              {t('ingestion.duplicatesDesc')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">{t('ingestion.matches')}</h4>
            <p className="text-blue-800">
              {t('ingestion.matchesDesc')}
            </p>
          </div>
        </div>
      </div>

        </div>
      )}

      {/* Batches History Tab Content */}
      {activeTab === 'batches' && (
        <div>
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={modelFilter}
                  onChange={(e) => {
                    setModelFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Models</option>
                  <option value="competitions">Competitions</option>
                  <option value="venues">Venues</option>
                  <option value="referees">Referees</option>
                  <option value="players">Players</option>
                  <option value="teams">Teams</option>
                </select>
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="queued">Queued</option>
                  <option value="in_progress">Processing</option>
                  <option value="conflicts">Has Conflicts</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Showing {batches.length} of {total} batches
            </div>
          </div>

          {/* Batches Table */}
          {batchesLoading && (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
              Loading batches...
            </div>
          )}

          {!batchesLoading && batches.length === 0 && (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-600">
              No batches found. Upload your first batch using the "Upload Data" tab.
            </div>
          )}

          {!batchesLoading && batches.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Batch Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Model
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total / Inserted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conflicts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.created')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.expiresAt')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('ingestion.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {batches.map((batch) => (
                    <tr key={batch.ingestion_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {batch.batch_name}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {batch.ingestion_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 capitalize">
                          {batch.target_model}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(batch.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {batch.total} / {batch.inserted}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <span className="text-yellow-600 font-medium">
                            {batch.conflicts_open}
                          </span>
                          {' / '}
                          <span className="text-green-600">
                            {batch.accepted}
                          </span>
                          {' / '}
                          <span className="text-red-600">
                            {batch.rejected}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {t('ingestion.conflictsBreakdown')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(batch.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {batch.expires_at ? (
                          <div>
                            <div>{new Date(batch.expires_at).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-400">
                              {Math.ceil((new Date(batch.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} {t('ingestion.daysRemaining')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => navigate(`/admin/ingestion/${batch.ingestion_id}`)}
                          className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                        >
                          {t('ingestion.viewDetails')}
                          <ExternalLink size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Page {page} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {selectedModel && (
        <DataIngestionDialog
          modelType={selectedModel}
          isOpen={showImportDialog}
          onClose={() => {
            setShowImportDialog(false);
            setSelectedModel(null);
          }}
          onSuccess={handleImportSuccess}
          downloadTemplate={
            selectedModel === 'bulk' 
              ? downloadBulkTemplate 
              : (models.find(m => m.id === selectedModel)?.downloadTemplate || (() => {}))
          }
        />
      )}
    </div>
  );
}
