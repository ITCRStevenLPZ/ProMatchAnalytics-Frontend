import { useLayoutEffect, useRef, useState } from "react";
import { TFunction } from "i18next";
import { FieldAnchor } from "../types";

interface QuickActionMenuProps {
  anchor: FieldAnchor;
  actions: string[];
  onActionSelect: (action: string) => void;
  onMoreActions: () => void;
  onCancel: () => void;
  t: TFunction<"logger">;
}

const QuickActionMenu = ({
  anchor,
  actions,
  onActionSelect,
  onMoreActions,
  onCancel,
  t,
}: QuickActionMenuProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const anchorX = anchor.xPercent ?? 0;
  const anchorY = anchor.yPercent ?? 0;

  useLayoutEffect(() => {
    const updatePosition = () => {
      const node = menuRef.current;
      if (!node) return;
      const parent = node.offsetParent as HTMLElement | null;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const menuRect = node.getBoundingClientRect();
      if (!parentRect.width || !parentRect.height) return;

      const anchorLeft = (anchorX / 100) * parentRect.width;
      const anchorTop = (anchorY / 100) * parentRect.height;
      const padding = 12;

      const minLeft = Math.min(
        menuRect.width / 2 + padding,
        parentRect.width / 2,
      );
      const maxLeft = Math.max(
        parentRect.width - menuRect.width / 2 - padding,
        parentRect.width / 2,
      );
      const minTop = Math.min(
        menuRect.height / 2 + padding,
        parentRect.height / 2,
      );
      const maxTop = Math.max(
        parentRect.height - menuRect.height / 2 - padding,
        parentRect.height / 2,
      );

      const clampedLeft = Math.min(Math.max(anchorLeft, minLeft), maxLeft);
      const clampedTop = Math.min(Math.max(anchorTop, minTop), maxTop);

      setPosition({ left: clampedLeft, top: clampedTop });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchorX, anchorY, actions.length]);

  const left = position ? `${position.left}px` : `${anchorX}%`;
  const top = position ? `${position.top}px` : `${anchorY}%`;
  const translate = "translate(-50%, -50%)";

  return (
    <div
      ref={menuRef}
      className="absolute z-20 flex flex-col gap-[clamp(0.45rem,0.35rem+0.2vw,0.9rem)] bg-slate-900/95 border border-slate-700 rounded-lg p-[clamp(0.7rem,0.55rem+0.45vw,1.4rem)] shadow-xl pointer-events-auto min-w-[clamp(260px,26vw,420px)]"
      data-testid="quick-action-menu"
      style={{ left, top, transform: translate }}
    >
      <div className="text-[clamp(0.7rem,0.62rem+0.25vw,1rem)] uppercase tracking-wide text-slate-400">
        {t("quickActionTitle", "Quick actions")}
      </div>
      <div className="grid grid-cols-2 gap-[clamp(0.4rem,0.32rem+0.18vw,0.72rem)]">
        {actions.map((action) => (
          <button
            key={action}
            data-testid={`quick-action-${action}`}
            onClick={() => onActionSelect(action)}
            className="px-[clamp(0.62rem,0.48rem+0.32vw,1.1rem)] py-[clamp(0.44rem,0.34rem+0.24vw,0.8rem)] rounded-md bg-blue-700/80 hover:bg-blue-600 text-white text-[clamp(0.72rem,0.62rem+0.28vw,1rem)] font-semibold"
          >
            {t(`action${action}`, action)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-[clamp(0.4rem,0.32rem+0.18vw,0.72rem)]">
        <button
          data-testid="quick-action-more"
          onClick={onMoreActions}
          className="flex-1 px-[clamp(0.62rem,0.48rem+0.32vw,1.1rem)] py-[clamp(0.44rem,0.34rem+0.24vw,0.8rem)] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[clamp(0.72rem,0.62rem+0.28vw,1rem)] font-semibold"
        >
          {t("quickActionMore", "More actions")}
        </button>
        <button
          data-testid="quick-action-cancel"
          onClick={onCancel}
          className="px-[clamp(0.62rem,0.48rem+0.32vw,1.1rem)] py-[clamp(0.44rem,0.34rem+0.24vw,0.8rem)] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[clamp(0.72rem,0.62rem+0.28vw,1rem)] font-semibold"
        >
          {t("quickActionCancel", "Cancel")}
        </button>
      </div>
    </div>
  );
};

export default QuickActionMenu;
