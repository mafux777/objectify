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
  isAnonymous: boolean;
  walletAddress: string | null;
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
          isAnonymous: false,
          walletAddress: null,
          loading: false,
          signOut: async () => {},
          refreshCredits: async () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  // Detect identity_already_exists error synchronously during render.
  // This MUST run before children render, because <Navigate to="/app" replace />
  // on the "/" route would strip the query params before a useEffect could read them.
  const [handlingOAuthError] = useState(() => {
    const errorCode =
      new URLSearchParams(window.location.search).get("error_code") ||
      new URLSearchParams(window.location.hash.slice(1)).get("error_code");
    if (errorCode === "identity_already_exists") {
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    }
    return false;
  });

  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [role, setRole] = useState<string>("user");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (handlingOAuthError) {
      // Retry as regular sign-in (discards anonymous session, uses existing account)
      supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/app` },
      });
      return () => {};
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setLoading(false);
      } else {
        // No session — sign in anonymously
        supabase.auth.signInAnonymously().then(({ data, error }) => {
          if (error) {
            console.error("Anonymous sign-in failed:", error);
          }
          if (data.session) {
            setSession(data.session);
          }
          setLoading(false);
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "SIGNED_OUT") {
        // Auto-create a new anonymous session so the user always has a wallet.
        supabase.auth.signInAnonymously();
      }
      if (event === "PASSWORD_RECOVERY") {
        // Redirect to settings page so the user can set a new password.
        window.location.href = "/settings";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch credits + wallet when user changes
  useEffect(() => {
    if (session?.user) {
      refreshCredits();
      fetchWallet();
    } else {
      setCredits(null);
      setWalletAddress(null);
    }
  }, [session?.user?.id]);

  async function refreshCredits() {
    if (!session?.user) return;
    const { data } = await supabase
      .from("profiles")
      .select("credits, role, wallet_address")
      .eq("id", session.user.id)
      .single();
    if (data) {
      setCredits(data.credits);
      setRole(data.role ?? "user");
      if (data.wallet_address) {
        setWalletAddress(data.wallet_address);
      }
    }
  }

  async function fetchWallet() {
    if (!session?.user) return;

    // Check if wallet already on profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", session.user.id)
      .single();

    if (profile?.wallet_address) {
      setWalletAddress(profile.wallet_address);
      return;
    }

    // No wallet yet — create one via edge function
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-wallet",
        { method: "POST" },
      );
      if (error) {
        console.error("Wallet creation failed:", error);
        return;
      }
      if (data?.address) {
        setWalletAddress(data.address);
      }
    } catch (err) {
      console.error("Wallet creation error:", err);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setCredits(null);
    setRole("user");
    setWalletAddress(null);
  }

  const user = session?.user ?? null;
  const isAnonymous = user?.is_anonymous === true;

  // While handling the OAuth error redirect, show nothing — signInWithOAuth
  // will redirect to Google momentarily.
  if (handlingOAuthError) {
    return <div className="loading-screen">Signing in...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        credits,
        isAdmin: role === "admin",
        isAnonymous,
        walletAddress,
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
