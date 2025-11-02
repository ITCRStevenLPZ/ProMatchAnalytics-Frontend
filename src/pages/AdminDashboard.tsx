import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { 
  Users, Trophy, MapPin, Flag, UserCog, Shield,
  Plus, Edit, Trash2, Search, X 
} from 'lucide-react';

// API Base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// TODO: Replace with types from ../types/index.ts
// These are placeholder interfaces for future implementation
/*
interface User {
  id?: string;
  email: string;
  display_name: string;
  role: 'Admin' | 'Logger' | 'Viewer';
  preferred_language?: string;
}

interface Competition {
  id?: string;
  name: string;
  season: string;
  country: string;
  logo_url?: string;
}

interface Venue {
  id?: string;
  name: string;
  city: string;
  country: string;
  capacity?: number;
}

interface Referee {
  id?: string;
  full_name: string;
  nationality: string;
  federation?: string;
}

interface Team {
  id?: string;
  name: string;
  short_name: string;
  logo_url?: string;
  manager?: {
    full_name: string;
    nationality: string;
  };
}

interface Player {
  id?: string;
  full_name: string;
  jersey_number: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  nationality: string;
  date_of_birth?: string;
  team_id: string;
}
*/

type ResourceType = 'competitions' | 'teams' | 'players' | 'venues' | 'referees' | 'users';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ResourceType>('competitions');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  // Fetch Firebase token
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const idToken = await user.getIdToken();
        setToken(idToken);
      } else {
        navigate('/login');
      }
    });
    
    return () => unsubscribe();
  }, [navigate]);

  // Fetch data when tab changes or token is available
  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [activeTab, token]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/admin/${activeTab}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch ${activeTab}`);
      }
      
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || t('admin.errorFetchingData'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('admin.confirmDelete'))) return;
    
    try {
      const response = await fetch(`${API_URL}/admin/${activeTab}/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete ${activeTab}`);
      }
      
      await fetchData();
    } catch (err: any) {
      setError(err.message || t('admin.errorDeletingData'));
    }
  };

  const handleSubmit = async (formData: any) => {
    try {
      const url = editingItem 
        ? `${API_URL}/admin/${activeTab}/${editingItem.id}`
        : `${API_URL}/admin/${activeTab}`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save ${activeTab}`);
      }
      
      setShowModal(false);
      setEditingItem(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || t('admin.errorSavingData'));
    }
  };

  const filteredData = data.filter((item) => {
    const query = searchQuery.toLowerCase();
    return JSON.stringify(item).toLowerCase().includes(query);
  });

  const tabs = [
    { id: 'competitions' as ResourceType, icon: Trophy, label: t('admin.competitions') },
    { id: 'teams' as ResourceType, icon: Shield, label: t('admin.teams') },
    { id: 'players' as ResourceType, icon: Users, label: t('admin.players') },
    { id: 'venues' as ResourceType, icon: MapPin, label: t('admin.venues') },
    { id: 'referees' as ResourceType, icon: Flag, label: t('admin.referees') },
    { id: 'users' as ResourceType, icon: UserCog, label: t('admin.users') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('admin.dashboard')}</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Tab Navigation */}
        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={20} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search and Create */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('admin.search')}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={handleCreate}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            {t('admin.create')}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              {t('admin.loading')}
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {t('admin.noData')}
            </div>
          ) : (
            <DataTable
              data={filteredData}
              resourceType={activeTab}
              onEdit={handleEdit}
              onDelete={handleDelete}
              t={t}
            />
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <ResourceModal
          resourceType={activeTab}
          editingItem={editingItem}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
          onSubmit={handleSubmit}
          t={t}
        />
      )}
    </div>
  );
}

// Data Table Component
interface DataTableProps {
  data: any[];
  resourceType: ResourceType;
  onEdit: (item: any) => void;
  onDelete: (id: string) => void;
  t: any;
}

function DataTable({ data, resourceType, onEdit, onDelete, t }: DataTableProps) {
  const renderRow = (item: any) => {
    switch (resourceType) {
      case 'competitions':
        return (
          <>
            <td className="px-6 py-4">{item.name}</td>
            <td className="px-6 py-4">{item.season}</td>
            <td className="px-6 py-4">{item.country}</td>
          </>
        );
      case 'teams':
        return (
          <>
            <td className="px-6 py-4">{item.name}</td>
            <td className="px-6 py-4">{item.short_name}</td>
            <td className="px-6 py-4">{item.manager?.full_name || '-'}</td>
          </>
        );
      case 'players':
        return (
          <>
            <td className="px-6 py-4">{item.full_name}</td>
            <td className="px-6 py-4">{item.jersey_number}</td>
            <td className="px-6 py-4">{item.position}</td>
            <td className="px-6 py-4">{item.nationality}</td>
          </>
        );
      case 'venues':
        return (
          <>
            <td className="px-6 py-4">{item.name}</td>
            <td className="px-6 py-4">{item.city}</td>
            <td className="px-6 py-4">{item.country}</td>
            <td className="px-6 py-4">{item.capacity || '-'}</td>
          </>
        );
      case 'referees':
        return (
          <>
            <td className="px-6 py-4">{item.full_name}</td>
            <td className="px-6 py-4">{item.nationality}</td>
            <td className="px-6 py-4">{item.federation || '-'}</td>
          </>
        );
      case 'users':
        return (
          <>
            <td className="px-6 py-4">{item.email}</td>
            <td className="px-6 py-4">{item.display_name}</td>
            <td className="px-6 py-4">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                item.role === 'Admin' ? 'bg-red-100 text-red-700' :
                item.role === 'Logger' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {item.role}
              </span>
            </td>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {resourceType === 'competitions' && (
            <>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.season')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.country')}</th>
            </>
          )}
          {resourceType === 'teams' && (
            <>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.shortName')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.manager')}</th>
            </>
          )}
          {resourceType === 'players' && (
            <>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.jerseyNumber')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.position')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.nationality')}</th>
            </>
          )}
          {resourceType === 'venues' && (
            <>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.city')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.country')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.capacity')}</th>
            </>
          )}
          {resourceType === 'referees' && (
            <>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.nationality')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.federation')}</th>
            </>
          )}
          {resourceType === 'users' && (
            <>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.email')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.displayName')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.role')}</th>
            </>
          )}
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('admin.actions')}</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50">
            {renderRow(item)}
            <td className="px-6 py-4 text-right space-x-2">
              <button
                onClick={() => onEdit(item)}
                className="text-blue-600 hover:text-blue-800"
              >
                <Edit size={18} />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="text-red-600 hover:text-red-800"
              >
                <Trash2 size={18} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Resource Modal Component
interface ResourceModalProps {
  resourceType: ResourceType;
  editingItem: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  t: any;
}

function ResourceModal({ resourceType, editingItem, onClose, onSubmit, t }: ResourceModalProps) {
  const [formData, setFormData] = useState<any>(editingItem || {});

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const renderFields = () => {
    switch (resourceType) {
      case 'competitions':
        return (
          <>
            <div>
              <label className="label">{t('admin.name')}</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.season')}</label>
              <input
                type="text"
                value={formData.season || ''}
                onChange={(e) => handleChange('season', e.target.value)}
                className="input"
                placeholder="2024/25"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.country')}</label>
              <input
                type="text"
                value={formData.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.logoUrl')}</label>
              <input
                type="url"
                value={formData.logo_url || ''}
                onChange={(e) => handleChange('logo_url', e.target.value)}
                className="input"
              />
            </div>
          </>
        );
      case 'teams':
        return (
          <>
            <div>
              <label className="label">{t('admin.name')}</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.shortName')}</label>
              <input
                type="text"
                value={formData.short_name || ''}
                onChange={(e) => handleChange('short_name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.logoUrl')}</label>
              <input
                type="url"
                value={formData.logo_url || ''}
                onChange={(e) => handleChange('logo_url', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('admin.managerName')}</label>
              <input
                type="text"
                value={formData.manager?.full_name || ''}
                onChange={(e) => handleChange('manager', { ...formData.manager, full_name: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('admin.managerNationality')}</label>
              <input
                type="text"
                value={formData.manager?.nationality || ''}
                onChange={(e) => handleChange('manager', { ...formData.manager, nationality: e.target.value })}
                className="input"
              />
            </div>
          </>
        );
      case 'players':
        return (
          <>
            <div>
              <label className="label">{t('admin.name')}</label>
              <input
                type="text"
                value={formData.full_name || ''}
                onChange={(e) => handleChange('full_name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.jerseyNumber')}</label>
              <input
                type="number"
                value={formData.jersey_number || ''}
                onChange={(e) => handleChange('jersey_number', parseInt(e.target.value))}
                className="input"
                min="1"
                max="99"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.position')}</label>
              <select
                value={formData.position || ''}
                onChange={(e) => handleChange('position', e.target.value)}
                className="input"
                required
              >
                <option value="">Select position</option>
                <option value="GK">GK - Goalkeeper</option>
                <option value="DF">DF - Defender</option>
                <option value="MF">MF - Midfielder</option>
                <option value="FW">FW - Forward</option>
              </select>
            </div>
            <div>
              <label className="label">{t('admin.nationality')}</label>
              <input
                type="text"
                value={formData.nationality || ''}
                onChange={(e) => handleChange('nationality', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.dateOfBirth')}</label>
              <input
                type="date"
                value={formData.date_of_birth || ''}
                onChange={(e) => handleChange('date_of_birth', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('admin.teamId')}</label>
              <input
                type="text"
                value={formData.team_id || ''}
                onChange={(e) => handleChange('team_id', e.target.value)}
                className="input"
                required
              />
            </div>
          </>
        );
      case 'venues':
        return (
          <>
            <div>
              <label className="label">{t('admin.name')}</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.city')}</label>
              <input
                type="text"
                value={formData.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.country')}</label>
              <input
                type="text"
                value={formData.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.capacity')}</label>
              <input
                type="number"
                value={formData.capacity || ''}
                onChange={(e) => handleChange('capacity', parseInt(e.target.value))}
                className="input"
                min="0"
              />
            </div>
          </>
        );
      case 'referees':
        return (
          <>
            <div>
              <label className="label">{t('admin.name')}</label>
              <input
                type="text"
                value={formData.full_name || ''}
                onChange={(e) => handleChange('full_name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.nationality')}</label>
              <input
                type="text"
                value={formData.nationality || ''}
                onChange={(e) => handleChange('nationality', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.federation')}</label>
              <input
                type="text"
                value={formData.federation || ''}
                onChange={(e) => handleChange('federation', e.target.value)}
                className="input"
              />
            </div>
          </>
        );
      case 'users':
        return (
          <>
            <div>
              <label className="label">{t('admin.email')}</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleChange('email', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.displayName')}</label>
              <input
                type="text"
                value={formData.display_name || ''}
                onChange={(e) => handleChange('display_name', e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t('admin.role')}</label>
              <select
                value={formData.role || ''}
                onChange={(e) => handleChange('role', e.target.value)}
                className="input"
                required
              >
                <option value="">Select role</option>
                <option value="Admin">Admin</option>
                <option value="Logger">Logger</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="label">{t('admin.preferredLanguage')}</label>
              <select
                value={formData.preferred_language || 'en'}
                onChange={(e) => handleChange('preferred_language', e.target.value)}
                className="input"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold">
            {editingItem ? t('admin.edit') : t('admin.create')} {t(`admin.${resourceType}`)}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
          {renderFields()}
          
          <div className="flex gap-4 pt-4">
            <button type="submit" className="btn btn-primary flex-1">
              {t('admin.save')}
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              {t('admin.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
