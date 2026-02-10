import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
} from "react-router-dom";
import { useAuthStore } from "./store/authStore";
import { useEffect } from "react";
import { auth } from "./lib/firebase";
import { fetchCurrentUser } from "./lib/auth";
import { onAuthStateChanged } from "firebase/auth";

const IS_E2E_TEST_MODE = import.meta.env.VITE_E2E_TEST_MODE === "true";

// Layout
import Layout from "./components/Layout.tsx";

// Pages
import Login from "./pages/Login.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import AdminDashboard from "./pages/AdminDashboard.tsx";
import LoggerCockpit from "./pages/LoggerCockpit.tsx";
// ...
// <Route path=":matchId/logger" element={<div>Logger Disabled</div>} />
import TeamDetail from "./pages/TeamDetail.tsx";
import MatchDetail from "./pages/MatchDetail.tsx";
import LiveMatch from "./pages/LiveMatch.tsx";
import NotFound from "./pages/NotFound.tsx";
import GuestWaiting from "./pages/GuestWaiting.tsx";

// Admin CRUD Pages
import UsersManager from "./pages/UsersManager.tsx";
import CompetitionsManager from "./pages/CompetitionsManager.tsx";
import VenuesManager from "./pages/VenuesManager.tsx";
import RefereesManager from "./pages/RefereesManager.tsx";
import PlayersManager from "./pages/PlayersManager.tsx";
import TeamsManager from "./pages/TeamsManager.tsx";
import MatchesManager from "./pages/MatchesManager.tsx";
import IngestionManager from "./pages/IngestionManager.tsx";
import IngestionPage from "./pages/IngestionPage.tsx";
import AdminModelConfig from "./pages/AdminModelConfig.tsx";
import ConflictsView from "./pages/ConflictsView.tsx";
import ActionDefinitionsPage from "./pages/admin/actions/ActionDefinitionsPage.tsx";
import WorkflowListPage from "./pages/admin/workflows/WorkflowListPage.tsx";
import WorkflowDesignerPage from "./pages/admin/workflows/WorkflowDesignerPage.tsx";

// Components
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import OfflineIndicator from "./components/OfflineIndicator.tsx";

function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    if (IS_E2E_TEST_MODE) {
      // E2E mode bootstraps an analyst user without Firebase.
      setUser({
        uid: "e2e-user",
        email: "e2e@example.com",
        displayName: "E2E Analyst",
        photoURL: "",
        role: "analyst",
      });
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          await fetchCurrentUser();
          await firebaseUser.getIdToken(true);
        } catch (error) {
          console.error("Failed to sync backend session", error);
        }

        const idTokenResult = await firebaseUser.getIdTokenResult();
        const role = (idTokenResult.claims.role as string) || "guest";

        // Map old roles to new roles if needed
        const roleMapping: Record<string, "admin" | "analyst" | "guest"> = {
          Admin: "admin",
          Logger: "analyst",
          Viewer: "guest",
          admin: "admin",
          analyst: "analyst",
          guest: "guest",
        };

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || "",
          photoURL: firebaseUser.photoURL || "",
          role: roleMapping[role] || "guest",
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route>
        <Route path="/login" element={<Login />} />

        {/* Guest waiting page - accessible to guests and admin */}
        <Route
          path="/guest"
          element={
            <ProtectedRoute allowedRoles={["guest", "admin"]}>
              <GuestWaiting />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <>
                <OfflineIndicator />
                <Layout />
              </>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />

          {/* Admin-only routes */}
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="admin/users" element={<UsersManager />} />
          <Route
            path="admin/actions"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <ActionDefinitionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/workflows"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <WorkflowListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/workflows/:workflowId"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <WorkflowDesignerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/ingestion"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <IngestionManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/ingestion/:batchId"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <IngestionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/ingestion/config"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminModelConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/conflicts"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <ConflictsView />
              </ProtectedRoute>
            }
          />

          {/* Data Management Routes - accessible to admin & analyst */}
          <Route path="competitions" element={<CompetitionsManager />} />
          <Route path="venues" element={<VenuesManager />} />
          <Route path="referees" element={<RefereesManager />} />
          <Route path="players" element={<PlayersManager />} />

          <Route path="teams">
            <Route index element={<TeamsManager />} />
            <Route path=":teamId" element={<TeamDetail />} />
          </Route>

          <Route path="matches">
            <Route index element={<MatchesManager />} />
            <Route path=":matchId" element={<MatchDetail />} />
            <Route path=":matchId/live" element={<LiveMatch />} />
            <Route path=":matchId/logger" element={<LoggerCockpit />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>,
    ),
  );

  return (
    <RouterProvider
      router={router}
      future={{
        v7_startTransition: true,
      }}
    />
  );
}

export default App;
