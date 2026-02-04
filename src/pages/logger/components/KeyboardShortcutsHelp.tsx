import React, { useState, useEffect } from "react";
import { X, Keyboard } from "lucide-react";
import { TFunction } from "i18next";

interface ShortcutCategory {
  title: string;
  shortcuts: { key: string; description: string }[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Core Actions",
    shortcuts: [
      { key: "P", description: "Pass" },
      { key: "S", description: "Shot" },
      { key: "D", description: "Duel" },
      { key: "F", description: "Foul" },
      { key: "Y", description: "Card (Yellow/Red/White)" },
      { key: "A", description: "Carry" },
    ],
  },
  {
    title: "Defensive Actions",
    shortcuts: [
      { key: "I", description: "Interception" },
      { key: "C", description: "Clearance" },
      { key: "B", description: "Block" },
      { key: "R", description: "Recovery" },
      { key: "O", description: "Offside" },
    ],
  },
  {
    title: "Set Pieces",
    shortcuts: [
      { key: "K", description: "Corner" },
      { key: "E", description: "Free Kick" },
      { key: "T", description: "Throw-in" },
      { key: "G", description: "Goal Kick" },
      { key: "N", description: "Penalty" },
    ],
  },
  {
    title: "Goalkeeper",
    shortcuts: [
      { key: "V", description: "Save" },
      { key: "L", description: "Claim" },
      { key: "U", description: "Punch" },
      { key: "M", description: "Smother" },
    ],
  },
  {
    title: "Controls",
    shortcuts: [
      { key: "Space", description: "Toggle Clock" },
      { key: "X", description: "Substitution" },
      { key: "Esc", description: "Cancel / Reset" },
      { key: "Enter", description: "Confirm Jersey #" },
      { key: "0-9", description: "Type Jersey Number" },
      { key: "?", description: "Show/Hide Help" },
    ],
  },
];

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction<"logger">;
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose,
  t,
}) => {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      data-testid="keyboard-shortcuts-help"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Keyboard className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-gray-800">
              {t("keyboardShortcuts", "Keyboard Shortcuts")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.title} className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
                  {category.title}
                </h3>
                <div className="space-y-2">
                  {category.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-gray-600 text-sm">
                        {shortcut.description}
                      </span>
                      <kbd className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs font-mono font-bold min-w-[2rem] text-center">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tips Section */}
          <div className="mt-6 bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2">💡 Pro Tips</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>
                • Type jersey numbers quickly to select players (e.g., "10" +
                Enter)
              </li>
              <li>• Use Space to pause/resume the clock during stoppages</li>
              <li>• Recent players appear at the top for quick re-selection</li>
              <li>
                • Quick action bar shows most-used actions with single key press
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 text-center text-sm text-gray-500">
          Press{" "}
          <kbd className="bg-gray-200 px-1.5 py-0.5 rounded text-xs font-mono">
            ?
          </kbd>{" "}
          anytime to toggle this help
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;

// Hook to manage help visibility
export const useKeyboardHelp = () => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isHelpOpen,
    openHelp: () => setIsHelpOpen(true),
    closeHelp: () => setIsHelpOpen(false),
    toggleHelp: () => setIsHelpOpen((prev) => !prev),
  };
};
