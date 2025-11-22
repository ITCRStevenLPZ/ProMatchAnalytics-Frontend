import { render, screen, act, fireEvent } from '@testing-library/react';
import { MatchTimer } from './MatchTimer';
import { useMatchLogStore } from '../../store/useMatchLogStore';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the store
vi.mock('../../store/useMatchLogStore');

describe('MatchTimer Backup Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store mock
    (useMatchLogStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      operatorClock: '00:00.000',
      setOperatorClock: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should backup clock to store every 5 seconds when running', () => {
    const setOperatorClockMock = vi.fn();
    (useMatchLogStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      operatorClock: '00:00.000',
      setOperatorClock: setOperatorClockMock,
    });

    render(<MatchTimer />);

    // Start the timer
    const buttons = screen.getAllByRole('button');
    const playButton = buttons[0];
    act(() => {
      fireEvent.click(playButton);
    });
    expect(screen.getByText('Backing up every 5s...')).toBeInTheDocument();

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Check if backup was called
    expect(setOperatorClockMock).toHaveBeenCalledTimes(2);
    
    // We expect at least one call with a non-zero time string
    const lastCallArgs = setOperatorClockMock.mock.calls[setOperatorClockMock.mock.calls.length - 1];
    // Note: Since we are mocking time, the exact value depends on how many frames ran. 
    // We just verify it's not 00:00.000 and roughly correct.
    expect(lastCallArgs[0]).not.toBe('00:00.000');
  });

  it('should backup immediately when paused', () => {
    const setOperatorClockMock = vi.fn();
    (useMatchLogStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      operatorClock: '00:00.000',
      setOperatorClock: setOperatorClockMock,
    });

    render(<MatchTimer />);

    const buttons = screen.getAllByRole('button');
    const playButton = buttons[0];

    // Start
    act(() => {
      fireEvent.click(playButton);
    });
    
    // Advance 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Pause
    act(() => {
      fireEvent.click(playButton);
    });

    // Should have called backup
    expect(setOperatorClockMock).toHaveBeenCalledTimes(2);
    const lastCallArgs = setOperatorClockMock.mock.calls[setOperatorClockMock.mock.calls.length - 1];
    expect(lastCallArgs[0]).not.toBe('00:00.000');
  });
});
