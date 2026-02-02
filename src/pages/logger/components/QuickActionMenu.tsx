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
  const anchorX = anchor.xPercent ?? 0;
  const anchorY = anchor.yPercent ?? 0;
  const shiftLeft = anchorX > 70;
  const shiftUp = anchorY > 70;
  const translateX = shiftLeft ? "-100%" : "0";
  const translateY = shiftUp ? "-100%" : "0";
  const translate = `translate(${translateX}, ${translateY})`;

  return (
    <div
      className="absolute z-20 flex flex-col gap-2 bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-xl"
      data-testid="quick-action-menu"
      style={{ left: `${anchorX}%`, top: `${anchorY}%`, transform: translate }}
    >
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {t("quickActionTitle", "Quick actions")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <button
            key={action}
            data-testid={`quick-action-${action}`}
            onClick={() => onActionSelect(action)}
            className="px-3 py-2 rounded-md bg-blue-700/80 hover:bg-blue-600 text-white text-xs font-semibold"
          >
            {t(`action${action}`, action)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          data-testid="quick-action-more"
          onClick={onMoreActions}
          className="flex-1 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
        >
          {t("quickActionMore", "More actions")}
        </button>
        <button
          data-testid="quick-action-cancel"
          onClick={onCancel}
          className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
        >
          {t("quickActionCancel", "Cancel")}
        </button>
      </div>
    </div>
  );
};

export default QuickActionMenu;
