import { Outlet, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import {
  Home,
  Trophy,
  LogOut,
  Settings,
  Shield,
  MapPin,
  Flag,
  User as UserIcon,
  Menu,
  X,
  Upload,
} from "lucide-react";
import LanguageSwitcher from "./LanguageSwitcher";
import { useState, useRef, useEffect } from "react";

// Profile Avatar Component with fallback
function ProfileAvatar({ user }: { user: any }) {
  const [imageError, setImageError] = useState(false);

  if (!user?.photoURL || imageError) {
    return (
      <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
        {(user?.displayName || user?.email || "U")[0].toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={user.photoURL}
      alt="Profile"
      className="w-10 h-10 rounded-full object-cover"
      loading="lazy"
      onError={() => setImageError(true)}
    />
  );
}

export default function Layout() {
  const { t, ready } = useTranslation("common");
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await signOut(auth);
    logout(); // Clear the Zustand store and localStorage
  };

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const isLoggerRoute = /^\/matches\/[^/]+\/logger$/.test(location.pathname);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setShowMobileMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Loading...
      </div>
    );
  }

  const dataManagementItems = [
    {
      path: "/competitions",
      icon: Trophy,
      label: t("admin.competitions", "Competitions"),
    },
    {
      path: "/teams",
      icon: Shield,
      label: t("admin.teams", "Teams"),
    },
    {
      path: "/matches",
      icon: Trophy,
      label: t("admin.matches", "Matches"),
    },
    {
      path: "/players",
      icon: UserIcon,
      label: t("admin.players", "Players"),
    },
    {
      path: "/venues",
      icon: MapPin,
      label: t("admin.venues", "Venues"),
    },
    {
      path: "/referees",
      icon: Flag,
      label: t("admin.referees", "Referees"),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              {/* Hamburger Menu Button - Always Visible */}
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Toggle menu"
              >
                {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
              </button>

              <Link to="/dashboard" className="flex items-center gap-2">
                <Trophy className="text-primary-600" size={32} />
                <span className="text-xl font-bold text-gray-900">
                  ProMatchAnalytics
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.displayName || user?.email}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {user?.role || "guest"}
                </p>
              </div>
              <ProfileAvatar user={user} />
              <button
                onClick={handleLogout}
                className="btn btn-secondary"
                title={t("login.signOut", "Sign Out")}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar Menu */}
      {showMobileMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowMobileMenu(false)}
          />

          {/* Sidebar */}
          <div
            ref={mobileMenuRef}
            className="fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto"
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Trophy className="text-primary-600" size={28} />
                <span className="text-lg font-bold text-gray-900">Menu</span>
              </div>
              <button
                onClick={() => setShowMobileMenu(false)}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* User Info */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-3">
                <ProfileAvatar user={user} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.displayName || user?.email}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {user?.role || "guest"}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="p-4 space-y-2">
              <Link
                to="/dashboard"
                onClick={() => setShowMobileMenu(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                  isActive("/dashboard")
                    ? "bg-primary-100 text-primary-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Home size={20} />
                <span>{t("nav.dashboard", "Dashboard")}</span>
              </Link>

              {/* Data Management Section */}
              {(user?.role === "admin" || user?.role === "analyst") && (
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t("nav.dataManagement", "Data Management")}
                  </div>

                  {dataManagementItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setShowMobileMenu(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                          isActive(item.path)
                            ? "bg-primary-100 text-primary-700"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <Icon size={20} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Admin Section */}
              {user?.role === "admin" && (
                <div className="pt-2 border-t border-gray-200 mt-2">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {t("nav.admin", "Admin")}
                  </div>
                  <Link
                    to="/admin"
                    onClick={() => setShowMobileMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                      isActive("/admin") && location.pathname === "/admin"
                        ? "bg-primary-100 text-primary-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Settings size={20} />
                    <span>{t("nav.userManagement", "User Management")}</span>
                  </Link>
                  <Link
                    to="/admin/ingestion"
                    onClick={() => setShowMobileMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                      isActive("/admin/ingestion")
                        ? "bg-primary-100 text-primary-700"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Upload size={20} />
                    <span>{t("nav.dataIngestion", "Data Ingestion")}</span>
                  </Link>
                </div>
              )}
            </nav>

            {/* Footer Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={20} />
                <span>{t("login.signOut", "Sign Out")}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <main
        className={
          isLoggerRoute
            ? "w-full max-w-none px-0 py-0"
            : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
