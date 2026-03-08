import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === "true";

interface AuthState {
  session: Session | null;
  user: User | null;
  credits: number | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Dev bypass: skip all Supabase auth, use unauthenticated code paths
  if (AUTH_BYPASS) {
    return (
      <AuthContext.Provider
        value={{
          session: null,
          user: null,
          credits: null,
          isAdmin: true,
          loading: false,
          signOut: async () => {},
          refreshCredits: async () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [role, setRole] = useState<string>("user");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch credits when user changes
  useEffect(() => {
    if (session?.user) {
      refreshCredits();
    } else {
      setCredits(null);
    }
  }, [session?.user?.id]);

  async function refreshCredits() {
    if (!session?.user) return;
    const { data } = await supabase
      .from("profiles")
      .select("credits, role")
      .eq("id", session.user.id)
      .single();
    if (data) {
      setCredits(data.credits);
      setRole(data.role ?? "user");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setCredits(null);
    setRole("user");
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        credits,
        isAdmin: role === "admin",
        loading,
        signOut,
        refreshCredits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
