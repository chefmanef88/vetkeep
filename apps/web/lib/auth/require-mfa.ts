import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireMfa() {
  const supabase = await createClient();
  const [{ data: userData }, { data: factors }, { data: assurance }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);

  if (!userData.user) redirect("/login");
  const verified = factors?.totp.some((factor) => factor.status === "verified") ?? false;
  if (!verified) redirect("/security/mfa/enroll");
  if (assurance?.currentLevel !== "aal2") redirect("/security/mfa/challenge");
  return { supabase, user: userData.user };
}
