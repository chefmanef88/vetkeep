export function getMobileEnv() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Expo Supabase environment variables");
  /**
   * Where the web application answers: passport links point at it, and a
   * password reset link has to land somewhere that can verify the token and
   * take a new password. Handling that in the phone would mean native deep
   * links for an event that happens once in a while.
   *
   * The fallback is the address actually deployed, and matches site_url in
   * supabase/config.toml. It used to be vetkeep.app, a domain that does not
   * answer — which fails silently in the worst way available: a passport link
   * handed to a buyer, or a reset email, that simply goes nowhere.
   */
  const webBaseUrl = (
    process.env["EXPO_PUBLIC_PASSPORT_BASE_URL"] ?? "https://vetkeep-liart.vercel.app"
  ).replace(/\/+$/, "");
  return { url, key, webBaseUrl };
}
