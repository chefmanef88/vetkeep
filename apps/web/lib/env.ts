import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  /**
   * Where someone writes who cannot sign in to close their own account.
   *
   * Optional so the application runs without it, but /delete-account is not
   * complete until it is set: Google Play requires a deletion route for a user
   * who has lost access, and an address that does not exist is worse than none
   * because requests go into a void. The page omits that route entirely rather
   * than printing an address nobody reads.
   */
  // .catch rather than a bare .optional(): a typo here must not take down
  // /delete-account, which is a public page a store reviewer and a locked-out
  // veterinarian both need to reach. An unparseable address becomes no address,
  // and the page drops that section instead of returning a 500.
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().optional().catch(undefined)
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL
  });
}
