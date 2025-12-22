// App.jsx
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { initializeAuth } from "./features/auth/authSlice";
import ProtectedRoute from "./components/ProtectedRoute";

// Lazy-loaded pages
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Chat = lazy(() => import("./pages/Chat"));

// Loading fallback
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-theme-dark">
    <div className="text-theme-accent">Loading...</div>
  </div>
);

function App() {
  const dispatch = useDispatch();

  // 🔑 READ initialized flag
  const { initialized } = useSelector((state) => state.auth);

  // 🔑 Initialize auth ONCE on app load
  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  // 🚫 BLOCK routing until auth is initialized
  if (!initialized) {
    return <LoadingFallback />;
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected route */}
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />

          {/* Root redirect (no auth logic here) */}
          {/* <Route path="/" element={<Navigate to="/chat" replace />} /> */}

          {/* Catch-all */}
          {/* <Route path="*" element={<Navigate to="/" replace />} /> */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
