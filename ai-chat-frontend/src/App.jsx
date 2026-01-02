// App.jsx
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { initializeAuth } from "./features/auth/authSlice";
import ProtectedRoute from "./components/ProtectedRoute";

import AuthSkeletonLoader from "./components/PageSkeletonLoaders/AuthSkeletonLoader";
import ChatSkeletonLoader from "./components/PageSkeletonLoaders/ChatSkeletonLoader";

// Lazy-loaded pages
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Chat = lazy(() => import("./pages/Chat"));

function App() {
  const dispatch = useDispatch();
  const { initialized } = useSelector((state) => state.auth);

  // 🔑 Initialize auth ONCE on app load
  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  // 🚫 BLOCK routing until auth is initialized
  if (!initialized) {
    return <AuthSkeletonLoader />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* ================= AUTH ROUTES ================= */}
        <Route
          path="/login"
          element={
            <Suspense fallback={<AuthSkeletonLoader />}>
              <Login />
            </Suspense>
          }
        />

        <Route
          path="/signup"
          element={
            <Suspense fallback={<AuthSkeletonLoader />}>
              <Signup />
            </Suspense>
          }
        />

        <Route
          path="/forgot-password"
          element={
            <Suspense fallback={<AuthSkeletonLoader />}>
              <ForgotPassword />
            </Suspense>
          }
        />

        <Route
          path="/reset-password"
          element={
            <Suspense fallback={<AuthSkeletonLoader />}>
              <ResetPassword />
            </Suspense>
          }
        />

        {/* ================= PROTECTED ROUTES ================= */}
        <Route
          path="/chat"
          element={
            <Suspense fallback={<ChatSkeletonLoader />}>
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            </Suspense>
          }
        />

        {/* ================= REDIRECTS ================= */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
