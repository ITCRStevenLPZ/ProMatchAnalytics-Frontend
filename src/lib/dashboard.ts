import { apiClient } from './api';

export interface DashboardStats {
  total_counts: {
    competitions: number;
    teams: number;
    players: number;
    venues: number;
    referees: number;
    matches: number;
    events: number;
  };
  match_status: {
    live: number;
    scheduled: number;
    completed: number;
  };
  recent_activity: {
    matches: number;
    teams: number;
    players: number;
  };
  gender_distribution: {
    teams: {
      male: number;
      female: number;
    };
    competitions: {
      male: number;
      female: number;
    };
  };
}

export const getDashboardStats = (): Promise<DashboardStats> => {
  return apiClient.get<DashboardStats>('/dashboard/stats');
};
