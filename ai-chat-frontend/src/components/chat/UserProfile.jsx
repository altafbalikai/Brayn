import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../features/auth/authSlice";
import { useNavigate } from "react-router-dom";
import { authService } from "../../api/services/authService";
import ModalPortal from "../ui/ModalPortal";
import { clearCurrentConversation } from "../../features/conversations/conversationSlice";

function UserProfile({ user, onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { loading: authLoading, error: authError } = useSelector(
    (state) => state.auth
  );

  const getInitial = () =>
    user?.name?.charAt(0).toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    "U";

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(oldPassword, newPassword);
      setSuccess("Password updated");
      setTimeout(() => {
        setShowPasswordChange(false);
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update password");
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

  // return (
  //   <div className="fixed inset-0 z-50 flex items-center justify-center">
  //     {/* Overlay */}
  //     <div
  //       className="absolute inset-0 bg-black/60 backdrop-blur-sm"
  //       onClick={onClose}
  //     />

  //     {/* Modal */}
  //     <div
  //       className="
  //         relative
  //         z-10
  //         w-[90vw] max-w-md
  //         rounded-3xl
  //         bg-theme-light
  //         backdrop-blur-xl
  //         border border-theme-secondary
  //         shadow-[0_20px_60px_rgba(0,0,0,0.45)]
  //         overflow-hidden
  //       "
  //     >
  //       {/* Glow ring */}
  //       <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/20" />

  //       {/* Header */}
  //       <div className="flex items-center justify-between px-6 py-4 border-b border-theme-secondary">
  //         <h2 className="text-lg font-semibold text-theme-text">Profile</h2>
  //         <button
  //           onClick={onClose}
  //           className="text-theme-muted hover:text-theme-text transition"
  //         >
  //           ✕
  //         </button>
  //       </div>

  //       {/* Content */}
  //       <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
  //         {!showPasswordChange ? (
  //           <>
  //             {/* User info */}
  //             <div className="flex items-center gap-4">
  //               <div className="w-14 h-14 rounded-full bg-theme-secondary flex items-center justify-center text-xl font-bold text-theme-text">
  //                 {getInitial()}
  //               </div>
  //               <div>
  //                 <div className="text-theme-text font-medium">
  //                   {user?.name || "User"}
  //                 </div>
  //                 <div className="text-theme-muted text-sm">{user?.email}</div>
  //               </div>
  //             </div>

  //             {/* Actions */}
  //             <div className="space-y-3 pt-4">
  //               <button
  //                 onClick={() => setShowPasswordChange(true)}
  //                 className="
  //                   w-full py-2.5 rounded-xl
  //                   bg-theme-secondary
  //                   text-theme-text
  //                   hover:brightness-110
  //                   transition
  //                 "
  //               >
  //                 Change Password
  //               </button>

  //               <button
  //                 onClick={handleLogout}
  //                 className="
  //                   w-full py-2.5 rounded-xl
  //                   bg-theme-accent
  //                   text-theme-text
  //                   hover:brightness-110
  //                   transition
  //                 "
  //               >
  //                 Logout
  //               </button>
  //             </div>
  //           </>
  //         ) : (
  //           <>
  //             <h3 className="text-theme-text font-medium">Change Password</h3>

  //             {error && <div className="text-red-400 text-sm">{error}</div>}
  //             {success && (
  //               <div className="text-green-400 text-sm">{success}</div>
  //             )}

  //             <form onSubmit={handleChangePassword} className="space-y-4">
  //               {[
  //                 {
  //                   label: "Current Password",
  //                   value: oldPassword,
  //                   setter: setOldPassword,
  //                 },
  //                 {
  //                   label: "New Password",
  //                   value: newPassword,
  //                   setter: setNewPassword,
  //                 },
  //                 {
  //                   label: "Confirm Password",
  //                   value: confirmPassword,
  //                   setter: setConfirmPassword,
  //                 },
  //               ].map((field, i) => (
  //                 <div key={i}>
  //                   <label className="text-xs text-theme-muted">
  //                     {field.label}
  //                   </label>
  //                   <input
  //                     type="password"
  //                     value={field.value}
  //                     onChange={(e) => field.setter(e.target.value)}
  //                     disabled={loading}
  //                     className="
  //                       w-full mt-1 px-4 py-2 rounded-xl
  //                       bg-theme-accent
  //                       border border-theme-secondary
  //                       text-theme-text
  //                       outline-none
  //                       focus:ring-2 focus:ring-theme-secondary
  //                     "
  //                   />
  //                 </div>
  //               ))}

  //               <div className="space-y-2 pt-2">
  //                 <button
  //                   type="submit"
  //                   disabled={loading}
  //                   className="
  //                     w-full py-2.5 rounded-xl
  //                     bg-theme-secondary
  //                     text-theme-text
  //                     hover:brightness-110
  //                     disabled:opacity-50
  //                   "
  //                 >
  //                   {loading ? "Saving..." : "Update Password"}
  //                 </button>

  //                 <button
  //                   type="button"
  //                   onClick={() => {
  //                     setShowPasswordChange(false);
  //                     setError("");
  //                     setSuccess("");
  //                   }}
  //                   className="
  //                     w-full py-2.5 rounded-xl
  //                     bg-theme-accent
  //                     text-theme-muted
  //                     hover:text-theme-text
  //                   "
  //                 >
  //                   Back
  //                 </button>
  //               </div>
  //             </form>
  //           </>
  //         )}
  //       </div>
  //     </div>
  //   </div>
  // );

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
        rounded-3xl
        bg-theme-light
        backdrop-blur-xl
        border border-theme-secondary
        shadow-[0_20px_60px_rgba(0,0,0,0.45)]
        overflow-hidden
      "
        >
          {/* Glow ring */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/20" />

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
                  <div className="w-14 h-14 rounded-full bg-theme-secondary flex items-center justify-center text-xl font-bold text-theme-text">
                    {getInitial()}
                  </div>
                  <div>
                    <div className="text-theme-text font-medium">
                      {user?.name || "User"}
                    </div>
                    <div className="text-theme-muted text-sm">
                      {user?.email}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-4">
                  <button
                    onClick={() => setShowPasswordChange(true)}
                    className="
                  w-full py-2.5 rounded-xl
                  bg-theme-secondary
                  text-theme-text
                  hover:brightness-110
                  transition
                "
                  >
                    Change Password
                  </button>

                  <button
                    onClick={handleLogout}
                    disabled={authLoading}
                    className="
                      w-full py-2.5 rounded-xl
                      bg-theme-accent
                      text-theme-text
                      hover:brightness-110
                      transition
                    "
                  >
                    {authLoading ? "Signing out..." : "Logout"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-theme-text font-medium">Change Password</h3>

                {error && <div className="text-red-400 text-sm">{error}</div>}
                {success && (
                  <div className="text-green-400 text-sm">{success}</div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-4">
                  {[
                    {
                      label: "Current Password",
                      value: oldPassword,
                      setter: setOldPassword,
                    },
                    {
                      label: "New Password",
                      value: newPassword,
                      setter: setNewPassword,
                    },
                    {
                      label: "Confirm Password",
                      value: confirmPassword,
                      setter: setConfirmPassword,
                    },
                  ].map((field, i) => (
                    <div key={i}>
                      <label className="text-xs text-theme-muted">
                        {field.label}
                      </label>
                      <input
                        type="password"
                        value={field.value}
                        onChange={(e) => field.setter(e.target.value)}
                        disabled={loading}
                        className="
                      w-full mt-1 px-4 py-2 rounded-xl
                      bg-theme-accent
                      border border-theme-secondary
                      text-theme-text
                      outline-none
                      focus:ring-2 focus:ring-theme-secondary
                    "
                      />
                    </div>
                  ))}

                  <div className="space-y-2 pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="
                    w-full py-2.5 rounded-xl
                    bg-theme-secondary
                    text-theme-text
                    hover:brightness-110
                    disabled:opacity-50
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
