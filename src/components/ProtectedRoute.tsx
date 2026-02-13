import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "analyst" | "guest";
  allowedRoles?: string[];
}

// Role hierarchy: admin > analyst > guest
const roleHierarchy: Record<string, number> = {
  admin: 3,
  analyst: 2,
  guest: 1,
};

function hasRequiredRole(
  userRole: string | undefined,
  requiredRole: string,
): boolean {
  if (!userRole) return false;
  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

export default function ProtectedRoute({
  children,
  requiredRole,
  allowedRoles,
}: ProtectedRouteProps) {
  const { t } = useTranslation("common");
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Special handling for guest users - redirect to waiting page unless explicitly allowed
  if (user.role === "guest" && !allowedRoles?.includes("guest")) {
    return <Navigate to="/guest" replace />;
  }

  // Check allowedRoles if specified (exact match required)
  if (allowedRoles && !allowedRoles.includes(user.role || "")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">
            {t("errors.forbidden")}
          </h1>
          <p className="text-gray-600">{t("errors.noPermission")}</p>
          <p className="text-sm text-gray-500 mt-2">
            {t("errors.allowedRoles")}: {allowedRoles.join(", ")}
          </p>
          <p className="text-sm text-gray-500">
            {t("errors.yourRole")}: {user.role || t("errors.unknown")}
          </p>
        </div>
      </div>
    );
  }

  // Check role hierarchy if requiredRole is specified
  if (requiredRole && !hasRequiredRole(user.role, requiredRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-4">
            {t("errors.forbidden")}
          </h1>
          <p className="text-gray-600">{t("errors.noPermission")}</p>
          <p className="text-sm text-gray-500 mt-2">
            {t("errors.requiredRole")}: {requiredRole}
          </p>
          <p className="text-sm text-gray-500">
            {t("errors.yourRole")}: {user.role || t("errors.unknown")}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
