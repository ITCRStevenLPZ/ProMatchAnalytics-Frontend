import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useEffect } from 'react';
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Layout
import Layout from './components/Layout.tsx';

// Pages
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import LoggerCockpit from './pages/LoggerCockpit.tsx';
import Teams from './pages/Teams.tsx';
import TeamDetail from './pages/TeamDetail.tsx';
import Matches from './pages/Matches.tsx';
import MatchDetail from './pages/MatchDetail.tsx';
import LiveMatch from './pages/LiveMatch.tsx';
import NotFound from './pages/NotFound.tsx';

// Components
import ProtectedRoute from './components/ProtectedRoute.tsx';
import OfflineIndicator from './components/OfflineIndicator.tsx';

function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Get user role from custom claims
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const role = (idTokenResult.claims.role as string) || 'Viewer';
        
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || '',
          role: role as 'Admin' | 'Logger' | 'Viewer',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return (
    <BrowserRouter>
      <OfflineIndicator />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="admin" element={<AdminDashboard />} />
          
          <Route path="teams">
            <Route index element={<Teams />} />
            <Route path=":teamId" element={<TeamDetail />} />
          </Route>
          
          <Route path="matches">
            <Route index element={<Matches />} />
            <Route path=":matchId" element={<MatchDetail />} />
            <Route path=":matchId/live" element={<LiveMatch />} />
            <Route path=":matchId/logger" element={<LoggerCockpit />} />
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
