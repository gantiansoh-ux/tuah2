"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import type { Profile } from "@/lib/types";

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

let supabase: SupabaseClient | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      try {
        supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        );
      } catch (e) {
        console.warn('Supabase not configured yet');
      }
    }
    if (!supabase) {
      setLoading(false);
      return;
    }

    const s = supabase;
    s.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(s, session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = s.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(s, session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(s: SupabaseClient, userId: string) {
    const { data } = await s
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data as Profile | null);
  }

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
      // No useRouter - caller should handle redirect
    }
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
