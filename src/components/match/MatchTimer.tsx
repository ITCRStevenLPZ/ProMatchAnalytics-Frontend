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
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  const [isRunning, setIsRunning] = useState(false);
  const [timeMs, setTimeMs] = useState(() => parseTime(operatorClock || '00:00.000'));
  const timeRef = useRef(timeMs);
  timeRef.current = timeMs;

  // Tick interval (updates every second)
  useEffect(() => {
    if (!isRunning) return;
    const tick = setInterval(() => {
      const newTime = timeRef.current + 1000;
      timeRef.current = newTime; // Update ref immediately
      setTimeMs(newTime);
      if (onTimeUpdate) onTimeUpdate(formatStoreTime(newTime));
    }, 1000);
    return () => clearInterval(tick);
  }, [isRunning, onTimeUpdate]);

  // Backup interval (every 5 seconds)
  useEffect(() => {
    if (!isRunning) return;
    const backup = setInterval(() => {
      setOperatorClock(formatStoreTime(timeRef.current));
    }, 5000);
    return () => clearInterval(backup);
  }, [isRunning, setOperatorClock]);

  const toggleTimer = () => {
    setIsRunning(prev => {
      const next = !prev;
      if (next) {
        // Starting timer: immediate backup
        setOperatorClock(formatStoreTime(timeRef.current));
      } else {
        // Pausing timer: backup current time
        setOperatorClock(formatStoreTime(timeRef.current));
      }
      return next;
    });
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeMs(0);
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
          className={`p-2 rounded-full ${isRunning ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
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
