import { create } from "zustand";
import { persist } from "zustand/middleware";

const IS_E2E_TEST_MODE = import.meta.env.VITE_E2E_TEST_MODE === "true";

const E2E_USER = IS_E2E_TEST_MODE
  ? {
      uid: "e2e-user",
      email: "e2e@example.com",
      displayName: "E2E Analyst",
      photoURL: "",
      role: "analyst" as const,
    }
  : null;

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role?: "admin" | "analyst" | "guest";
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: E2E_USER,
      loading: !IS_E2E_TEST_MODE,
      setUser: (user) => set({ user }),
      setLoading: (loading) => set({ loading }),
      logout: () => set({ user: null }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    },
  ),
);

declare global {
  interface Window {
    __PROMATCH_AUTH_STORE__?: typeof useAuthStore;
  }
}

if (IS_E2E_TEST_MODE && typeof window !== "undefined") {
  window.__PROMATCH_AUTH_STORE__ = useAuthStore;
}
