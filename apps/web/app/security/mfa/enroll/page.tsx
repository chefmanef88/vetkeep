import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaEnrollForm } from "./mfa-enroll-form";

export const dynamic = "force-dynamic";

export default async function MfaEnrollPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((factor) => factor.status === "verified")) {
    redirect("/security/mfa/challenge");
  }

  return (
    <main>
      <section className="card stack">
        <h1>Protect your VetKeep account</h1>
        <p className="muted">
          Scan the QR code with an authenticator app. VetKeep requires MFA before private account
          data is available.
        </p>
        <MfaEnrollForm userId={userData.user.id} />
      </section>
    </main>
  );
}
