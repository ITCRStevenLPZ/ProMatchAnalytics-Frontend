import { 
  Clock, 
  CheckCircle2,
  Play,
  Coffee,
  Trophy,
  ChevronRight,
} from 'lucide-react';
import { Match } from '../types';
import { PeriodPhase } from '../hooks/usePeriodManager';

interface MatchPeriodSelectorProps {
  match: Match | null;
  operatorPeriod: number;
  currentPhase: PeriodPhase;
  isExtraTime: boolean;
  extraTimeSeconds: number;
  globalClock: string;
  isClockRunning: boolean;
  onTransitionToHalftime?: () => void;
  onTransitionToSecondHalf?: () => void;
  onTransitionToFulltime?: () => void;
  transitionDisabled?: boolean;
  transitionReason?: string;
  t: any;
}

export function MatchPeriodSelector({
  match,
  currentPhase,
  isExtraTime,
  extraTimeSeconds,
  globalClock,
  onTransitionToHalftime,
  onTransitionToSecondHalf,
  onTransitionToFulltime,
  transitionDisabled = false,
  transitionReason,
  t,
}: MatchPeriodSelectorProps) {
  if (!match) return null;

  // Determine current match status and what action is available
  const getMatchStatus = () => {
    switch (currentPhase) {
      case 'NOT_STARTED':
      case 'FIRST_HALF':
      case 'FIRST_HALF_EXTRA_TIME':
        return {
          stage: 'first-half',
          label: t('logger.period.firstHalfInProgress', '1st Half'),
          statusText: t('logger.period.inProgress', 'In Progress'),
          icon: Play,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          canTransition: true,
          transitionLabel: t('logger.period.endFirstHalf', 'End 1st Half'),
          transitionAction: onTransitionToHalftime,
          progress: 'first',
        };
      case 'HALFTIME':
        return {
          stage: 'halftime',
          label: t('logger.period.halftime', 'Halftime'),
          statusText: t('logger.period.break', 'Break'),
          icon: Coffee,
          iconColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          canTransition: true,
          transitionLabel: t('logger.period.startSecondHalf', 'Start 2nd Half'),
          transitionAction: onTransitionToSecondHalf,
          progress: 'halftime',
        };
      case 'SECOND_HALF':
      case 'SECOND_HALF_EXTRA_TIME':
        return {
          stage: 'second-half',
          label: t('logger.period.secondHalfInProgress', '2nd Half'),
          statusText: t('logger.period.inProgress', 'In Progress'),
          icon: Play,
          iconColor: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          canTransition: true,
          transitionLabel: t('logger.period.endSecondHalf', 'End Match'),
          transitionAction: onTransitionToFulltime,
          progress: 'second',
        };
      case 'FULLTIME':
        return {
          stage: 'fulltime',
          label: t('logger.period.fulltime', 'Full Time'),
          statusText: t('logger.period.matchEnded', 'Match Ended'),
          icon: Trophy,
          iconColor: 'text-purple-600',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200',
          canTransition: false,
          progress: 'complete',
        };
      default:
        return {
          stage: 'unknown',
          label: t('logger.period.unknown', 'Unknown'),
          statusText: '',
          icon: Clock,
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          canTransition: false,
          progress: 'first',
        };
    }
  };

  const status = getMatchStatus();
  const StatusIcon = status.icon;

  // Format extra time display
  const formatExtraTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `+${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const trimMs = (value: string) => value.split('.')[0] || value;
  const transitionTestId =
    status.stage === 'first-half'
      ? 'btn-end-first-half'
      : status.stage === 'halftime'
      ? 'btn-start-second-half'
      : status.stage === 'second-half'
      ? 'btn-end-match'
      : undefined;

  return (
    <div className="space-y-4">
      {/* Current Period Status Card */}
      <div
        className={`rounded-lg border-2 ${status.borderColor} ${status.bgColor} p-4 transition-all duration-300`}
        data-testid={`period-status-${status.stage}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`${status.iconColor} animate-pulse`}>
              <StatusIcon size={24} />
            </div>
            <div>
              <div className="text-sm text-gray-500 uppercase tracking-wide">
                {status.statusText}
              </div>
              <div className="text-xl font-bold text-gray-900">
                {status.label}
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-gray-900">
              {trimMs(globalClock)}
            </div>
            {isExtraTime && (
              <div className="text-sm font-semibold text-orange-600">
                {formatExtraTime(extraTimeSeconds)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Match Progress Timeline */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* First Half */}
          <div className={`flex-1 h-2 rounded-full transition-all duration-500 ${
            status.progress === 'first' ? 'bg-green-500 animate-pulse' :
            status.progress === 'halftime' || status.progress === 'second' || status.progress === 'complete' 
              ? 'bg-green-500' : 'bg-gray-200'
          }`} />
          
          {/* Halftime */}
          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-500 ${
            status.progress === 'halftime' ? 'border-yellow-500 bg-yellow-100' :
            status.progress === 'second' || status.progress === 'complete'
              ? 'border-yellow-500 bg-yellow-500' : 'border-gray-300 bg-white'
          }`}>
            {(status.progress === 'second' || status.progress === 'complete') && (
              <CheckCircle2 size={16} className="text-white" />
            )}
          </div>
          
          {/* Second Half */}
          <div className={`flex-1 h-2 rounded-full transition-all duration-500 ${
            status.progress === 'second' ? 'bg-blue-500 animate-pulse' :
            status.progress === 'complete' ? 'bg-blue-500' : 'bg-gray-200'
          }`} />
          
          {/* Full Time */}
          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-500 ${
            status.progress === 'complete' 
              ? 'border-purple-500 bg-purple-500' : 'border-gray-300 bg-white'
          }`}>
            {status.progress === 'complete' && (
              <Trophy size={16} className="text-white" />
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{t('logger.period.kickoff', 'Kickoff')}</span>
          <span>{t('logger.period.halftime', 'HT')}</span>
          <span>{t('logger.period.fulltime', 'FT')}</span>
        </div>
      </div>

      {/* Transition Action Button */}
      {status.transitionAction && (
        <button
          onClick={status.transitionAction}
          data-testid={transitionTestId}
          className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 
            transition-all duration-200 shadow-sm hover:shadow-md
            ${status.stage === 'first-half' 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : status.stage === 'halftime'
              ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
              : status.stage === 'second-half'
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-400 cursor-not-allowed text-white'
            }`}
          disabled={status.stage === 'fulltime' || transitionDisabled}
        >
          <span>{status.transitionLabel}</span>
          <ChevronRight size={20} />
        </button>
      )}

      {transitionDisabled && transitionReason && (
        <div className="text-xs text-red-600 text-center mt-2" data-testid="transition-blocked">
          {transitionReason}
        </div>
      )}

      {/* Match Info */}
      <div className="text-xs text-gray-500 text-center">
        {status.progress === 'complete' ? (
          t('logger.period.matchCompletedInfo', 'Match has ended. Review events or close session.')
        ) : (
          t('logger.period.matchProgressInfo', 'Use the button above to transition between match periods.')
        )}
      </div>
    </div>
  );
}
