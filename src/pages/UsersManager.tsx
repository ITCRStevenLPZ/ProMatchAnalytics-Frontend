import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Search, Shield, UserCheck, UserX, Info } from 'lucide-react';
import { apiClient } from '../lib/api';
import type { UserData, UserRole } from '../types';
import { useAuthStore } from '../store/authStore';

export default function UsersManager() {
  const { t } = useTranslation('admin');
  const currentUser = useAuthStore(state => state.user);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('guest');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔍 Fetching users from /admin/users...');
      const data = await apiClient.get<UserData[]>('/admin/users');
      console.log('✅ Users fetched successfully:', data);
      setUsers(data);
    } catch (err: any) {
      console.error('❌ Error fetching users:', err);
      console.error('Response:', err.response);
      setError(err.response?.data?.detail || t('errorFetchingData'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;

    try {
      setError(null);
      await apiClient.put(`/admin/users/${selectedUser._id}`, { role: newRole });
      setSuccess(t('roleUpdated'));
      await fetchUsers();
      setShowRoleModal(false);
      setSelectedUser(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorSavingData'));
    }
  };

  const handleToggleActive = async (user: UserData) => {
    // Prevent users from deactivating themselves
    if (user.firebase_uid === currentUser?.uid) {
      setError(t('cannotDeactivateSelf'));
      setTimeout(() => setError(null), 3000);
      return;
    }

    const newStatus = !user.is_active;
    const confirmMessage = newStatus ? t('confirmActivate') : t('confirmDeactivate');
    
    if (!window.confirm(confirmMessage)) return;

    try {
      setError(null);
      await apiClient.put(`/admin/users/${user._id}`, { is_active: newStatus });
      setSuccess(newStatus ? t('userActivated') : t('userDeactivated'));
      await fetchUsers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errorSavingData'));
    }
  };

  const handleOpenRoleModal = (user: UserData) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setShowRoleModal(true);
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'analyst': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'guest': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.firebase_uid.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <Users className="h-8 w-8 text-indigo-600" />
          <h1 className="text-3xl font-bold text-gray-900">{t('userManagement')}</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-900">×</button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-900">×</button>
        </div>
      )}

      <div className="card">
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

      <div className="card">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchTerm ? t('noData') : t('noUsers')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('email')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('displayName')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('role')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('userStatus')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('accountCreated')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user._id} className={`hover:bg-gray-50 ${!user.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {user.photo_url && (
                          <img src={user.photo_url} alt="" className="h-8 w-8 rounded-full mr-3" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.email}</div>
                          <div className="text-xs text-gray-500">{user.firebase_uid.substring(0, 12)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.display_name || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                        {t(`roles.${user.role}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.is_active ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <button 
                        onClick={() => handleOpenRoleModal(user)} 
                        className="text-blue-600 hover:text-blue-900" 
                        title={t('updateRole')}
                      >
                        <Shield className="h-5 w-5 inline" />
                      </button>
                      <button 
                        onClick={() => handleToggleActive(user)}
                        className={`${user.is_active ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}`}
                        title={user.is_active ? t('deactivateUser') : t('activateUser')}
                        disabled={user.firebase_uid === currentUser?.uid}
                      >
                        {user.is_active ? <UserX className="h-5 w-5 inline" /> : <UserCheck className="h-5 w-5 inline" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Update Modal */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold">{t('updateRole')}</h2>
              <p className="text-sm text-gray-500 mt-1">{selectedUser.email}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">{t('role')} *</label>
                <div className="space-y-3">
                  {(['admin', 'analyst', 'guest'] as UserRole[]).map((role) => (
                    <label
                      key={role}
                      className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        newRole === role
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        checked={newRole === role}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="mt-1 h-4 w-4 text-blue-600"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(role)}`}>
                            {t(`roles.${role}`)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2 flex items-start">
                          <Info className="h-4 w-4 mr-1 mt-0.5 flex-shrink-0" />
                          {t(`roleDescriptions.${role}`)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-900 mb-2">{t('details')}</h3>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('accountCreated')}:</dt>
                    <dd className="text-gray-900">{formatDate(selectedUser.created_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('lastUpdated')}:</dt>
                    <dd className="text-gray-900">{formatDate(selectedUser.updated_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('userStatus')}:</dt>
                    <dd className="text-gray-900">{selectedUser.is_active ? t('active') : t('inactive')}</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="flex justify-end space-x-3 p-6 border-t bg-gray-50">
              <button 
                type="button" 
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedUser(null);
                }} 
                className="btn btn-secondary"
              >
                {t('cancel')}
              </button>
              <button 
                type="button" 
                onClick={handleUpdateRole} 
                className="btn btn-primary"
                disabled={newRole === selectedUser.role}
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
