import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaChallengeForm } from "./mfa-challenge-form";

export const dynamic = "force-dynamic";

export default async function MfaChallengePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const [{ data: factors }, { data: assurance }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (!factors?.totp.some((factor) => factor.status === "verified"))
    redirect("/security/mfa/enroll");
  if (assurance?.currentLevel === "aal2") redirect("/dashboard");

  return (
    <main>
      <section className="card stack">
        <h1>Enter your authenticator code</h1>
        <MfaChallengeForm />
      </section>
    </main>
  );
}
