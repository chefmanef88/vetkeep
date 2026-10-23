import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@vetkeep/database/types";
import { getMobileEnv } from "./env";
import { chunkedSecureStore } from "@/security/chunked-secure-store";
import { offlineAwareFetch } from "@/dev/offline-switch";

const env = getMobileEnv();

export const supabase = createClient<Database>(env.url, env.key, {
  auth: {
    storage: chunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  // Development only. The switch behind this makes the database unreachable
  // without touching the network, which is the only way to test the offline
  // paths on a phone that is itself the network it is tethered to. __DEV__ is
  // replaced at build time, so a release build is left with the default fetch
  // and none of this reaches it.
  ...(__DEV__ ? { global: { fetch: offlineAwareFetch } } : {})
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
