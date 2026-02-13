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
      className="absolute z-20 flex flex-col gap-2 xl:gap-2.5 2xl:gap-3 bg-slate-900/95 border border-slate-700 rounded-lg p-3 xl:p-4 2xl:p-5 shadow-xl pointer-events-auto"
      data-testid="quick-action-menu"
      style={{ left, top, transform: translate }}
    >
      <div className="text-xs xl:text-sm 2xl:text-base uppercase tracking-wide text-slate-400">
        {t("quickActionTitle", "Quick actions")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <button
            key={action}
            data-testid={`quick-action-${action}`}
            onClick={() => onActionSelect(action)}
            className="px-3 py-2 xl:px-4 xl:py-2.5 2xl:px-5 2xl:py-3 rounded-md bg-blue-700/80 hover:bg-blue-600 text-white text-xs xl:text-sm 2xl:text-base font-semibold"
          >
            {t(`action${action}`, action)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          data-testid="quick-action-more"
          onClick={onMoreActions}
          className="flex-1 px-3 py-2 xl:px-4 xl:py-2.5 2xl:px-5 2xl:py-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs xl:text-sm 2xl:text-base font-semibold"
        >
          {t("quickActionMore", "More actions")}
        </button>
        <button
          data-testid="quick-action-cancel"
          onClick={onCancel}
          className="px-3 py-2 xl:px-4 xl:py-2.5 2xl:px-5 2xl:py-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs xl:text-sm 2xl:text-base font-semibold"
        >
          {t("quickActionCancel", "Cancel")}
        </button>
      </div>
    </div>
  );
};

export default QuickActionMenu;
