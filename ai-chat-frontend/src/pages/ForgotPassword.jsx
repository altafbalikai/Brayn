import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { forgotPassword, clearError } from "../features/auth/authSlice";
import { GiBrain } from "react-icons/gi";
import RewindBackground from "../components/ui/RewindBackground.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");

    const result = await dispatch(forgotPassword({ email }));

    if (forgotPassword.fulfilled.match(result)) {
      setSuccess(
        "If an account exists for this email, a password reset link has been sent."
      );
    }
  };

  useEffect(() => {
    return () => dispatch(clearError());
  }, [dispatch]);

  return (
    <>
      <RewindBackground />
      <div className="relative z-10 min-h-screen p-5 flex items-center justify-center bg-transparent">
        <div className="w-full max-w-md p-8 bg-theme-light rounded-2xl shadow-2xl border border-theme-secondary">
          <h1 className="text-2xl font-bold text-theme-text mb-2 flex items-center justify-center gap-2">
            <GiBrain size={28} /> Brayn
          </h1>
          <p className="text-theme-muted mb-8 text-center">
            Reset your password
          </p>

          {error && (
            <div className="mb-4 p-3 bg-theme-danger/10 border border-theme-danger/30 rounded-lg text-theme-text text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-theme-text text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) dispatch(clearError());
                }}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-theme-accent border border-theme-secondary rounded-lg text-theme-text"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-theme-secondary text-theme-text rounded-lg disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <p className="mt-6 text-center text-theme-muted text-sm">
            Remembered your password?{" "}
            <Link to="/login" className="text-theme-text hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
