"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthValue {
  session: Session | null;
  isReferee: boolean;
  /** True until the stored session (if any) has been checked. */
  checking: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReferee, setIsReferee] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const resolve = async (s: Session | null) => {
      setSession(s);
      if (!s) {
        setIsReferee(false);
        setChecking(false);
        return;
      }
      const { data } = await supabase.rpc("is_referee");
      if (!cancelled) {
        setIsReferee(data === true);
        setChecking(false);
      }
    };
    void supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      setTimeout(() => void resolve(s), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      isReferee,
      checking,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isReferee, checking],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
