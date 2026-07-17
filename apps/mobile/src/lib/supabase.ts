import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@vetkeep/database/types";
import { getMobileEnv } from "./env";
import { chunkedSecureStore } from "@/security/chunked-secure-store";

const env = getMobileEnv();

export const supabase = createClient<Database>(env.url, env.key, {
  auth: {
    storage: chunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
