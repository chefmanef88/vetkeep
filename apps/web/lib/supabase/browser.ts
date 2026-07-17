import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@vetkeep/database/types";
import { getPublicEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  const env = getPublicEnv();
  client ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  return client;
}
