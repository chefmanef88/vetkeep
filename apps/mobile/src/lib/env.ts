export function getMobileEnv() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Expo Supabase environment variables");
  /**
   * Where the web application answers. A password reset link has to land
   * somewhere that can verify the token and take a new password, and that is
   * the web app — handling it in the phone would mean native deep links for an
   * event that happens once in a while.
   *
   * Shares EXPO_PUBLIC_PASSPORT_BASE_URL because it is the same deployment;
   * passport.ts reads the variable directly for its own link building.
   */
  const webBaseUrl = (
    process.env["EXPO_PUBLIC_PASSPORT_BASE_URL"] ?? "https://vetkeep.app"
  ).replace(/\/+$/, "");
  return { url, key, webBaseUrl };
}
