// import { useSelector } from "react-redux";
// import { Navigate } from "react-router-dom";

// /**
//  * ProtectedRoute - Ensures only authenticated users can access protected pages
//  * Redirects unauthenticated users to /login
//  * @param {React.ReactNode} children - The component to render if authenticated
//  */
// export default function ProtectedRoute({ children }) {
//   const { user } = useSelector((state) => state.auth);

//   if (!user) {
//     return <Navigate to="/login" replace />;
//   }

//   return children;
// }

import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { GiBrain } from "react-icons/gi";

// /**
//  * ProtectedRoute - Ensures only authenticated users can access protected pages
//  * Redirects unauthenticated users to /login
//  * @param {React.ReactNode} children - The component to render if authenticated
//  */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, initialized } = useSelector((state) => state.auth);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-dark">
        <div className="flex flex-col items-center gap-3">
          <GiBrain
            size={42}
            className="text-theme-text animate-pulse drop-shadow-[0_0_12px_rgba(120,180,255,0.35)]"
          />

          <h1 className="text-lg font-semibold tracking-wide text-theme-text">
            Brayn
          </h1>

          <p className="text-sm text-theme-muted tracking-wide">
            Checking your session
            <span className="inline-block animate-pulse">.</span>
            <span className="inline-block animate-pulse delay-150">.</span>
            <span className="inline-block animate-pulse delay-300">.</span>
          </p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// export default function ProtectedRoute({ children }) {
//   const { user, initialized } = useSelector((state) => state.auth);

//   // ⛔ Do NOT redirect until auth is fully initialized
//   if (!initialized) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-theme-dark">
//         <div className="text-theme-accent">Checking session...</div>
//       </div>
//     );
//   }

//   if (!user) {
//     return <Navigate to="/login" replace />;
//   }

//   return children;
// }
