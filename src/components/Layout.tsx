import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Home, Users, Trophy, LogOut } from 'lucide-react';

export default function Layout() {
  const { user } = useAuthStore();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
  };

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Link to="/dashboard" className="flex items-center gap-2">
                <Trophy className="text-primary-600" size={32} />
                <span className="text-xl font-bold text-gray-900">ProMatchAnalytics</span>
              </Link>
              
              <nav className="hidden md:flex gap-4">
                <Link
                  to="/dashboard"
                  className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive('/dashboard')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Home size={20} className="inline mr-2" />
                  Dashboard
                </Link>
                <Link
                  to="/teams"
                  className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive('/teams')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Users size={20} className="inline mr-2" />
                  Teams
                </Link>
                <Link
                  to="/matches"
                  className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive('/matches')
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Trophy size={20} className="inline mr-2" />
                  Matches
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.displayName || user?.email}
                </p>
                <p className="text-xs text-gray-500">Analyst</p>
              </div>
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-10 h-10 rounded-full"
                />
              )}
              <button
                onClick={handleLogout}
                className="btn btn-secondary"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
