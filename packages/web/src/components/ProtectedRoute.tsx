import { useAuth } from "../lib/auth-context.js";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  // Anonymous users have real sessions now — no redirect needed
  return <>{children}</>;
}
