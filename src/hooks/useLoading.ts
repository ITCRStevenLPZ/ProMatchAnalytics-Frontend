import { useState, useCallback } from 'react';

interface UseLoadingReturn {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  startLoading: () => void;
  stopLoading: () => void;
  withLoading: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Custom hook for managing loading states across the application
 * Provides consistent loading state management for API calls and async operations
 * 
 * @param initialState - Initial loading state (default: false)
 * @returns Object with loading state and control functions
 * 
 * @example
 * const { loading, withLoading } = useLoading();
 * 
 * const fetchData = async () => {
 *   await withLoading(async () => {
 *     const data = await apiClient.get('/endpoint');
 *     setData(data);
 *   });
 * };
 */
export function useLoading(initialState = false): UseLoadingReturn {
  const [loading, setLoading] = useState(initialState);

  const startLoading = useCallback(() => {
    setLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setLoading(false);
  }, []);

  /**
   * Wraps an async function with automatic loading state management
   * Sets loading to true before execution and false after completion
   * Handles errors and ensures loading is stopped even if the function throws
   */
  const withLoading = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      setLoading(true);
      const result = await fn();
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    setLoading,
    startLoading,
    stopLoading,
    withLoading,
  };
}
