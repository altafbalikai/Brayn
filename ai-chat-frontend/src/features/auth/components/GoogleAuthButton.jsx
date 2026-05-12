import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { googleLogin } from "../authSlice";

export default function GoogleAuthButton() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const handleSuccess = async (credentialResponse) => {
    setError("");

    const action = await dispatch(googleLogin(credentialResponse.credential));

    if (googleLogin.fulfilled.match(action)) {
      navigate("/chat", { replace: true });
      return;
    }

    setError(action.payload?.message || "Google sign-in failed");
  };

  const handleError = () => {
    setError("Google sign-in failed");
  };

  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <GoogleLogin onSuccess={handleSuccess} onError={handleError} />
      {error && (
        <p className="w-full rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-3 py-2 text-sm text-theme-text">
          {error}
        </p>
      )}
    </div>
  );
}
