import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  /** Size of the spinner: sm, md, lg, xl */
  size?: "sm" | "md" | "lg" | "xl";
  /** Optional message to display below spinner */
  message?: string;
  /** Whether to show full screen overlay */
  fullScreen?: boolean;
  /** Custom className for additional styling */
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

const containerSizeClasses = {
  sm: "h-16",
  md: "h-32",
  lg: "h-48",
  xl: "h-64",
};

/**
 * LoadingSpinner component with smooth animation
 * Used across the application for consistent loading states
 *
 * @example
 * // Simple inline spinner
 * <LoadingSpinner size="sm" />
 *
 * @example
 * // Centered spinner with message
 * <LoadingSpinner size="md" message="Loading data..." />
 *
 * @example
 * // Full screen overlay
 * <LoadingSpinner size="lg" message="Loading..." fullScreen />
 */
export default function LoadingSpinner({
  size = "md",
  message,
  fullScreen = false,
  className = "",
}: LoadingSpinnerProps) {
  const { t } = useTranslation("common");
  const displayMessage = message || t("common.loadingData");

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center space-y-4">
          <Loader2
            className={`${sizeClasses[size]} text-blue-600 animate-spin`}
          />
          {displayMessage && (
            <p className="text-gray-700 font-medium">{displayMessage}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center ${containerSizeClasses[size]} ${className}`}
    >
      <Loader2 className={`${sizeClasses[size]} text-blue-600 animate-spin`} />
      {displayMessage && (
        <p className="mt-4 text-gray-600 text-sm">{displayMessage}</p>
      )}
    </div>
  );
}

/**
 * Inline spinner for buttons or compact spaces
 */
export function InlineSpinner({ size = "sm" }: { size?: "sm" | "md" }) {
  return <Loader2 className={`${sizeClasses[size]} animate-spin`} />;
}

/**
 * Table loading overlay - displays over table content
 */
export function TableLoadingOverlay({ message }: { message?: string }) {
  const { t } = useTranslation("common");

  return (
    <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
      <div className="flex flex-col items-center space-y-3">
        <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
        <p className="text-gray-600 font-medium">
          {message || t("common.loadingData")}
        </p>
      </div>
    </div>
  );
}

/**
 * Page loading component - full height centered spinner
 */
export function PageLoader({ message }: { message?: string }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
        <p className="text-xl text-gray-700 font-medium">
          {message || t("common.loadingData")}
        </p>
      </div>
    </div>
  );
}
