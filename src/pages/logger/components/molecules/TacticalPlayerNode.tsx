import React, { useCallback, useRef, useEffect } from "react";
import { getPositionGroup } from "../../hooks/useTacticalPositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TacticalPlayerNodeProps {
  playerId: string;
  jerseyNumber: number;
  fullName: string;
  shortName?: string;
  position: string;
  side: "home" | "away";
  /** Display‑space position (already flipped if necessary). */
  xPercent: number;
  yPercent: number;
  isExpelled?: boolean;
  hasYellow?: boolean;
  hasRed?: boolean;
  yellowCount?: number;
  /** When true, prevent node dragging (clicks still fire). */
  dragLocked?: boolean;
  /** Called when the user clicks without dragging (player selection). */
  onClick?: () => void;
  /** Called when the user drags and releases (reposition). */
  onDragEnd?: (displayX: number, displayY: number) => void;
  /** While dragging, live‑update the preview position. */
  onDragMove?: (displayX: number, displayY: number) => void;
}

// Minimum pointer movement (px) before we count it as a drag instead of click.
const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TacticalPlayerNode: React.FC<TacticalPlayerNodeProps> = ({
  playerId,
  jerseyNumber,
  fullName,
  shortName: _shortName,
  position,
  side,
  xPercent,
  yPercent,
  isExpelled = false,
  hasYellow = false,
  hasRed = false,
  yellowCount = 0,
  dragLocked = false,
  onClick,
  onDragEnd,
  onDragMove,
}) => {
  const isDragging = useRef(false);
  const startPointer = useRef({ x: 0, y: 0 });
  const startPercent = useRef({ x: 0, y: 0 });
  const fieldRect = useRef<DOMRect | null>(null);
  const hasMoved = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const touchMoved = useRef(false);
  // Store stable refs for callbacks used in window event handlers
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  const onClickRef = useRef(onClick);
  const dragLockedRef = useRef(dragLocked);
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;
  onClickRef.current = onClick;
  dragLockedRef.current = dragLocked;

  // We need the field container for coordinate conversion.
  const getFieldRect = useCallback((el: HTMLElement | null): DOMRect | null => {
    if (!el) return null;
    // Walk up to find [data-testid="soccer-field"] (the tactical field container)
    let node: HTMLElement | null = el;
    while (node) {
      if (node.dataset.testid === "soccer-field")
        return node.getBoundingClientRect();
      node = node.parentElement;
    }
    return null;
  }, []);

  // Global move/up handlers attached to window during drag so that pointer
  // capture is not needed (which can be flaky in automated tests).
  const handleWindowPointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current || !fieldRect.current) return;
    const dx = e.clientX - startPointer.current.x;
    const dy = e.clientY - startPointer.current.y;
    if (!hasMoved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    // Always mark as moved so pointerUp can distinguish tap from drag
    hasMoved.current = true;
    // When locked, skip the visual preview — position must not change
    if (dragLockedRef.current) return;

    const rect = fieldRect.current;
    const newX = startPercent.current.x + (dx / rect.width) * 100;
    const newY = startPercent.current.y + (dy / rect.height) * 100;
    const clampedX = Math.min(100, Math.max(0, newX));
    const clampedY = Math.min(100, Math.max(0, newY));
    onDragMoveRef.current?.(clampedX, clampedY);
  }, []);

  const handleWindowPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;

      // Remove global listeners
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);

      if (!hasMoved.current) {
        onClickRef.current?.();
        return;
      }

      // User physically dragged — if locked, swallow (no click, no reposition)
      if (dragLockedRef.current) return;

      if (fieldRect.current) {
        const dx = e.clientX - startPointer.current.x;
        const dy = e.clientY - startPointer.current.y;
        const rect = fieldRect.current;
        const newX = startPercent.current.x + (dx / rect.width) * 100;
        const newY = startPercent.current.y + (dy / rect.height) * 100;
        const clampedX = Math.min(100, Math.max(0, newX));
        const clampedY = Math.min(100, Math.max(0, newY));
        onDragEndRef.current?.(clampedX, clampedY);
      }
    },
    [handleWindowPointerMove],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isExpelled) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      hasMoved.current = false;
      startPointer.current = { x: e.clientX, y: e.clientY };
      startPercent.current = { x: xPercent, y: yPercent };
      fieldRect.current = getFieldRect(e.currentTarget);

      // Attach global listeners for move/up to avoid pointer capture dependency
      window.addEventListener("pointermove", handleWindowPointerMove);
      window.addEventListener("pointerup", handleWindowPointerUp);
    },
    [
      isExpelled,
      xPercent,
      yPercent,
      getFieldRect,
      handleWindowPointerMove,
      handleWindowPointerUp,
    ],
  );

  const displayName = fullName;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isExpelled) return;
      const touch = e.touches[0];
      if (!touch) return;
      touchStart.current = { x: touch.clientX, y: touch.clientY };
      touchMoved.current = false;
    },
    [isExpelled],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      touchMoved.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isExpelled) return;
      e.stopPropagation();
      if (!touchMoved.current) {
        onClickRef.current?.();
      }
      touchMoved.current = false;
    },
    [isExpelled],
  );

  return (
    <div
      data-testid={`field-player-${playerId}`}
      data-tactical-player={playerId}
      data-player-id={playerId}
      data-player-row="true"
      data-side={side}
      data-position={position}
      data-position-group={getPositionGroup(position)}
      data-tactical-x={xPercent.toFixed(1)}
      data-tactical-y={yPercent.toFixed(1)}
      title={`${fullName} (${position})`}
      role="button"
      aria-disabled={isExpelled || undefined}
      className={`absolute z-10 flex flex-col items-center pointer-events-auto select-none touch-none ${
        isExpelled
          ? "opacity-40 cursor-not-allowed"
          : dragLocked
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        transform: "translate(-50%, -50%)",
      }}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e: React.MouseEvent) => {
        // Prevent the native click from bubbling up to TacticalField's
        // handleFieldClick (which fires onDestinationClick). The actual
        // player-selection callback is handled via the window pointerup
        // listener set up in handlePointerDown.
        e.stopPropagation();
      }}
    >
      {/* Jersey number circle */}
      <div
        className={`flex items-center justify-center w-14 h-14 rounded-full text-lg font-bold shadow-lg border-2 transition-shadow ${
          side === "home"
            ? "bg-red-600 text-white border-red-300/60"
            : "bg-blue-600 text-white border-blue-300/60"
        } ${isExpelled ? "saturate-50" : "hover:shadow-xl hover:scale-110"}`}
      >
        {jerseyNumber}
      </div>

      {/* Name label */}
      <span
        className={`mt-0.5 px-2 py-0.5 rounded text-xs font-semibold leading-tight text-center max-w-[120px] whitespace-nowrap overflow-hidden text-ellipsis ${
          side === "home"
            ? "bg-red-900/80 text-white"
            : "bg-blue-900/80 text-white"
        }`}
      >
        {displayName}
      </span>

      {/* Position badge (also satisfies backward-compat text assertions) */}
      <span
        data-testid={`field-player-position-${playerId}`}
        className="text-[8px] font-bold uppercase tracking-wide text-white/70 leading-none"
      >
        {position}
      </span>

      {/* Card badge row */}
      {(hasYellow || hasRed || isExpelled) && (
        <div className="flex items-center gap-0.5 mt-0.5">
          {hasYellow && (
            <span
              data-testid={`field-player-status-yellow-${playerId}`}
              className="inline-flex items-center gap-px"
            >
              {Array.from({ length: Math.max(1, yellowCount) }).map((_, i) => (
                <span
                  key={`y-${i}`}
                  className="h-2.5 w-1.5 rounded-sm bg-yellow-400"
                />
              ))}
            </span>
          )}
          {hasRed && (
            <span
              data-testid={`field-player-status-red-${playerId}`}
              className="inline-flex items-center"
            >
              <span className="h-2.5 w-1.5 rounded-sm bg-red-500" />
            </span>
          )}
          {isExpelled && (
            <span
              data-testid={`field-player-disabled-badge-${playerId}`}
              className="text-[8px] font-bold text-red-400 uppercase"
            >
              Disabled
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default TacticalPlayerNode;
