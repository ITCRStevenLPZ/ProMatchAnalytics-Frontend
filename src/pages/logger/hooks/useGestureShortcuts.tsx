import { useCallback, useRef, useState } from 'react';

type SwipeDirection = 'left' | 'right' | 'up' | 'down';
type GestureAction = 'pass' | 'shot' | 'duel' | 'undo' | 'toggleTeam' | 'none';

interface GestureConfig {
  enabled?: boolean;
  minSwipeDistance?: number;
  maxSwipeTime?: number;
}

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

const SWIPE_ACTION_MAP: Record<SwipeDirection, GestureAction> = {
  right: 'pass',      // Swipe right = Pass (ball moving forward)
  left: 'undo',       // Swipe left = Undo
  up: 'shot',         // Swipe up = Shot (shooting at goal)
  down: 'toggleTeam', // Swipe down = Toggle team
};

export const useGestureShortcuts = (config: GestureConfig = {}) => {
  const { 
    enabled = true, 
    minSwipeDistance = 50,
    maxSwipeTime = 300,
  } = config;

  const startTouchRef = useRef<TouchPoint | null>(null);
  const [lastGesture, setLastGesture] = useState<GestureAction>('none');

  const getSwipeDirection = useCallback((
    start: TouchPoint, 
    end: TouchPoint
  ): SwipeDirection | null => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dt = end.time - start.time;

    // Check time constraint
    if (dt > maxSwipeTime) return null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Check distance constraint
    if (absDx < minSwipeDistance && absDy < minSwipeDistance) return null;

    // Determine primary direction
    if (absDx > absDy) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }, [minSwipeDistance, maxSwipeTime]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    startTouchRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !startTouchRef.current) return;
    
    const touch = e.changedTouches[0];
    const endPoint: TouchPoint = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };

    const direction = getSwipeDirection(startTouchRef.current, endPoint);
    if (direction) {
      const action = SWIPE_ACTION_MAP[direction];
      setLastGesture(action);
      
      // Reset after a short delay
      setTimeout(() => setLastGesture('none'), 500);
    }

    startTouchRef.current = null;
  }, [enabled, getSwipeDirection]);

  // Attach listeners
  const bindGestures = useCallback((element: HTMLElement | null) => {
    if (!element || !enabled) return () => {};

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);

  return {
    lastGesture,
    bindGestures,
    clearGesture: useCallback(() => setLastGesture('none'), []),
  };
};

// Visual indicator component for gesture feedback
import React from 'react';
import { ArrowRight, ArrowUp, ArrowLeft, ArrowDown, Undo2, Target, Shuffle, Users } from 'lucide-react';

interface GestureOverlayProps {
  activeGesture: GestureAction;
}

const GESTURE_VISUALS: Record<GestureAction, { icon: React.ReactNode; label: string; color: string }> = {
  pass: { icon: <ArrowRight size={32} />, label: 'Pass', color: 'bg-blue-500' },
  shot: { icon: <Target size={32} />, label: 'Shot', color: 'bg-red-500' },
  duel: { icon: <Shuffle size={32} />, label: 'Duel', color: 'bg-orange-500' },
  undo: { icon: <Undo2 size={32} />, label: 'Undo', color: 'bg-gray-500' },
  toggleTeam: { icon: <Users size={32} />, label: 'Switch Team', color: 'bg-purple-500' },
  none: { icon: null, label: '', color: '' },
};

export const GestureOverlay: React.FC<GestureOverlayProps> = ({ activeGesture }) => {
  if (activeGesture === 'none') return null;

  const visual = GESTURE_VISUALS[activeGesture];

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
      data-testid="gesture-overlay"
    >
      <div className={`
        ${visual.color} text-white p-6 rounded-2xl shadow-2xl
        animate-pulse flex flex-col items-center gap-2
        opacity-90
      `}>
        {visual.icon}
        <span className="text-lg font-bold">{visual.label}</span>
      </div>
    </div>
  );
};

// Gesture hints component
export const GestureHints: React.FC = () => {
  return (
    <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-600">
      <div className="font-medium mb-2">Touch Gestures:</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <ArrowRight size={14} />
          <span>Swipe right = Pass</span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUp size={14} />
          <span>Swipe up = Shot</span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowLeft size={14} />
          <span>Swipe left = Undo</span>
        </div>
        <div className="flex items-center gap-2">
          <ArrowDown size={14} />
          <span>Swipe down = Switch Team</span>
        </div>
      </div>
    </div>
  );
};
