import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { signup, clearError } from "../features/auth/authSlice";
import { GiBrain } from "react-icons/gi";
import { FiEye, FiEyeOff } from "react-icons/fi";
import RewindBackground from "../components/ui/RewindBackground.jsx";
import SpiningLoader from "../components/ui/SpiningLoader.jsx";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [Confirmpassword, setConfirmpassword] = useState("");
  const [name, setName] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const { loading, error } = useSelector((state) => state.auth);

  const shortPassword = password.length > 0 && password.length < 8;
  const isPasswordValid = password.length >= 8;
  const passwordsMatch =
    password === Confirmpassword && Confirmpassword.length > 0;
  const canSubmit = isPasswordValid && passwordsMatch;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmpassword, setShowConfirmpassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/chat", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== Confirmpassword) {
      console.error("Passwords do not match");
      // optionally show UI error / toast here
      return;
    }
    const result = await dispatch(signup({ email, password, name }));
    if (signup.fulfilled.match(result)) {
      navigate("/chat");
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
      <div className=" relative z-10 min-h-screen p-5 bg-transparent overflow-y-auto flex justify-center">
        {/* Glass Card */}
        <div
          className="
          w-full max-w-md mx-auto my-auto p-8 rounded-2xl shadow-2xl
          bg-theme-light backdrop-blur-xl
          border border-theme-secondary
        "
        >
          <h1 className="text-2xl font-bold text-theme-text mb-2 flex items-center justify-center gap-2">
            <GiBrain size={28} className="text-theme-text" /> Brayn
          </h1>
          <p className="text-theme-muted mb-8 text-center">
            Create your account
          </p>

          {error && (
            <div className="mb-4 p-3 bg-theme-danger/10 border border-theme-danger/30 rounded-lg text-theme-text text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-theme-text mb-2"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                required
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) dispatch(clearError());
                }}
                placeholder="Your name"
                className="
                w-full px-4 py-3
                bg-theme-accent
                border border-theme-secondary
                rounded-lg
                text-theme-text
                placeholder-theme-muted
                focus:outline-none
                focus:ring-2 focus:ring-theme-primary
              "
              />
            </div>

            {/* Email */}
            <div>
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
                placeholder="you@example.com"
                className="
                w-full px-4 py-3
                bg-theme-accent
                border border-theme-secondary
                rounded-lg
                text-theme-text
                placeholder-theme-muted
                focus:outline-none
                focus:ring-2 focus:ring-theme-primary
              "
              />
            </div>

            {/* Password */}
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
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="
                w-full px-4 py-3
                bg-theme-accent
                border border-theme-secondary
                rounded-lg
                text-theme-text
                placeholder-theme-muted
                focus:outline-none
                focus:ring-2 focus:ring-theme-primary
              "
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

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="Confirmpassword"
                className="block text-sm font-medium text-theme-text mb-2"
              >
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="Confirmpassword"
                  type={showConfirmpassword ? "text" : "password"}
                  value={Confirmpassword}
                  onChange={(e) => {
                    setConfirmpassword(e.target.value);
                    if (error) dispatch(clearError());
                  }}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="
                w-full px-4 py-3
                bg-theme-accent
                border border-theme-secondary
                rounded-lg
                text-theme-text
                placeholder-theme-muted
                focus:outline-none
                focus:ring-2 focus:ring-theme-primary
              "
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmpassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted
                             hover:text-theme-text"
                  aria-label={
                    showConfirmpassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmpassword ? (
                    <FiEyeOff size={18} />
                  ) : (
                    <FiEye size={18} />
                  )}
                </button>
              </div>
            </div>

            {shortPassword && (
              <p className="mt-1 text-sm text-theme-text ">
                Passwords is too short (minimum 8 characters)
              </p>
            )}

            {Confirmpassword && !passwordsMatch && isPasswordValid && (
              <p className="mt-1 text-sm text-theme-text ">
                Passwords do not match
              </p>
            )}

            {Confirmpassword && passwordsMatch && isPasswordValid && (
              <p className="mt-1 text-sm text-theme-text">Passwords match ✓</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="
              w-full py-3
              bg-theme-secondary
              text-theme-text
              font-semibold
              rounded-lg
              hover:bg-opacity-90
              transition-all duration-200
              disabled:opacity-50
              disabled:cursor-not-allowed
              shadow-lg
            "
            >
              {loading ? <SpiningLoader /> : "Sign Up"}
            </button>
          </form>

          <p className="mt-6 text-center text-theme-muted text-sm">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-theme-text hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
