import { useState, useEffect, useCallback } from 'react';
import { Match } from '../types';
import { updateMatchStatus } from '../../../lib/loggerApi';

const FIRST_HALF_MINUTES = 45;
const SECOND_HALF_MINUTES = 90; // Total match time

export type PeriodPhase = 
  | 'NOT_STARTED'
  | 'FIRST_HALF'
  | 'FIRST_HALF_EXTRA_TIME'
  | 'HALFTIME'
  | 'SECOND_HALF'
  | 'SECOND_HALF_EXTRA_TIME'
  | 'FULLTIME';

interface PeriodInfo {
  period: number;
  phase: PeriodPhase;
  isExtraTime: boolean;
  extraTimeSeconds: number;
  shouldShowExtraTimeWarning: boolean;
  canTransitionToHalftime: boolean;
  canTransitionToSecondHalf: boolean;
}

// Map match status to phase
const statusToPhase = (status: string | undefined): PeriodPhase | null => {
  switch (status) {
    case 'Scheduled':
    case 'Pending':
      return 'NOT_STARTED';
    case 'Live':
    case 'Live_First_Half':
      return 'FIRST_HALF';
    case 'Halftime':
      return 'HALFTIME';
    case 'Live_Second_Half':
      return 'SECOND_HALF';
    case 'Fulltime':
    case 'Completed':
      return 'FULLTIME';
    default:
      return null;
  }
};

export const usePeriodManager = (
  match: Match | null,
  effectiveTime: number,
  clockMode: 'EFFECTIVE' | 'INEFFECTIVE' | 'TIMEOFF',
  isClockRunning: boolean,
  handleModeSwitch: (mode: 'EFFECTIVE' | 'INEFFECTIVE' | 'TIMEOFF') => void,
  fetchMatch: () => void,
  onTransitionError?: (info: { target: Match['status']; error: unknown }) => void,
) => {
  const [currentPhase, setCurrentPhase] = useState<PeriodPhase>('NOT_STARTED');
  const [operatorPeriod, setOperatorPeriod] = useState(1);
  const [showExtraTimeAlert, setShowExtraTimeAlert] = useState(false);

  // Initialize phase from match status
  useEffect(() => {
    if (match?.status) {
      const phaseFromStatus = statusToPhase(match.status);
      if (phaseFromStatus) {
        setCurrentPhase(phaseFromStatus);
        setOperatorPeriod(
          phaseFromStatus === 'SECOND_HALF' || 
          phaseFromStatus === 'SECOND_HALF_EXTRA_TIME' || 
          phaseFromStatus === 'FULLTIME' ? 2 : 1
        );
      }
    }
  }, [match?.status]);

  // Calculate current period info based on effective time and current phase
  const getPeriodInfo = useCallback((): PeriodInfo => {
    let phase: PeriodPhase = currentPhase;
    let period = operatorPeriod;
    let isExtraTime = false;
    let extraTimeSeconds = 0;
    let shouldShowExtraTimeWarning = false;
    
    // Can always transition (button is always enabled, logic handled on click)
    const canTransitionToHalftime = currentPhase === 'FIRST_HALF' || currentPhase === 'FIRST_HALF_EXTRA_TIME' || currentPhase === 'NOT_STARTED';
    const canTransitionToSecondHalf = currentPhase === 'HALFTIME';

    // Calculate extra time based on current phase
    if (currentPhase === 'FIRST_HALF' || currentPhase === 'FIRST_HALF_EXTRA_TIME') {
      period = 1;
      if (effectiveTime >= FIRST_HALF_MINUTES * 60) {
        phase = 'FIRST_HALF_EXTRA_TIME';
        isExtraTime = true;
        extraTimeSeconds = effectiveTime - (FIRST_HALF_MINUTES * 60);
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === 'SECOND_HALF' || currentPhase === 'SECOND_HALF_EXTRA_TIME') {
      period = 2;
      if (effectiveTime >= SECOND_HALF_MINUTES * 60) {
        phase = 'SECOND_HALF_EXTRA_TIME';
        isExtraTime = true;
        extraTimeSeconds = effectiveTime - (SECOND_HALF_MINUTES * 60);
        shouldShowExtraTimeWarning = true;
      }
    } else if (currentPhase === 'HALFTIME') {
      period = 1; // Still period 1 during halftime
    } else if (currentPhase === 'FULLTIME') {
      period = 2;
    }

    return {
      period,
      phase,
      isExtraTime,
      extraTimeSeconds,
      shouldShowExtraTimeWarning,
      canTransitionToHalftime,
      canTransitionToSecondHalf,
    };
  }, [effectiveTime, currentPhase, operatorPeriod]);

  const periodInfo = getPeriodInfo();

  // Update operator period based on phase
  useEffect(() => {
    if (currentPhase === 'SECOND_HALF' || currentPhase === 'SECOND_HALF_EXTRA_TIME' || currentPhase === 'FULLTIME') {
      setOperatorPeriod(2);
    } else {
      setOperatorPeriod(1);
    }
  }, [currentPhase]);

  // Show extra time alert
  useEffect(() => {
    if (periodInfo.shouldShowExtraTimeWarning && isClockRunning && clockMode === 'EFFECTIVE') {
      setShowExtraTimeAlert(true);
    }
  }, [periodInfo.shouldShowExtraTimeWarning, isClockRunning, clockMode]);

  // Transition to halftime (stops clock and switches to time off)
  const transitionToHalftime = useCallback(async () => {
    if (!match) return false;

    console.log('🔄 Transitioning to halftime...');
    
    // Update phase immediately for UI responsiveness
    setCurrentPhase('HALFTIME');
    setShowExtraTimeAlert(false);

    // Switch to time-off mode (this will handle stopping the clock)
    try {
      await handleModeSwitch('TIMEOFF');
    } catch (err) {
      console.error('Failed to switch mode:', err);
      onTransitionError?.({ target: 'Halftime', error: err });
    }
    
    // Update match status in backend
    try {
      await updateMatchStatus(match.id, 'Halftime');
      console.log('✅ Match status updated to Halftime');
      fetchMatch();
      return true;
    } catch (error) {
      console.error('Failed to transition to halftime:', error);
      onTransitionError?.({ target: 'Halftime', error });
      return false;
    }
  }, [match, handleModeSwitch, fetchMatch, onTransitionError]);

  // Transition to second half (switches back to effective time)
  const transitionToSecondHalf = useCallback(async () => {
    if (!match) return false;

    console.log('🔄 Transitioning to second half...');
    
    // Update phase immediately
    setCurrentPhase('SECOND_HALF');
    setOperatorPeriod(2);
    
    // Switch to effective mode to restart the clock
    try {
      await handleModeSwitch('EFFECTIVE');
    } catch (err) {
      console.error('Failed to switch mode:', err);
      onTransitionError?.({ target: 'Live_Second_Half', error: err });
    }
    
    // Update match status in backend
    try {
      await updateMatchStatus(match.id, 'Live_Second_Half');
      console.log('✅ Match status updated to Live_Second_Half');
      fetchMatch();
      return true;
    } catch (error) {
      console.error('Failed to transition to second half:', error);
      onTransitionError?.({ target: 'Live_Second_Half', error });
      return false;
    }
  }, [match, handleModeSwitch, fetchMatch, onTransitionError]);

  // Transition to fulltime
  const transitionToFulltime = useCallback(async () => {
    if (!match) return false;

    console.log('🔄 Transitioning to fulltime...');
    
    // Update phase immediately
    setCurrentPhase('FULLTIME');
    setShowExtraTimeAlert(false);

    // Switch to time-off mode
    try {
      await handleModeSwitch('TIMEOFF');
    } catch (err) {
      console.error('Failed to switch mode:', err);
      onTransitionError?.({ target: 'Fulltime', error: err });
    }

    // Update match status in backend
    try {
      await updateMatchStatus(match.id, 'Fulltime');
      console.log('✅ Match status updated to Fulltime');
      fetchMatch();
      return true;
    } catch (error) {
      console.error('Failed to transition to fulltime:', error);
      onTransitionError?.({ target: 'Fulltime', error });
      return false;
    }
  }, [match, handleModeSwitch, fetchMatch, onTransitionError]);

  const dismissExtraTimeAlert = useCallback(() => {
    setShowExtraTimeAlert(false);
  }, []);

  return {
    operatorPeriod,
    currentPhase,
    periodInfo,
    showExtraTimeAlert,
    transitionToHalftime,
    transitionToSecondHalf,
    transitionToFulltime,
    dismissExtraTimeAlert,
  };
};
