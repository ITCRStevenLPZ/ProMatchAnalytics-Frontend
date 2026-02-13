# Logger Cockpit Guide

## Overview

The Logger Cockpit is the core interface for real-time match data entry. It is optimized for speed and efficiency, allowing loggers to record complex events using keyboard shortcuts without relying on the mouse.

## State Machine

The cockpit operates as a simple state machine to guide the logger through the event creation flow:

1. **`selectPlayer`** (Initial State)
   - Waiting for player selection.
   - Input: Jersey Number.
2. **`selectAction`**
   - Player selected. Waiting for action type.
   - Input: Action Hotkey (e.g., 'P' for Pass).
3. **`selectOutcome`**
   - Action selected. Waiting for outcome.
   - Input: Outcome Index (1-9).
4. **`selectRecipient`** (Optional)
   - For events like passes, select the receiver.
   - Input: Jersey Number.

## Keyboard Shortcuts

### Global Controls

| Key        | Function       | Description                                             |
| ---------- | -------------- | ------------------------------------------------------- |
| `Space`    | Toggle Clock   | Starts or stops the match timer.                        |
| `Esc`      | Cancel / Reset | Cancels the current flow and returns to `selectPlayer`. |
| `Ctrl + Z` | Undo           | Removes the last logged event.                          |

### Data Entry

| Key     | Context         | Function                                                  |
| ------- | --------------- | --------------------------------------------------------- |
| `0-9`   | `selectPlayer`  | Type jersey number (accumulates in buffer).               |
| `Enter` | `selectPlayer`  | Confirm jersey number selection.                          |
| `P`     | `selectAction`  | Select **Pass**.                                          |
| `S`     | `selectAction`  | Select **Shot**.                                          |
| `F`     | `selectAction`  | Select **Foul**.                                          |
| `C`     | `selectAction`  | Select **Cross**.                                         |
| `T`     | `selectAction`  | Select **Tackle**.                                        |
| `I`     | `selectAction`  | Select **Interception**.                                  |
| `1-9`   | `selectOutcome` | Select outcome by index (e.g., 1=Complete, 2=Incomplete). |

## Visual Feedback

- **Key Buffer**: A floating indicator shows the numbers currently typed (e.g., "10").
- **Hotkeys**: Action buttons display their hotkey (e.g., `[P] Pass`).
- **Live Feed**: The right sidebar shows a real-time feed of logged events.

## Technical Implementation

- **Hook**: `useKeyboardInput.ts` manages the global key listeners and buffer state.
- **Store**: `useMatchLogStore.ts` handles the event state and WebSocket transmission.
- **Sync**: Events are optimistically added to the UI and queued for offline sync via `syncStore.ts`.
