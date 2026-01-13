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
        <div className="text-theme-text">Checking session...</div>
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
