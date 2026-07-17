import { redirect } from "next/navigation";
import { requireMfa } from "@/lib/auth/require-mfa";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { supabase } = await requireMfa();

  const { data: profile } = await supabase.from("vets").select("id").maybeSingle();
  if (profile) redirect("/dashboard");

  return (
    <main>
      <section className="card stack">
        <h1>Complete veterinarian onboarding</h1>
        <p className="muted">
          Licence verification remains pending until VetKeep completes its professional review.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
