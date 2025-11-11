import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Users, Calendar, MapPin, Shield, User as UserIcon, Activity } from 'lucide-react';
import { getDashboardStats } from '../lib/dashboard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: getDashboardStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading dashboard statistics</p>
      </div>
    );
  }

  const totalCount = stats?.total_counts || {
    competitions: 0,
    teams: 0,
    players: 0,
    venues: 0,
    referees: 0,
    matches: 0,
    events: 0,
  };

  const matchStatus = stats?.match_status || {
    live: 0,
    scheduled: 0,
    completed: 0,
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('title')}</h1>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalMatches')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.matches.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">
                {matchStatus.live > 0 && (
                  <span className="text-red-600 font-medium">{matchStatus.live} {t('liveNow')}</span>
                )}
              </p>
            </div>
            <div className="p-3 bg-primary-100 rounded-lg">
              <Trophy className="text-primary-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalTeams')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.teams.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats?.gender_distribution && (
                  <>
                    {stats.gender_distribution.teams.male}M / {stats.gender_distribution.teams.female}F
                  </>
                )}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Users className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalPlayers')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.players.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <UserIcon className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('totalEvents')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.events.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Activity className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('competitions')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.competitions.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Trophy className="text-purple-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('venues')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.venues.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-lg">
              <MapPin className="text-indigo-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('referees')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount.referees.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <Shield className="text-gray-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t('completedMatches')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{matchStatus.completed.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Calendar className="text-green-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Match Status & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('matchStatus')}</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="font-medium text-gray-900">{t('liveMatches')}</span>
              </div>
              <span className="text-2xl font-bold text-red-600">{matchStatus.live}</span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="font-medium text-gray-900">{t('scheduledMatches')}</span>
              </div>
              <span className="text-2xl font-bold text-blue-600">{matchStatus.scheduled}</span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="font-medium text-gray-900">{t('completedMatches')}</span>
              </div>
              <span className="text-2xl font-bold text-green-600">{matchStatus.completed}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t('recentActivity')}</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{t('newMatches')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('last7Days')}</p>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {stats?.recent_activity?.matches || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{t('newTeams')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('last7Days')}</p>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {stats?.recent_activity?.teams || 0}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{t('newPlayers')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('last7Days')}</p>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {stats?.recent_activity?.players || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link to="/matches" className="card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{t('viewMatches')}</h3>
            <Trophy className="text-primary-600" size={20} />
          </div>
          <p className="text-sm text-gray-600">{t('viewAllMatches')}</p>
        </Link>

        <Link to="/admin/teams" className="card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{t('manageTeams')}</h3>
            <Users className="text-green-600" size={20} />
          </div>
          <p className="text-sm text-gray-600">{t('manageTeamsDesc')}</p>
        </Link>

        <Link to="/admin/players" className="card hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{t('managePlayers')}</h3>
            <UserIcon className="text-blue-600" size={20} />
          </div>
          <p className="text-sm text-gray-600">{t('managePlayersDesc')}</p>
        </Link>
      </div>
    </div>
  );
}
