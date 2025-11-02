/**
 * WebSocket Hook for Real-Time Match Logging
 * Based on Section 4.3: Data Synchronization Flow (Offline-First Strategy)
 * 
 * Implements:
 * - WebSocket connection lifecycle (onopen, onclose, onmessage)
 * - syncQueue: Syncs queued events on reconnection
 * - sendEvent: Sends event or queues if offline
 * - Automatic reconnection handling
 */
import { useEffect, useRef, useCallback } from 'react';
import { useMatchLogStore, MatchEvent } from '../store/useMatchLogStore';
import { auth } from '../lib/firebase';

interface UseMatchSocketProps {
  matchId: string;
  enabled?: boolean;
}

interface UseMatchSocketReturn {
  sendEvent: (event: Omit<MatchEvent, 'match_id' | 'timestamp'>) => void;
  isConnected: boolean;
}

/**
 * Custom hook for WebSocket connection to match logging endpoint
 * Implements Section 4.3: Data Synchronization Flow
 */
export const useMatchSocket = ({
  matchId,
  enabled = true,
}: UseMatchSocketProps): UseMatchSocketReturn => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  
  const {
    isConnected,
    setConnected,
    queuedEvents,
    addLiveEvent,
    addQueuedEvent,
    removeQueuedEvent,
  } = useMatchLogStore();
  
  /**
   * Sync Queue Function (Section 4.3, Step 6)
   * Sends all queued events and removes them on success
   */
  const syncQueue = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    
    console.log(`Syncing ${queuedEvents.length} queued events...`);
    
    for (const event of queuedEvents) {
      try {
        wsRef.current.send(JSON.stringify(event));
        // Remove from queue after successful send
        removeQueuedEvent(event);
        console.log('✓ Event synced:', event.type);
      } catch (error) {
        console.error('✗ Failed to sync event:', error);
        break; // Stop syncing on error
      }
    }
  }, [queuedEvents, removeQueuedEvent]);
  
  /**
   * Send Event Function
   * Implements Section 4.3, Steps 7-9
   * - If connected: send via WebSocket
   * - If not connected or send fails: queue to IndexedDB
   */
  const sendEvent = useCallback(
    (eventData: Omit<MatchEvent, 'match_id' | 'timestamp'>) => {
      const event: MatchEvent = {
        ...eventData,
        match_id: matchId,
        timestamp: new Date().toISOString(),
      };
      
      // Step 8: Optimistic UI - immediately add to liveEvents
      addLiveEvent(event);
      
      // Step 9: Send/Queue Logic
      if (isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(event));
          console.log('✓ Event sent:', event.type);
        } catch (error) {
          console.error('✗ Send failed, queuing event:', error);
          addQueuedEvent(event);
        }
      } else {
        // Not connected - immediately queue to IndexedDB
        console.log('⚠ Offline, queuing event:', event.type);
        addQueuedEvent(event);
      }
    },
    [matchId, isConnected, addLiveEvent, addQueuedEvent]
  );
  
  /**
   * Initialize WebSocket connection
   */
  const connect = useCallback(async () => {
    if (!enabled || !matchId) return;
    
    try {
      // Get Firebase token for authentication
      const user = auth.currentUser;
      if (!user) {
        console.error('No authenticated user');
        return;
      }
      
      const token = await user.getIdToken();
      
      // WebSocket URL: ws://localhost:8000/ws/{match_id}?token={token}
      const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8000'}/ws/${matchId}?token=${token}`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      // Step 6: On-Connect Handler (Section 4.3)
      ws.onopen = () => {
        console.log('✓ WebSocket connected');
        setConnected(true); // Update store
        
        // Sync queued events
        syncQueue();
      };
      
      // Step 10: On-Disconnect Handler (Section 4.3)
      ws.onclose = (event) => {
        console.log('✗ WebSocket disconnected:', event.code, event.reason);
        setConnected(false); // Update store
        
        // Attempt reconnection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 3000);
      };
      
      // Handle incoming messages (confirmations, broadcasts)
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          // Handle acknowledgment
          if (message.type === 'ack') {
            console.log('✓ Event acknowledged:', message.result);
          }
          
          // Handle broadcast events from other loggers
          if (message._confirmed) {
            console.log('✓ Broadcast event received:', message.type);
            // Could update UI to show events from other loggers
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      // Handle errors
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnected(false);
    }
  }, [enabled, matchId, setConnected, syncQueue]);
  
  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnected(false);
  }, [setConnected]);
  
  /**
   * Effect: Connect on mount, disconnect on unmount
   */
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  return {
    sendEvent,
    isConnected,
  };
};
