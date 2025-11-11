import { useState } from 'react';
import { apiClient } from '../lib/api';

interface ChangeDetail {
  field: string;
  original_value: any;
  modified_value: any;
  similarity: number;
  change_percentage: number;
}

interface ChangeDetectionResult {
  change_percentage: number;
  has_significant_changes: boolean;
  changes: ChangeDetail[];
  field_count: number;
}

interface DuplicateCheckResult {
  has_duplicates: boolean;
  count: number;
  duplicates: any[];
}

interface CombinedDetectionResult {
  changes: ChangeDetectionResult;
  duplicates?: DuplicateCheckResult | null;
}

export const useChangeDetection = () => {
  const [detecting, setDetecting] = useState(false);
  const [changeResult, setChangeResult] = useState<ChangeDetectionResult | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);

  const detectChanges = async (
    entityType: 'players' | 'teams' | 'venues' | 'referees' | 'competitions',
    entityId: string,
    modifiedData: any,
    checkDuplicates: boolean = false
  ): Promise<ChangeDetectionResult> => {
    setDetecting(true);
    try {
      // Add check_duplicates flag to the request
      const payload = {
        ...modifiedData,
        check_duplicates: checkDuplicates
      };
      
      const response = await apiClient.post<CombinedDetectionResult>(
        `/admin/detect-changes/${entityType}/${entityId}`,
        payload
      );
      
      // Extract change detection result
      const changes = response.changes;
      setChangeResult(changes);
      
      // Extract duplicate result if available
      if (response.duplicates) {
        setDuplicateResult(response.duplicates);
      }
      
      return changes;
    } catch (error) {
      console.error('Change detection failed:', error);
      const fallback: ChangeDetectionResult = {
        change_percentage: 0,
        has_significant_changes: false,
        changes: [],
        field_count: 0
      };
      setChangeResult(fallback);
      return fallback;
    } finally {
      setDetecting(false);
    }
  };

  const clearChangeResult = () => {
    setChangeResult(null);
    setDuplicateResult(null);
  };

  return {
    detectChanges,
    detecting,
    changeResult,
    duplicateResult,
    clearChangeResult
  };
};
