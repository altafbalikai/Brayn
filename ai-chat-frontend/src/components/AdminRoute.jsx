import { Navigate, Link } from "react-router-dom";
import { useSelector } from "react-redux";

export default function AdminRoute({ children }) {
  const { user } = useSelector((state) => state.auth);

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-theme-appbg text-theme-text">
        <h1 className="text-5xl font-bold text-red-500">403</h1>
        <p className="mt-4 text-lg">Access Denied</p>
        <p className="text-sm text-theme-muted">
          You don’t have permission to view this page.
        </p>

        <Link
          to="/chat"
          className="mt-6 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white"
        >
          Go Home
        </Link>
      </div>
    );
  }

  return children;
}
