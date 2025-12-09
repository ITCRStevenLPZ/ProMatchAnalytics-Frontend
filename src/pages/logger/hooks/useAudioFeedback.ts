import { useCallback, useRef, useEffect } from 'react';

type SoundType = 'success' | 'error' | 'goal' | 'card' | 'whistle' | 'click';

interface AudioFeedbackConfig {
  enabled?: boolean;
  volume?: number;
}

// Web Audio API based sound generator for minimal latency
const createAudioContext = () => {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
};

const playTone = (
  ctx: AudioContext, 
  frequency: number, 
  duration: number, 
  type: OscillatorType = 'sine',
  volume: number = 0.3
) => {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
};

const SOUND_CONFIGS: Record<SoundType, { frequencies: number[]; duration: number; type: OscillatorType }> = {
  success: { 
    frequencies: [523, 659], // C5, E5 - pleasant ascending
    duration: 0.1,
    type: 'sine',
  },
  error: {
    frequencies: [200, 150], // Low descending - warning
    duration: 0.15,
    type: 'square',
  },
  goal: {
    frequencies: [523, 659, 784, 1047], // C5, E5, G5, C6 - celebratory
    duration: 0.2,
    type: 'sine',
  },
  card: {
    frequencies: [440, 440], // A4 repeated - alert
    duration: 0.1,
    type: 'triangle',
  },
  whistle: {
    frequencies: [880, 880, 880], // High A repeated - whistle-like
    duration: 0.05,
    type: 'sine',
  },
  click: {
    frequencies: [1000], // Quick high click
    duration: 0.02,
    type: 'square',
  },
};

export const useAudioFeedback = (config: AudioFeedbackConfig = {}) => {
  const { enabled = true, volume = 0.3 } = config;
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context on first user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playSound = useCallback((type: SoundType) => {
    if (!enabled) return;
    
    try {
      const ctx = ensureAudioContext();
      const config = SOUND_CONFIGS[type];
      
      config.frequencies.forEach((freq, index) => {
        setTimeout(() => {
          playTone(ctx, freq, config.duration, config.type, volume);
        }, index * 80); // Slight delay between notes for sequences
      });
    } catch (error) {
      console.warn('Audio feedback failed:', error);
    }
  }, [enabled, volume, ensureAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    playSound,
    playSuccess: useCallback(() => playSound('success'), [playSound]),
    playError: useCallback(() => playSound('error'), [playSound]),
    playGoal: useCallback(() => playSound('goal'), [playSound]),
    playCard: useCallback(() => playSound('card'), [playSound]),
    playWhistle: useCallback(() => playSound('whistle'), [playSound]),
    playClick: useCallback(() => playSound('click'), [playSound]),
  };
};

// Helper to determine sound based on event type/outcome
export const getSoundForEvent = (eventType: string, outcome?: string): SoundType => {
  // Goals get special treatment
  if (outcome?.toLowerCase().includes('goal')) {
    return 'goal';
  }
  
  // Cards
  if (eventType === 'Card') {
    return 'card';
  }
  
  // Failed/lost outcomes
  if (outcome?.toLowerCase().includes('failed') || 
      outcome?.toLowerCase().includes('lost') ||
      outcome?.toLowerCase().includes('incomplete')) {
    return 'error';
  }
  
  // Default success sound
  return 'success';
};
