import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { Clock, Mail, LogOut } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

export default function GuestWaiting() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('guest_logout_failed', error);
    } finally {
      logout();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <LanguageSwitcher />
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut size={18} />
              <span>{t('guest.logout', 'Log out')}</span>
            </button>
          </div>

          <div className="text-center">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="text-yellow-600" size={40} />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {t('guest.title', 'Welcome to ProMatchAnalytics')}
          </h1>
          
          <div className="mb-6">
            <p className="text-lg font-medium text-gray-700 mb-2">
              {user?.displayName || user?.email}
            </p>
            <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
              {t('guest.role', 'Guest User')}
            </span>
          </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-gray-700 mb-2">
                {t('guest.message', 'Your account is pending approval. An administrator needs to grant you access to the platform.')}
              </p>
            </div>

            <div className="flex items-start gap-3 text-left bg-gray-50 rounded-lg p-4">
              <Mail className="text-gray-400 mt-1 flex-shrink-0" size={20} />
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-1">
                  {t('guest.contactTitle', 'Need immediate access?')}
                </p>
                <p>
                  {t('guest.contactMessage', 'Contact your system administrator to request analyst access.')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
