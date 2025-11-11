import { useState } from 'react';
import { apiClient } from '../lib/api';

interface DuplicateResult {
  has_duplicates: boolean;
  count: number;
  duplicates: Array<{
    name: string;
    match_score: number;
    match_details: string[];
    similarity_score: number;
    [key: string]: any;
  }>;
}

export const useDuplicateCheck = () => {
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult | null>(null);

  const checkDuplicates = async (
    entityType: 'players' | 'teams' | 'venues' | 'referees' | 'competitions',
    data: any
  ): Promise<DuplicateResult> => {
    setChecking(true);
    try {
      const response: any = await apiClient.post(
        `/admin/check-duplicates/${entityType}`,
        data
      );
      setDuplicates(response.data);
      return response.data;
    } catch (error) {
      console.error('Duplicate check failed:', error);
      return { has_duplicates: false, count: 0, duplicates: [] };
    } finally {
      setChecking(false);
    }
  };

  const clearDuplicates = () => setDuplicates(null);

  return {
    checkDuplicates,
    checking,
    duplicates,
    clearDuplicates
  };
};
