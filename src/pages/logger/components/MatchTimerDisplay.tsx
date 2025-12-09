import React from 'react';
import { Play, Pause } from 'lucide-react';
import { Match } from '../types';

interface MatchTimerDisplayProps {
  match: Match | null;
  operatorPeriod: number;
  globalClock: string;
  effectiveClock: string;
  ineffectiveClock: string;
  timeOffClock: string;
  clockMode: 'EFFECTIVE' | 'INEFFECTIVE' | 'TIMEOFF';
  isClockRunning: boolean;
  onGlobalStart: () => void;
  onGlobalStop: () => void;
  isBallInPlay?: boolean;
  locked?: boolean;
  lockReason?: string;
  onModeSwitch: (mode: 'EFFECTIVE' | 'INEFFECTIVE' | 'TIMEOFF') => void;
  t: any;
}

const MatchTimerDisplay: React.FC<MatchTimerDisplayProps> = ({
  match,
  operatorPeriod,
  globalClock,
  effectiveClock,
  ineffectiveClock,
  timeOffClock,
  clockMode,
  isClockRunning,
  onGlobalStart,
  onGlobalStop,
  isBallInPlay = false,
  locked = false,
  lockReason,
  onModeSwitch,
  t,
}) => {
  const startDisabled = locked || !!match?.current_period_start_timestamp;
  const stopDisabled = locked || (!match?.current_period_start_timestamp && !(match?.period_timestamps?.[String(operatorPeriod)]?.start && !match?.period_timestamps?.[String(operatorPeriod)]?.end));
  const modeSwitchDisabled = locked || !match?.current_period_start_timestamp;
  const lockNotice = lockReason || t('lockNotice', 'Cockpit locked. Match is finished.');
  const trimMs = (value: string) => value.split('.')[0] || value;
  const globalClockDisplay = trimMs(globalClock);

  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200">
      {locked && (
        <div className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" data-testid="clock-locked-banner">
          {lockNotice}
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-700">{t('globalClock', 'Global Clock')}</p>
          {isClockRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
        <span className={`text-xl font-mono font-bold ${isClockRunning ? 'text-green-700' : 'text-gray-900'}`}>
          {globalClockDisplay}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3 bg-white border border-gray-200 rounded-md px-3 py-2">
        <span className="text-sm font-semibold text-gray-700">
          {isBallInPlay ? t('ballInPlay', 'Balón en Juego') : t('ballOutOfPlay', 'Balón Fuera')}
        </span>
        <button
          type="button"
          data-testid="effective-time-toggle"
          onClick={isBallInPlay ? onGlobalStop : onGlobalStart}
          className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={locked}
        >
          {isBallInPlay ? t('stopClock', 'Detener reloj') : t('startClock', 'Iniciar reloj')}
        </button>
      </div>

      {/* Global Controls */}
      <div className="flex justify-center gap-2 mb-4">
        <button
          data-testid="btn-start-clock"
          onClick={onGlobalStart}
          disabled={startDisabled}
          className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Play size={12} />
          {t('start', 'Start')}
        </button>
        <button
          data-testid="btn-stop-clock"
          onClick={onGlobalStop}
          disabled={stopDisabled}
          className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Pause size={12} />
          {t('stop', 'Stop')}
        </button>
      </div>

      {/* Sub Clocks */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div
          className={`p-2 rounded border bg-gray-50 ${clockMode === 'EFFECTIVE' ? 'border-green-200 ring-1 ring-green-200' : 'border-gray-200'}`}
          data-testid="effective-time-card"
        >
          <p className="text-xs text-gray-500 mb-1">{t('effectiveTime', 'Tiempo Efectivo')}</p>
          <div className="font-mono font-semibold text-green-700" data-testid="effective-clock-value">{effectiveClock}</div>
        </div>
        <div className={`p-2 rounded border ${clockMode === 'INEFFECTIVE' ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-200'}`}>
          <p className="text-xs text-gray-500 mb-1">{t('ineffectiveTime', 'Tiempo Inefectivo')}</p>
          <div className="font-mono font-semibold text-red-700">{trimMs(ineffectiveClock)}</div>
        </div>
        <div className={`p-2 rounded border ${clockMode === 'TIMEOFF' ? 'bg-blue-50 border-blue-200' : 'bg-gray-100 border-gray-200'}`}>
          <p className="text-xs text-gray-500 mb-1">{t('timeOff', 'Tiempo Fuera')}</p>
          <div className="font-mono font-semibold text-blue-700">{trimMs(timeOffClock)}</div>
        </div>
      </div>

      {/* Mode Controls */}
      <div className="flex flex-col gap-2">
        {clockMode === 'EFFECTIVE' ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              data-testid="btn-ineffective-event"
              onClick={() => onModeSwitch('INEFFECTIVE')}
              className="flex items-center justify-center gap-2 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
              disabled={modeSwitchDisabled}
            >
              <Pause size={14} />
              {t('ineffectiveEvent', 'Ineffective Event')}
            </button>
            <button
              data-testid="btn-time-off"
              onClick={() => onModeSwitch('TIMEOFF')}
              className="flex items-center justify-center gap-2 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
              disabled={modeSwitchDisabled}
            >
              <Pause size={14} />
              {t('timeOffEvent', 'Time Off')}
            </button>
          </div>
        ) : (
          <button
            data-testid="btn-resume-effective"
            onClick={() => onModeSwitch('EFFECTIVE')}
            className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 text-white hover:bg-green-700 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={locked}
          >
            <Play size={14} />
            {t('resumeEffective', 'Resume Effective Time')}
          </button>
        )}
      </div>
    </div>
  );
};

export default MatchTimerDisplay;
