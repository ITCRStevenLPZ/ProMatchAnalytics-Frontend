import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import type { TFunction } from "i18next";
import type { Formation } from "../../hooks/useTacticalPositions";
import {
  FORMATION_PRESETS,
  isValidFormation,
} from "../../hooks/useTacticalPositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormationPickerProps {
  /** Current formation for this side (null = none / default). */
  currentFormation: Formation | null;
  /** Called when user picks a formation or clears it. */
  onFormationChange: (formation: Formation | null) => void;
  /** Side label — used for data-testid prefix. */
  side: "home" | "away";
  /** Translation function. */
  t: TFunction<"logger">;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatFormation = (f: Formation): string => f.join("-");

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FormationPicker: React.FC<FormationPickerProps> = ({
  currentFormation,
  onFormationChange,
  side,
  t,
}) => {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handlePresetSelect = (formation: Formation) => {
    onFormationChange(formation);
    setOpen(false);
    setCustomInput("");
    setCustomError(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFormationChange(null);
    setCustomInput("");
    setCustomError(null);
  };

  const handleCustomSubmit = () => {
    // Parse the "X-X-X" string into numbers — separate from validation
    const trimmed = customInput.replace(/\s/g, "");
    const parts = trimmed.split("-").map(Number);
    if (parts.some(isNaN) || parts.length < 2) {
      setCustomError(
        t("formation.invalidFormat", "Use format like 4-3-3") as string,
      );
      return;
    }
    if (!isValidFormation(parts)) {
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum !== 10) {
        setCustomError(
          t("formation.mustSumTen", {
            defaultValue: "Must add up to 10 (got {{sum}})",
            sum: String(sum),
          }) as string,
        );
      } else {
        setCustomError(
          t("formation.invalidFormation", "Invalid formation") as string,
        );
      }
      return;
    }
    onFormationChange(parts);
    setOpen(false);
    setCustomInput("");
    setCustomError(null);
  };

  const displayLabel = currentFormation
    ? formatFormation(currentFormation)
    : t("formation.none", "No Formation");

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        data-testid={`formation-picker-${side}`}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
          bg-slate-700/60 border border-slate-600/60 text-slate-200
          hover:bg-slate-700 hover:border-slate-500 transition-colors"
      >
        <span className="truncate max-w-[80px]">{displayLabel}</span>
        {currentFormation ? (
          <X
            size={12}
            className="shrink-0 text-slate-400 hover:text-red-400"
            data-testid={`formation-clear-${side}`}
            onClick={handleClear}
          />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-slate-400" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          data-testid={`formation-dropdown-${side}`}
          className="absolute z-50 mt-1 w-52 rounded-lg border border-slate-600/80
            bg-slate-800 shadow-xl shadow-black/40 overflow-hidden"
        >
          {/* Custom input */}
          <div className="p-2 border-b border-slate-700/60">
            <div className="flex gap-1.5">
              <input
                type="text"
                data-testid={`formation-custom-input-${side}`}
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  setCustomError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomSubmit();
                }}
                placeholder={t("formation.customPlaceholder", "e.g. 4-3-3")}
                className="flex-1 min-w-0 px-2 py-1 rounded text-xs bg-slate-900/60
                  border border-slate-600/50 text-slate-200 placeholder-slate-500
                  focus:outline-none focus:border-cyan-500/60"
              />
              <button
                type="button"
                data-testid={`formation-custom-apply-${side}`}
                onClick={handleCustomSubmit}
                disabled={!customInput.trim()}
                className="px-2 py-1 rounded text-xs font-semibold
                  bg-cyan-600/80 text-white hover:bg-cyan-600
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t("formation.apply", "Apply")}
              </button>
            </div>
            {customError && (
              <p
                data-testid={`formation-custom-error-${side}`}
                className="mt-1 text-[10px] text-red-400"
              >
                {customError}
              </p>
            )}
          </div>

          {/* Presets list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {FORMATION_PRESETS.map((preset) => {
              const isActive =
                currentFormation &&
                formatFormation(currentFormation) ===
                  formatFormation(preset.formation);
              return (
                <button
                  key={preset.label}
                  type="button"
                  data-testid={`formation-preset-${side}-${preset.label}`}
                  onClick={() => handlePresetSelect(preset.formation)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    isActive
                      ? "bg-cyan-600/20 text-cyan-300 font-semibold"
                      : "text-slate-300 hover:bg-slate-700/60"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Clear button at bottom */}
          {currentFormation && (
            <div className="border-t border-slate-700/60 p-1.5">
              <button
                type="button"
                data-testid={`formation-clear-btn-${side}`}
                onClick={() => {
                  onFormationChange(null);
                  setOpen(false);
                }}
                className="w-full text-center px-2 py-1 rounded text-xs
                  text-slate-400 hover:text-red-400 hover:bg-slate-700/40 transition-colors"
              >
                {t("formation.clear", "Clear Formation")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FormationPicker;
