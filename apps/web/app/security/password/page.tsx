import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

/**
 * Setting a new password after following a recovery link (brief §3).
 *
 * Reached from /auth/confirm, which has already verified the token and put a
 * session in place. That session is the proof of identity here: someone who can
 * read the mailbox on the account may set a new password on it.
 *
 * Deliberately not behind the MFA gate. A veterinarian who has forgotten their
 * password still has their second factor, and will be challenged for it on the
 * next sign-in — but requiring it before the password can be set would strand
 * anyone whose password loss and factor loss happened together, with no route
 * back except support.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set a new password"
};

export default async function PasswordPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // No session means the link was never followed, or it expired. Sending them
  // to sign in is the only honest answer: this page cannot identify them.
  if (!user) redirect("/login?error=recovery_expired");

  return (
    <main className="stack">
      <section className="card stack">
        <h1>Set a new password</h1>
        <p className="muted">
          For {user.email}. Once it is saved you can sign in with it, on this device or on your
          phone.
        </p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
