import { apiClient } from './api';

export interface CurrentUserResponse {
  firebase_uid: string;
  email: string;
  display_name?: string | null;
  photo_url?: string | null;
  role: 'admin' | 'analyst' | 'guest';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return apiClient.get<CurrentUserResponse>('/auth/me');
}
