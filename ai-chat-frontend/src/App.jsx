// App.jsx
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { initializeAuth } from "./features/auth/authSlice";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

import AuthSkeletonLoader from "./components/PageSkeletonLoaders/AuthSkeletonLoader";
import ChatSkeletonLoader from "./components/PageSkeletonLoaders/ChatSkeletonLoader";
import AdminLayout from "./components/AdminPanel/AdminLayout";

// Lazy-loaded pages
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Chat = lazy(() => import("./pages/Chat"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const PromptSettings = lazy(() => import("./pages/PromptSettings"));

function App() {
  const dispatch = useDispatch();
  const { initialized } = useSelector((state) => state.auth);
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

  // 🔑 Initialize auth ONCE on app load
  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  // BLOCK routing until auth is initialized
  // if (!initialized) {
  //   return <ChatSkeletonLoader />;
  // }

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
          path="/chat/:conversationId?"
          element={
            <Suspense fallback={<ChatSkeletonLoader />}>
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            </Suspense>
          }
        />

        <Route
          path="/admin-panel"
          element={
            <Suspense fallback={<ChatSkeletonLoader />}>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </Suspense>
          }
        >
          <Route index element={<Navigate to="models" replace />} />
          <Route path="models" element={<AdminPanel />} />
          <Route index element={<Navigate to="prompt-settings" replace />} />
          <Route path="prompt-settings" element={<PromptSettings />} />
        </Route>

        {/* ================= REDIRECTS ================= */}
        <Route
          path="/"
          element={
            <Navigate to={isAuthenticated ? "/chat" : "/login"} replace />
          }
        />
        {/* <Route path="*" element={<Navigate to="/login" replace />} /> */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
