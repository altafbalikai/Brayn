import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { login, clearError } from "../features/auth/authSlice";
import { GiBrain } from "react-icons/gi";
import { FiEye, FiEyeOff } from "react-icons/fi";
import RewindBackground from "../components/ui/RewindBackground.jsx";
import SpiningLoader from "../components/ui/SpiningLoader.jsx";
import GoogleAuthButton from "../features/auth/components/GoogleAuthButton.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const { loading, error } = useSelector((state) => state.auth);
  const shortPassword = password.length > 0 && password.length < 8;
  const isPasswordValid = password.length >= 8;
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    try {
      await dispatch(login({ email, password }));
    } catch (err) {
      console.error("Login error:", err);
    }
  };
  // Clear error on login page unmounted
  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  return (
    <>
      <RewindBackground />
      <div className="relative z-10 min-h-screen p-5 flex items-center justify-center bg-transparent">
        <div className="w-full max-w-md p-8 bg-theme-light rounded-2xl shadow-2xl border border-theme-secondary">
          <h1 className="text-2xl font-bold text-theme-text mb-2 flex items-center justify-center gap-2">
            <GiBrain size={28} className="text-theme-text" /> Brayn
          </h1>
          <p className="text-theme-muted mb-8 text-center">
            Sign in to continue
          </p>

          {error && (
            <div className="mb-4 p-3 bg-theme-danger/10 border border-theme-danger/30 rounded-lg text-theme-text text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-theme-text mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) dispatch(clearError());
                }}
                required
                className="w-full px-4 py-3 bg-theme-accent border border-theme-secondary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-secondary focus:border-theme-secondary"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-theme-text mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) dispatch(clearError());
                  }}
                  required
                  className="w-full px-4 py-3 bg-theme-accent border border-theme-secondary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-secondary focus:border-theme-secondary"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted
               hover:text-theme-text"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>

            {shortPassword && (
              <p className="mt-1 text-sm text-theme-text ">
                Password must be at least 8 characters long.
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !isPasswordValid}
              className="w-full py-3 bg-theme-secondary text-theme-text font-semibold rounded-lg hover:bg-opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? <SpiningLoader /> : "Sign In"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-theme-muted">
            <div className="h-px flex-1 bg-theme-secondary/40" />
            <span>OR</span>
            <div className="h-px flex-1 bg-theme-secondary/40" />
          </div>

          <GoogleAuthButton />

          <div className="text-right mt-2">
            <Link
              to="/forgot-password"
              className="text-sm text-theme-muted hover:text-theme-text underline"
            >
              Forgot password?
            </Link>
          </div>

          <p className="mt-4 text-center text-theme-muted text-sm">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-theme-text hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
