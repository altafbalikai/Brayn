import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { resetPassword, clearError } from "../features/auth/authSlice";
import { GiBrain } from "react-icons/gi";
import { FiEye, FiEyeOff } from "react-icons/fi";
import RewindBackground from "../components/ui/RewindBackground.jsx";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);

  const shortPassword = password.length > 0 && password.length < 8;
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = password.length >= 8 && passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const result = await dispatch(
      resetPassword({ token, newPassword: password })
    );

    if (resetPassword.fulfilled.match(result)) {
      navigate("/login", { replace: true });
    }
  };

  useEffect(() => {
    return () => dispatch(clearError());
  }, [dispatch]);

  if (!token) {
    return <p className="text-center text-theme-text">Invalid reset link</p>;
  }

  return (
    <>
      <RewindBackground />
      <div className="relative z-10 min-h-screen p-5 flex items-center justify-center bg-transparent">
        <div className="w-full max-w-md p-8 bg-theme-light rounded-2xl shadow-2xl border border-theme-secondary">
          <h1 className="text-2xl font-bold text-theme-text mb-2 flex items-center justify-center gap-2">
            <GiBrain size={28} /> Brayn
          </h1>
          <p className="text-theme-muted mb-8 text-center">
            Set a new password
          </p>

          {error && (
            <div className="mb-4 p-3 bg-theme-danger/10 border border-theme-danger/30 rounded-lg text-theme-text text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-theme-accent border border-theme-secondary rounded-lg text-theme-text"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted"
                >
                  {show ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 bg-theme-accent border border-theme-secondary rounded-lg text-theme-text"
              />
            </div>

            {shortPassword && (
              <p className="text-sm text-theme-text">
                Minimum 8 characters required
              </p>
            )}

            {confirm && !passwordsMatch && (
              <p className="text-sm text-theme-text">Passwords do not match</p>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-3 bg-theme-secondary text-theme-text rounded-lg disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>

          <p className="mt-6 text-center text-theme-muted text-sm">
            <Link to="/login" className="hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
