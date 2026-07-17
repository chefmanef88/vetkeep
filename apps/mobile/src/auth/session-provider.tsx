import type { Session } from "@supabase/supabase-js";
import type { Database } from "@vetkeep/database/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { log } from "@vetkeep/observability";
import { supabase } from "@/lib/supabase";

type VetRow = Database["public"]["Tables"]["vets"]["Row"];
export type MfaState = "enroll" | "challenge" | "ready";

type SessionContextValue = {
  session: Session | null;
  profile: VetRow | null;
  mfaState: MfaState;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  refreshMfaState: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<VetRow | null>(null);
  const [mfaState, setMfaState] = useState<MfaState>("enroll");
  const [loading, setLoading] = useState(true);

  const loadProfileForSession = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.from("vets").select("*").maybeSingle();
    if (error) log("warn", "mobile.profile_load_failed", { code: error.code });
    setProfile(data ?? null);
  }, []);

  const loadMfaState = useCallback(
    async (currentSession: Session | null) => {
      if (!currentSession) {
        setMfaState("enroll");
        setProfile(null);
        return;
      }
      const [{ data: factors }, { data: assurance }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      const verified = factors?.totp.some((factor) => factor.status === "verified") ?? false;
      if (!verified) {
        setMfaState("enroll");
        setProfile(null);
      } else if (assurance?.currentLevel !== "aal2") {
        setMfaState("challenge");
        setProfile(null);
      } else {
        setMfaState("ready");
        await loadProfileForSession(currentSession);
      }
    },
    [loadProfileForSession]
  );

  const refreshMfaState = useCallback(async () => {
    await loadMfaState(session);
  }, [loadMfaState, session]);

  const refreshProfile = useCallback(async () => {
    if (mfaState === "ready") await loadProfileForSession(session);
  }, [loadProfileForSession, mfaState, session]);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadMfaState(data.session);
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setMfaState("enroll");
      }
      queueMicrotask(() => void loadMfaState(nextSession));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadMfaState]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      profile,
      mfaState,
      loading,
      refreshProfile,
      refreshMfaState
    }),
    [session, profile, mfaState, loading, refreshProfile, refreshMfaState]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
