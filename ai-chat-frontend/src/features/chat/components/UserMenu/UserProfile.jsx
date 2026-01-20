import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../../../features/auth/authSlice";
import { useNavigate } from "react-router-dom";
import { authService } from "../../../../api/services/authService";
import ModalPortal from "../../../../components/ui/ModalPortal";
import { clearCurrentConversation } from "../../../../features/conversations/conversationSlice";
import { FiEye, FiEyeOff } from "react-icons/fi";

function UserProfile({ user, onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { loading: authLoading, error: authError } = useSelector(
    (state) => state.auth
  );

  const shortPassword = newPassword.length > 0 && newPassword.length < 8;
  const isPasswordValid = newPassword.length >= 8;
  const passwordsMatch =
    newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit =
    currentPassword.length > 0 && isPasswordValid && passwordsMatch && !loading;
  // State for eye toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const getInitial = () =>
    user?.name?.charAt(0).toUpperCase() + user?.name?.charAt(1).toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    "U";
  console.log(user);

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (loading) return; // prevent double submit

    setError("");
    setSuccess("");

    /* ----------------------------
     Client-side validation
  ---------------------------- */
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }

    /* ----------------------------
     API call
  ---------------------------- */
    setLoading(true);

    try {
      await authService.changePassword(currentPassword, newPassword);

      setSuccess("Password updated successfully");

      // UX: auto-close + reset
      setTimeout(() => {
        setShowPasswordChange(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 1500);
    } catch (err) {
      /**
       * Normalize errors from backend / network
       */
      if (!err.response) {
        setError("Network error. Please try again.");
      } else if (err.response.status === 401) {
        setError("Session expired. Please log in again.");
      } else if (err.response.status === 400) {
        setError(err.response.data?.error || "Invalid password details");
      } else {
        setError("Failed to update password. Please try later.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await dispatch(logout());

    dispatch(clearCurrentConversation());

    navigate("/login");
    onClose();
  };

  return (
    <ModalPortal>
      <div
        className="
      fixed inset-0 z-50
      grid place-items-center
      p-4 sm:p-6
    "
      >
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div
          className="
        relative
        z-10
        w-full max-w-md
        rounded-2xl
        bg-theme-light
        backdrop-blur-xl
        border border-theme-light
        shadow-[0_20px_60px_rgba(0,0,0,0.45)]
        overflow-hidden
      "
        >
          {/* Glow ring */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-theme-secondary">
            <h2 className="text-lg font-semibold text-theme-text">Profile</h2>
            <button
              onClick={onClose}
              className="text-theme-muted hover:text-theme-text transition"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {!showPasswordChange ? (
              <>
                {/* User info */}
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="relative">
                    <div
                      className="
      w-14 h-14 rounded-full 
      bg-theme-secondary 
      flex items-center justify-center 
      text-xl font-semibold 
      text-theme-text
      ring-2 ring-theme-secondary/40
    "
                    >
                      {getInitial()}
                    </div>

                    {/* Online indicator (optional) */}
                    <span
                      className="
      absolute bottom-0 right-0 
      h-3 w-3 rounded-full 
      bg-green-500 
      border-2 border-theme-appbg
    "
                    />
                  </div>

                  {/* User details */}
                  <div className="min-w-0">
                    <div className="text-theme-text font-medium truncate">
                      {user?.name || "User"}
                    </div>

                    <div className="text-theme-muted text-sm truncate">
                      {user?.email}
                    </div>

                    {/* Optional role / plan */}
                    <div className="text-[11px] text-theme-muted mt-0.5">
                      Personal Account
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-theme-secondary my-4" />

                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={() => setShowPasswordChange(true)}
                    className="
                      w-full py-2.5 rounded-lg
                      text-sm font-medium
                      bg-theme-accent
                      text-theme-text
                      border border-theme-secondary
                      hover:bg-theme-secondary
                      hover:brightness-110
                      transition-colors
                      focus:outline-none
                      focus:ring-2
                      focus:ring-theme-accent/40
                    "
                  >
                    Change Password
                  </button>

                  {/* <button
                    onClick={handleLogout}
                    disabled={authLoading}
                    className="
                      w-full py-2.5 rounded-lg
                      bg-theme-accent
                      text-theme-text
                      hover:brightness-110
                      transition
                      border border-theme-secondary
                      hover:bg-theme-secondary
                    "
                  >
                    {authLoading ? "Signing out..." : "Logout"}
                  </button> */}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-theme-text font-medium mb-4">
                  Change Password
                </h3>

                {error && (
                  <div className="mb-4 p-3 bg-theme-danger/10 border border-theme-danger/30 rounded-lg text-theme-text text-sm">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="mb-4 p-3 bg-theme-danger/10 border border-theme-danger/30 rounded-lg text-theme-text text-sm">
                    {success}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-5">
                  {/* Current Password */}
                  <div>
                    <label className="block text-sm font-medium text-theme-text mb-2">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => {
                          setCurrentPassword(e.target.value);
                          setError("");
                        }}
                        required
                        className="
            w-full px-4 py-3
            bg-theme-accent
            border border-theme-secondary
            rounded-lg
            text-theme-text
            focus:outline-none
            focus:ring-2 focus:ring-theme-secondary
          "
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-text"
                      >
                        {showCurrentPassword ? (
                          <FiEyeOff size={18} />
                        ) : (
                          <FiEye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-theme-text mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setError("");
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
            focus:outline-none
            focus:ring-2 focus:ring-theme-secondary
          "
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-text"
                      >
                        {showNewPassword ? (
                          <FiEyeOff size={18} />
                        ) : (
                          <FiEye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-medium text-theme-text mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError("");
                        }}
                        required
                        minLength={8}
                        placeholder="Re-enter new password"
                        className="
            w-full px-4 py-3
            bg-theme-accent
            border border-theme-secondary
            rounded-lg
            text-theme-text
            focus:outline-none
            focus:ring-2 focus:ring-theme-secondary
          "
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-text"
                      >
                        {showConfirmPassword ? (
                          <FiEyeOff size={18} />
                        ) : (
                          <FiEye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Validation messages */}
                  {shortPassword && (
                    <p className="text-sm text-theme-text">
                      Password is too short (minimum 8 characters)
                    </p>
                  )}

                  {confirmPassword && !passwordsMatch && isPasswordValid && (
                    <p className="text-sm text-theme-text">
                      Passwords do not match
                    </p>
                  )}

                  {confirmPassword && passwordsMatch && isPasswordValid && (
                    <p className="text-sm text-theme-text">Passwords match ✓</p>
                  )}

                  {/* Actions */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="
          w-full py-2.5 rounded-xl
          bg-theme-secondary
          text-theme-text
          hover:brightness-110
          disabled:opacity-50
          disabled:cursor-not-allowed
        "
                    >
                      {loading ? "Saving..." : "Update Password"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordChange(false);
                        setError("");
                        setSuccess("");
                      }}
                      className="
          w-full py-2.5 rounded-xl
          bg-theme-accent
          text-theme-muted
          hover:text-theme-text
        "
                    >
                      Back
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default React.memo(UserProfile);
