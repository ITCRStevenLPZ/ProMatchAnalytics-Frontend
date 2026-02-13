import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, AlertCircle } from "lucide-react";

interface AutocompleteSearchProps<T> {
  /** Field name for the input */
  name: string;
  /** Current value in the input */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when a suggestion is selected */
  onSelectSuggestion: (item: T) => void;
  /** Function to fetch suggestions from API */
  fetchSuggestions: (query: string) => Promise<T[]>;
  /** Function to get display text from item */
  getDisplayText: (item: T) => string;
  /** Function to get secondary text (optional subtitle) */
  getSecondaryText?: (item: T) => string;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum characters before searching (default: 3) */
  minChars?: number;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Whether field is required */
  required?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Label for the field */
  label?: string;
}

export default function AutocompleteSearch<T>({
  name,
  value,
  onChange,
  onSelectSuggestion,
  fetchSuggestions,
  getDisplayText,
  getSecondaryText,
  placeholder,
  minChars = 3,
  debounceMs = 300,
  required = false,
  className = "",
  label,
}: AutocompleteSearchProps<T>) {
  const { t } = useTranslation("common");
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (value.trim().length < minChars) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    setError(null);

    timeoutRef.current = setTimeout(async () => {
      try {
        const results = await fetchSuggestions(value);
        setSuggestions(results);
        setShowDropdown(true);
      } catch (err: any) {
        console.error("Error fetching suggestions:", err);
        setError(t("autocomplete.searchError"));
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, minChars, debounceMs, fetchSuggestions, t]);

  const handleSelect = (item: T) => {
    onChange(getDisplayText(item));
    setShowDropdown(false);
    setSuggestions([]);
    onSelectSuggestion(item);
  };

  const handleClear = () => {
    onChange("");
    setSuggestions([]);
    setShowDropdown(false);
    setError(null);
  };

  const showMinCharsMessage =
    value.trim().length > 0 && value.trim().length < minChars;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={name}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>

        <input
          id={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || t("autocomplete.searchPlaceholder")}
          required={required}
          className="input pl-10 pr-10 w-full"
          autoComplete="off"
        />

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Min chars message */}
      {showMinCharsMessage && (
        <p className="mt-1 text-xs text-gray-500">
          {t("autocomplete.minCharsMessage", { count: minChars })}
        </p>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          <span>{error}</span>
        </div>
      )}

      {/* Dropdown with suggestions */}
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-2 text-sm text-gray-500 text-center">
              {t("autocomplete.searching")}
            </div>
          ) : suggestions.length > 0 ? (
            <>
              <div className="sticky top-0 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 z-10">
                {t("autocomplete.suggestionsFound", {
                  count: suggestions.length,
                })}
              </div>
              <ul className="py-1">
                {suggestions.map((item, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className="w-full px-4 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors"
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {getDisplayText(item)}
                      </div>
                      {getSecondaryText && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {getSecondaryText(item)}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="sticky bottom-0 px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border-t border-gray-200 z-10">
                {t("autocomplete.selectToEdit")}
              </div>
            </>
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500 text-center">
              {t("autocomplete.noMatches")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
