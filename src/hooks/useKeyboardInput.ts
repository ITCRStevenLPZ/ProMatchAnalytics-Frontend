import { useState, useEffect, useCallback, useRef } from 'react';

interface KeyboardConfig {
  onNumberCommit?: (number: number) => void;
  onKeyAction?: (key: string) => void;
  disabled?: boolean;
}

export const useKeyboardInput = ({ onNumberCommit, onKeyAction, disabled = false }: KeyboardConfig) => {
  const [buffer, setBuffer] = useState<string>('');
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearBuffer = useCallback(() => {
    setBuffer('');
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled) return;

    const key = event.key;

    // Handle Numbers (0-9)
    if (/^[0-9]$/.test(key)) {
      setBuffer(prev => prev + key);
      
      // Reset buffer clear timeout
      if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = setTimeout(() => {
        // Auto-commit if needed, or just clear? 
        // For jersey numbers, usually we want explicit Enter or a slightly longer timeout.
        // Let's keep it simple: clear after 2 seconds of inactivity if not committed.
        setBuffer('');
      }, 3000);
      return;
    }

    // Handle Enter (Commit Buffer)
    if (key === 'Enter') {
      if (buffer) {
        onNumberCommit?.(parseInt(buffer, 10));
        clearBuffer();
      }
      return;
    }

    // Handle Backspace (Edit Buffer)
    if (key === 'Backspace') {
      if (buffer) {
        setBuffer(prev => prev.slice(0, -1));
        return;
      }
    }

    // Handle Escape (Clear Buffer or Cancel)
    if (key === 'Escape') {
      if (buffer) {
        clearBuffer();
        event.stopPropagation(); // Stop propagation if we just cleared buffer
        return;
      }
      // If no buffer, let it bubble up or handle as 'Escape' action
    }

    // Handle other mapped keys
    // We pass the key to the parent to decide what to do
    onKeyAction?.(key);

  }, [disabled, buffer, onNumberCommit, onKeyAction, clearBuffer]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    buffer,
    clearBuffer
  };
};
