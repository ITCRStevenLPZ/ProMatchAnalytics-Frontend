import React, { useEffect, useRef, useState } from 'react';
import { useMatchLogStore } from '../../store/useMatchLogStore';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface MatchTimerProps {
  onTimeUpdate?: (time: string) => void;
}

export const MatchTimer: React.FC<MatchTimerProps> = ({ onTimeUpdate }) => {
  const { operatorClock, setOperatorClock } = useMatchLogStore();

  const parseTime = (timeStr: string) => {
    const [minSec, ms] = timeStr.split('.');
    const [min, sec] = minSec.split(':').map(Number);
    return min * 60 * 1000 + sec * 1000 + Number(ms || 0);
  };

  const [isRunning, setIsRunning] = useState(false);
  const [timeMs, setTimeMs] = useState(() => parseTime(operatorClock || '00:00.000'));
  const lastTickRef = useRef<number | null>(null);
  const runStartRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestTimeRef = useRef(timeMs);

  const formatDisplayTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatStoreTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds
      .toString()
      .padStart(3, '0')}`;
  };

  useEffect(() => {
    if (!isRunning) {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      lastTickRef.current = null;
      runStartRef.current = null;
      return;
    }

    const now = Date.now();
    lastTickRef.current = now;
    if (runStartRef.current === null) {
      runStartRef.current = now - latestTimeRef.current;
    }
    tickIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const previousTick = lastTickRef.current ?? now;
      const delta = now - previousTick;
      lastTickRef.current = now;

      setTimeMs(prev => {
        const newTime = prev + delta;
        latestTimeRef.current = newTime;
        if (onTimeUpdate) {
          onTimeUpdate(formatStoreTime(newTime));
        }
        return newTime;
      });
    }, 50);

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [isRunning, onTimeUpdate]);

  useEffect(() => {
    latestTimeRef.current = timeMs;
  }, [timeMs]);

  useEffect(() => {
    if (isRunning) {
      backupIntervalRef.current = setInterval(() => {
        const currentTime =
          runStartRef.current !== null ? Date.now() - runStartRef.current : latestTimeRef.current;
        latestTimeRef.current = currentTime;
        setOperatorClock(formatStoreTime(currentTime));
      }, 5000);
    } else {
      if (backupIntervalRef.current) {
        clearInterval(backupIntervalRef.current);
        backupIntervalRef.current = null;
      }
      setOperatorClock(formatStoreTime(latestTimeRef.current));
    }

    return () => {
      if (backupIntervalRef.current) {
        clearInterval(backupIntervalRef.current);
        backupIntervalRef.current = null;
      }
    };
  }, [isRunning, setOperatorClock]);

  const toggleTimer = () => {
    setIsRunning(prev => {
      const next = !prev;
      if (next) {
        const now = Date.now();
        lastTickRef.current = now;
        runStartRef.current = now - latestTimeRef.current;
      } else {
        lastTickRef.current = null;
        runStartRef.current = null;
      }
      return next;
    });
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeMs(0);
    latestTimeRef.current = 0;
    runStartRef.current = null;
    setOperatorClock('00:00.000');
    if (onTimeUpdate) onTimeUpdate('00:00.000');
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col items-center">
      <div className="text-4xl font-mono font-bold text-gray-900 mb-4">
        {formatDisplayTime(timeMs)}
      </div>

      <div className="flex gap-2">
        <button
          onClick={toggleTimer}
          className={`p-2 rounded-full ${
            isRunning
              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          {isRunning ? <Pause size={24} /> : <Play size={24} />}
        </button>

        <button
          onClick={resetTimer}
          className="p-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          <RotateCcw size={24} />
        </button>
      </div>
      <div className="text-xs text-gray-400 mt-2">
        {isRunning ? 'Backing up every 5s...' : 'Paused'}
      </div>
    </div>
  );
};
