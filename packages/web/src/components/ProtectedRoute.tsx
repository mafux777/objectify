import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import type { ReactNode } from "react";

const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === "true";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user && !AUTH_BYPASS) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
